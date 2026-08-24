-- ============================================================================
-- MUVET · App Médico — Migración 0025: Suplantación (en disputa), soporte y
-- bandeja de revisión manual
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0024.
--
-- Contexto (confirmado con el fundador):
--   1. Si otro usuario intenta registrarse con los datos de un profesional ya
--      existente (posible suplantación), NO puede usar las funciones de la
--      app: solo actualizar su perfil y contactar a soporte para resolver la
--      controversia. Nuevo estado: 'en_disputa'.
--   2. Si la matrícula simplemente no se pudo verificar por cualquier otra
--      razón (no aparece, respuesta ambigua, error de red), el médico usa la
--      app con normalidad mientras se valida a mano. Eso ya era el
--      comportamiento de 'pendiente' y NO cambia: D-541 sigue intacto — sin
--      matrícula validada no puede activar DISPONIBLE.
--
-- Dos señales cuentan como posible suplantación:
--   (a) la matrícula ya está registrada por OTRA cuenta de MUVET;
--   (b) la matrícula existe en el registro del Consejo pero a nombre de otra
--       persona (antes se registraba como 'nombre_no_concuerda').
--
-- ============================================================================
-- AGUJERO PREEXISTENTE QUE ESTA MIGRACIÓN CIERRA
-- ============================================================================
-- `perfiles_update_own` (0001) es `for update using (auth.uid() = id)` SIN
-- with check y sin restricción de columnas. Es decir: hasta ahora cualquier
-- médico autenticado podía ejecutar desde el cliente
--
--     update perfiles set estado_validacion = 'validado' where id = <su id>
--
-- y auto-validarse. Eso vaciaba D-541 por completo (el toggle DISPONIBLE solo
-- lee esa columna) y volvería puramente decorativo el bloqueo de 'en_disputa'
-- que introduce esta migración: al suplantador le bastaría con reescribir su
-- propio estado. El trigger de abajo hace que `estado_validacion` y
-- `fecha_validacion` solo los pueda escribir el service role (la Edge Function
-- verificar-comvezcol) o el fundador desde el Dashboard.
-- ============================================================================

-- ============================================================================
-- 1. Nuevo estado 'en_disputa'
-- ============================================================================
alter table perfiles drop constraint if exists perfiles_estado_validacion_check;
alter table perfiles add constraint perfiles_estado_validacion_check
  check (estado_validacion in ('pendiente', 'validado', 'rechazado', 'en_disputa'));

-- Nuevo resultado 'duplicado' en la bitácora (0024).
alter table validaciones_comvezcol drop constraint if exists validaciones_comvezcol_resultado_check;
alter table validaciones_comvezcol add constraint validaciones_comvezcol_resultado_check
  check (resultado in ('validado', 'sin_coincidencia', 'ambiguo', 'error', 'duplicado'));

-- ============================================================================
-- 2. Trigger: solo el service role decide el estado de validación
-- ============================================================================
-- Reglas para escrituras que NO vienen del service role ni del Dashboard:
--   · No puede tocar estado_validacion ni fecha_validacion directamente.
--   · Si cambia la matrícula, el estado vuelve solo a 'pendiente' (D-541), sin
--     depender de que el cliente lo mande — salvo que esté 'en_disputa', que
--     se mantiene hasta que una persona resuelva la controversia (si no, al
--     suplantador le bastaría con reescribir su matrícula para salir del
--     bloqueo).
--   · No puede activar `disponible` sin estar 'validado' (D-541 en backend, no
--     solo en el toggle de la UI).
create or replace function fn_proteger_estado_validacion()
returns trigger as $$
declare
  v_privilegiado boolean;
