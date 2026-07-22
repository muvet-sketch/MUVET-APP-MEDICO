-- ============================================================================
-- MUVET · App Médico — Migración 0004: Solicitudes reales + servicios +
-- función de aceptación (Fase 3)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
-- No modifica 0001/0002/0003.
--
-- Reglas de negocio referenciadas (ver CLAUDE.md):
--   D-064  Dirección exacta del tutor NUNCA visible antes de aceptación.
--   El timer de 60s se valida en backend, nunca solo en frontend.
--
-- -- SUPUESTO — diseño de solicitudes_direccion:
-- El despacho de Fase 3 pide ajustar la RLS de `solicitudes` para que el
-- select de la tabla completa (incluyendo direccion_exacta) solo sea posible
-- si medico_id = auth.uid() Y estado != 'pendiente'. Aplicado tal cual, eso
-- ROMPE la detección por Realtime: Supabase Realtime autoriza cada evento de
-- postgres_changes evaluando la política RLS de SELECT del suscriptor sobre
-- la tabla base; si esa política bloquea las filas 'pendiente' para todo el
-- mundo (medico_id aún es null en ese momento), ningún médico recibiría el
-- INSERT en tiempo real y N-3 nunca se activaría solo.
--
-- Además, aunque la política lo permitiera, `postgres_changes` no soporta
-- enmascarado por columna: si la fila es visible, TODAS sus columnas viajan
-- por el websocket — incluida direccion_exacta — sin importar qué columnas
-- pida el cliente. Es decir, con direccion_exacta viviendo en `solicitudes`,
-- no existe una política de RLS que permita "ver que la solicitud existe"
-- sin exponer también la dirección en el payload de red apenas se habilita
-- el acceso necesario para Realtime.
--
-- Solución adoptada: mover direccion_exacta a una tabla aparte
-- (`solicitudes_direccion`), con RLS que SOLO permite verla al médico dueño
-- después de la aceptación. `solicitudes` (la tabla que sí viaja por
-- Realtime) nunca contiene la dirección: `aceptar_solicitud()` la copia a
-- `solicitudes.direccion_exacta` recién en el momento de la aceptación, que
-- es exactamente cuándo el despacho pide que se vuelva legible. Esto cumple
-- el criterio de aceptación "la dirección exacta NUNCA aparece en el payload
-- que llega a N-3" de forma verificable por inspección de red, no solo de UI.
-- ============================================================================

-- ============================================================================
-- solicitudes: columnas faltantes
-- ============================================================================
alter table solicitudes
  add column if not exists primera_vez_paciente boolean not null default false;

-- expira_en ya existe desde 0001. Se completa automáticamente al insertar
-- (created_at + 60s) si el creador de la solicitud no la especifica.
create or replace function fn_set_expira_en_solicitud()
returns trigger as $$
begin
  if new.estado is null then
    new.estado := 'pendiente';
  end if;
  if new.expira_en is null then
    -- new.created_at ya fue resuelto por su DEFAULT antes de este trigger.
    new.expira_en := new.created_at + interval '60 seconds';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_expira_en_solicitud on solicitudes;
create trigger trg_set_expira_en_solicitud
  before insert on solicitudes
  for each row
  execute function fn_set_expira_en_solicitud();

-- ============================================================================
-- solicitudes_direccion — ver nota D-064 arriba
-- ============================================================================
create table if not exists solicitudes_direccion (
  solicitud_id uuid primary key references solicitudes (id) on delete cascade,
  direccion_exacta text not null,
  referencia text,
  created_at timestamptz not null default now()
);

alter table solicitudes_direccion enable row level security;

-- Quien crea la solicitud (hoy: el simulador de desarrollo, actuando por el
-- tutor; a futuro: la App Tutor / su backend) registra la dirección aquí,
-- nunca en `solicitudes` directamente.
create policy "solicitudes_direccion_insert_authenticated" on solicitudes_direccion
  for insert to authenticated with check (true);

-- Solo el médico dueño de la solicitud, y solo después de la aceptación.
create policy "solicitudes_direccion_select_post_aceptacion" on solicitudes_direccion
  for select using (
    exists (
      select 1 from solicitudes s
      where s.id = solicitudes_direccion.solicitud_id
        and s.medico_id = auth.uid()
        and s.estado <> 'pendiente'
    )
  );

-- ============================================================================
-- solicitudes_pre_aceptacion — recorte estricto (D-064)
-- ============================================================================
-- Reemplaza la vista de 0001: expone SOLO los campos que N-3 puede mostrar.
-- Nunca direccion_exacta ni teléfono del tutor. Nunca tutor_id/mascota_id
-- crudos ni medico_id (no aportan nada a la pre-aceptación y ensanchan la
-- superficie expuesta sin necesidad).
create or replace view solicitudes_pre_aceptacion as
  select
    s.id,
    m.especie as mascota_especie,
    m.raza as mascota_raza,
    m.nombre as mascota_nombre,
    split_part(coalesce(t.nombre_completo, ''), ' ', 1) as tutor_primer_nombre,
    s.motivo_consulta,
    s.zona_aproximada,
    s.tarifa_estimada,
    s.primera_vez_paciente,
    s.expira_en,
    s.estado
  from solicitudes s
  left join mascotas m on m.id = s.mascota_id
  left join tutores t on t.id = s.tutor_id;
-- direccion_exacta y teléfono del tutor quedan deliberadamente excluidos.

-- ============================================================================
-- servicios: columna de cancelación + estado 'cancelada'
-- ============================================================================
alter table servicios add column if not exists cancelado_at timestamptz;

alter table servicios drop constraint if exists servicios_estado_check;
alter table servicios add constraint servicios_estado_check
  check (estado in ('en_camino', 'en_apertura', 'activa', 'cerrada', 'cancelada'));

-- ============================================================================
-- Funciones (SECURITY DEFINER: corren como dueño de la función, no del
-- caller, por lo que no dependen de las políticas RLS de abajo para operar;
-- las políticas RLS siguen protegiendo el acceso directo desde el cliente)
-- ============================================================================

-- aceptar_solicitud: valida pendiente + no expirada, asigna el médico,
-- copia la dirección real (recién ahora legible) y crea el servicio.
create or replace function aceptar_solicitud(p_solicitud_id uuid)
returns servicios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes%rowtype;
  v_servicio servicios%rowtype;
begin
  select * into v_solicitud from solicitudes where id = p_solicitud_id for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_solicitud.estado <> 'pendiente' then
    raise exception 'La solicitud ya no está pendiente (estado actual: %)', v_solicitud.estado;
  end if;

  if v_solicitud.expira_en is not null and now() >= v_solicitud.expira_en then
    update solicitudes set estado = 'expirada' where id = p_solicitud_id;
    raise exception 'La solicitud expiró antes de poder aceptarla';
  end if;

  update solicitudes
    set estado = 'aceptada',
        medico_id = auth.uid(),
        direccion_exacta = (
          select sd.direccion_exacta from solicitudes_direccion sd
          where sd.solicitud_id = p_solicitud_id
        )
    where id = p_solicitud_id;

  insert into servicios (solicitud_id, medico_id, mascota_id, estado)
  values (p_solicitud_id, auth.uid(), v_solicitud.mascota_id, 'en_camino')
  returning * into v_servicio;

  return v_servicio;
end;
$$;