begin
  v_privilegiado := coalesce(auth.role(), '') = 'service_role'
                    or current_user in ('postgres', 'supabase_admin');

  if v_privilegiado then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Nadie se registra ya validado ni ya en disputa.
    if new.rol = 'medico' then
      new.estado_validacion := 'pendiente';
    end if;
    new.fecha_validacion := null;
    if new.disponible then
      new.disponible := false;
    end if;
    return new;
  end if;

  if new.estado_validacion is distinct from old.estado_validacion then
    raise exception 'estado_validacion solo lo escribe la verificación COMVEZCOL (D-541)';
  end if;
  if new.fecha_validacion is distinct from old.fecha_validacion then
    raise exception 'fecha_validacion solo lo escribe la verificación COMVEZCOL (D-541)';
  end if;

  -- D-541: cualquier cambio de matrícula O de carné vuelve el estado a
  -- 'pendiente'. Antes lo forzaba el cliente (MatriculaSection.jsx); ahora lo
  -- garantiza la base de datos, así que ya no depende de que la app lo mande.
  if new.matricula_comvezcol is distinct from old.matricula_comvezcol
     or new.carne_url is distinct from old.carne_url then
    if old.estado_validacion = 'en_disputa' then
      new.estado_validacion := 'en_disputa';
    else
      new.estado_validacion := 'pendiente';
      new.fecha_validacion := null;
    end if;
  end if;

  if new.disponible and not old.disponible and new.estado_validacion is distinct from 'validado' then
    raise exception 'No puedes activar disponibilidad sin matrícula validada (D-541)';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_proteger_estado_validacion on perfiles;
create trigger trg_proteger_estado_validacion
  before insert or update on perfiles
  for each row
  execute function fn_proteger_estado_validacion();

-- ============================================================================
-- 3. Helper: ¿el usuario actual está en disputa?
-- ============================================================================
-- security definer para que pueda leer `perfiles` sin chocar con la RLS de la
-- propia tabla al evaluarse dentro de otras policies.
create or replace function perfil_en_disputa()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and estado_validacion = 'en_disputa'
  );
$$;

-- ============================================================================
-- 4. Bloqueo de las funciones de la app para quien está en disputa
-- ============================================================================
-- Backend, no solo UI (mismo criterio que D-043/D-064/D-541). Se bloquea
-- CREAR/OPERAR; leer y actualizar el propio perfil sigue permitido, y los
-- tickets de soporte tienen su propia policy más abajo.

-- Relevo: no publica ni contacta.
drop policy if exists "relevo_publicaciones_write_autor" on relevo_publicaciones;
create policy "relevo_publicaciones_write_autor" on relevo_publicaciones
  for insert with check (auth.uid() = autor_id and not perfil_en_disputa());

drop policy if exists "relevo_mensajes_insert_remitente" on relevo_mensajes;
create policy "relevo_mensajes_insert_remitente" on relevo_mensajes
  for insert with check (auth.uid() = remitente_id and not perfil_en_disputa());

-- Cobertura de Servicio (0023): no publica ni chatea.
drop policy if exists "cobertura_solicitudes_insert_medico" on cobertura_solicitudes;
create policy "cobertura_solicitudes_insert_medico" on cobertura_solicitudes
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'medico')
    and not perfil_en_disputa()
  );

drop policy if exists "cobertura_mensajes_insert_participantes" on cobertura_mensajes;
create policy "cobertura_mensajes_insert_participantes" on cobertura_mensajes
  for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and not perfil_en_disputa()
    and exists (
      select 1 from cobertura_solicitudes s
      where s.id = solicitud_id
        and s.estado = 'cubierta'
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );

-- Catálogo de servicios (N-27): no configura precios ni servicios.
drop policy if exists "catalogo_insert_own" on catalogo_servicios_medico;
create policy "catalogo_insert_own" on catalogo_servicios_medico
  for insert with check (auth.uid() = medico_id and not perfil_en_disputa());

drop policy if exists "catalogo_update_own" on catalogo_servicios_medico;
create policy "catalogo_update_own" on catalogo_servicios_medico
  for update using (auth.uid() = medico_id and not perfil_en_disputa());