-- rechazar_solicitud: solo si sigue pendiente.
create or replace function rechazar_solicitud(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update solicitudes
    set estado = 'rechazada'
    where id = p_solicitud_id and estado = 'pendiente';

  if not found then
    raise exception 'La solicitud no está pendiente o no existe';
  end if;
end;
$$;

-- expirar_solicitudes_vencidas: red de seguridad backend del timer de 60s.
create or replace function expirar_solicitudes_vencidas()
returns void
language sql
security definer
set search_path = public
as $$
  update solicitudes
    set estado = 'expirada'
    where estado = 'pendiente' and expira_en is not null and now() > expira_en;
$$;

-- cancelar_servicio: para N-4. Solo el médico dueño del servicio.
create or replace function cancelar_servicio(p_servicio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update servicios
    set estado = 'cancelada', cancelado_at = now()
    where id = p_servicio_id and medico_id = auth.uid() and estado <> 'cancelada';

  if not found then
    raise exception 'Servicio no encontrado o no pertenece al médico actual';
  end if;
end;
$$;

-- ============================================================================
-- Expiración automática — red de seguridad backend (además del RPC llamado
-- desde el cliente al abrir N-2/N-3, ver src/lib/solicitudes.js)
-- ============================================================================
-- Requiere que la extensión pg_cron esté habilitada en el proyecto Supabase
-- (Dashboard → Database → Extensions → pg_cron). Si el plan del fundador no
-- la tiene disponible, este bloque queda comentado; el timer sigue
-- funcionando igual porque aceptar_solicitud() valida expira_en en cada
-- intento de aceptación, y el cliente llama expirar_solicitudes_vencidas()
-- al abrir N-2/N-3. Sin este cron, una solicitud pendiente que nadie
-- vuelve a consultar puede quedar "pendiente" en BD más allá de los 60s
-- hasta la siguiente apertura de la app — no afecta la regla de negocio
-- (nadie puede aceptar una ya vencida), solo la prolijidad del estado.
--
-- create extension if not exists pg_cron;
--
-- select cron.schedule(
--   'expirar-solicitudes-vencidas',
--   '* * * * *',
--   $$select expirar_solicitudes_vencidas();$$
-- );

-- ============================================================================
-- Row Level Security — solicitudes / servicios
-- ============================================================================

-- Reemplaza la política amplia de 0001 ("cualquier autenticado ve todo,
-- incluida direccion_exacta"). Ahora: pendiente/expirada son visibles a
-- cualquier médico (necesario para que Realtime entregue el INSERT inicial
-- Y la transición a 'expirada' — expirar_solicitudes_vencidas() nunca fija
-- medico_id, así que sin 'expirada' aquí, la política bloquearía ese evento
-- para todo el mundo y N-3 no podría autocerrarse al vencer el timer). El
-- resto de estados ('aceptada', 'rechazada', 'cancelada') solo es visible al
-- médico dueño. direccion_exacta nunca viaja en ningún caso porque vive en
-- solicitudes_direccion.
drop policy if exists "solicitudes_select_authenticated" on solicitudes;

create policy "solicitudes_select_pendientes_o_propias" on solicitudes
  for select using (
    estado in ('pendiente', 'expirada') or medico_id = auth.uid()
  );

-- Quien crea la solicitud (simulador de desarrollo hoy; App Tutor a futuro).
create policy "solicitudes_insert_authenticated" on solicitudes
  for insert to authenticated with check (true);

-- tutores / mascotas: ya tenían select amplio (0001); faltaba insert, usado
-- por el simulador de desarrollo (Tarea 2) y por "Crear expediente ahora"
-- en N-10 (mascota nueva).
create policy "tutores_insert_authenticated" on tutores
  for insert to authenticated with check (true);

create policy "mascotas_insert_authenticated" on mascotas
  for insert to authenticated with check (true);

-- ============================================================================
-- Realtime — habilita postgres_changes sobre `solicitudes` (N-3 depende de
-- esto para detectar solicitudes pendientes sin refrescar). No repetible sin
-- guardia: si la tabla ya está en la publicación, ALTER PUBLICATION lanza
-- duplicate_object; se ignora para que la migración sea re-ejecutable.
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table solicitudes;
exception
  when duplicate_object then
    null;
end $$;

-- TODO Fase 7: hardening RLS completo (ver nota en 0001). En particular,
-- "solicitudes_select_pendientes_o_propias" sigue siendo amplia por diseño
-- de MVP (cualquier médico disponible ve que existe una solicitud pendiente
-- en zona_aproximada, sin filtrar por zona real ni por disponibilidad) —
-- suficiente para probar el flujo N-3→N-4→N-5 de esta fase.