-- Flujo clínico: no acepta ni atiende servicios.
drop policy if exists "servicios_update_medico" on servicios;
create policy "servicios_update_medico" on servicios
  for update using (auth.uid() = medico_id and not perfil_en_disputa());

-- ============================================================================
-- 5. soporte_tickets — el canal para resolver la controversia
-- ============================================================================
create table if not exists soporte_tickets (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  motivo text not null default 'validacion_matricula',
  mensaje text not null,
  estado text not null default 'abierto' check (estado in ('abierto', 'en_proceso', 'cerrado')),
  created_at timestamptz not null default now()
);

create index if not exists soporte_tickets_perfil_idx on soporte_tickets (perfil_id, created_at desc);
create index if not exists soporte_tickets_estado_idx on soporte_tickets (estado);

alter table soporte_tickets enable row level security;

-- A propósito SIN `not perfil_en_disputa()`: contactar a soporte es
-- justamente lo que sí debe poder hacer quien está en disputa.
drop policy if exists "soporte_tickets_insert_own" on soporte_tickets;
create policy "soporte_tickets_insert_own" on soporte_tickets
  for insert with check (perfil_id = auth.uid());

drop policy if exists "soporte_tickets_select_own" on soporte_tickets;
create policy "soporte_tickets_select_own" on soporte_tickets
  for select using (perfil_id = auth.uid());

-- Sin update/delete para el cliente: el estado del ticket lo maneja el
-- fundador desde el Dashboard.

-- ============================================================================
-- 6. revision_matriculas_pendientes — la bandeja de revisión manual
-- ============================================================================
-- Es DONDE el fundador se entera de los casos y consulta los datos para
-- validar a mano: Supabase Dashboard → SQL Editor →
--
--     select * from revision_matriculas_pendientes;
--
-- Trae, por médico pendiente o en disputa: sus datos, el último intento
-- automático con su motivo, con qué otra cuenta choca la matrícula (si aplica)
-- y cuántos tickets de soporte abiertos tiene.
--
-- Para aprobar a mano, desde el mismo SQL Editor (el trigger de arriba permite
-- estas escrituras porque el Dashboard corre como `postgres`):
--
--     update perfiles set estado_validacion = 'validado', fecha_validacion = now()
--     where id = '<uuid del médico>';
--
-- security_invoker = true + revoke: la vista NO queda expuesta a los usuarios
-- de la app (expondría datos de otros médicos). Solo la leen el service role y
-- el Dashboard. Mismo criterio que la corrección de 0007_fix_security_invoker.
create or replace view revision_matriculas_pendientes
with (security_invoker = true) as
select
  p.id                                as medico_id,
  p.nombre_completo,
  p.telefono,
  p.matricula_comvezcol,
  p.estado_validacion,
  p.carne_url,
  p.created_at                        as registrado_at,

  v.resultado                         as ultimo_resultado,
  v.detalle ->> 'motivo'              as ultimo_motivo,
  v.nombre_encontrado                 as nombre_en_el_consejo,
  v.created_at                        as ultimo_intento_at,

  -- Con qué otras cuentas de MUVET choca la matrícula (caso duplicado).
  (
    select array_agg(otro.id)
    from perfiles otro
    where otro.matricula_comvezcol = p.matricula_comvezcol
      and otro.id <> p.id
  )                                   as cuentas_en_conflicto,

  (
    select count(*)
    from soporte_tickets t
    where t.perfil_id = p.id and t.estado = 'abierto'
  )                                   as tickets_abiertos

from perfiles p
left join lateral (
  select * from validaciones_comvezcol v2
  where v2.medico_id = p.id
  order by v2.created_at desc
  limit 1
) v on true
where p.rol = 'medico'
  and p.estado_validacion in ('pendiente', 'en_disputa')
order by
  -- Primero las disputas: son las que dejan a alguien bloqueado.
  case when p.estado_validacion = 'en_disputa' then 0 else 1 end,
  p.created_at;

revoke all on revision_matriculas_pendientes from anon, authenticated;
