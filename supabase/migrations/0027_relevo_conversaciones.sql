-- ============================================================================
-- MUVET · App Médico — Migración 0027: Relevo — conversación 1:1 y acuerdo mutuo
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0026.
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- `relevo_mensajes` mezclaba tres conceptos en una fila plana
-- (publicacion_id, remitente_id, mensaje): el mensaje, la postulación y su
-- estado. Y no tenía DESTINATARIO. De ahí salían cuatro problemas reales:
--
--   1. Fuga entre postulantes: cuando el autor respondía, el trigger de
--      notificación de 0026 repartía esa respuesta a TODOS los remitentes de
--      la publicación (`select distinct m.remitente_id`), porque no había
--      forma de saber a quién le estaba contestando.
--   2. La respuesta era invisible en la app: fetchMisPostulaciones filtra
--      `remitente_id = yo`, así que el interesado nunca cargaba lo que le
--      escribió el autor. El texto solo le llegaba en el cuerpo del aviso.
--   3. Para preguntar había que decidir de entrada si te comprometías o no
--      (`es_postulacion`, 0019) — dos botones que se solapaban en la UI.
--   4. El autor no podía preguntar nada antes de decidir.
--
-- La 0020 quitó la confirmación doble de 0016 por considerarla fricción, y
-- tenía razón: sin conversación previa, pedir una segunda confirmación no
-- agregaba nada. Con conversación, sí — es lo que ratifica lo negociado.
--
-- ----------------------------------------------------------------------------
-- Modelo
-- ----------------------------------------------------------------------------
--   relevo_publicaciones (sin cambios)
--        └─ relevo_conversaciones   ← la negociación · UNIQUE(publicacion, interesado)
--              └─ relevo_mensajes (+ conversacion_id)   ← el hilo
--
--   Contactar → abierta ──ambos "De acuerdo"──→ aceptada   (consume cupo)
--                  └────cualquiera "Descartar"──→ descartada
--
-- `estado` es DERIVADO de las dos banderas de acuerdo por el trigger de más
-- abajo: el cliente no lo escribe nunca. Ambos desenlaces son terminales,
-- mismo espíritu de inmutabilidad que 0018 y 0020.
--
-- ----------------------------------------------------------------------------
-- MODIFICACIÓN A D-540 — confirmada con el fundador
-- ----------------------------------------------------------------------------
-- D-540 original: "Relevo es un mensaje único de contacto. Sin chat en tiempo
-- real, sin hilo de conversación." Pasa a ser: hilo 1:1 PRIVADO entre las dos
-- partes de una postulación, que vive SOLO mientras dura la negociación — al
-- aceptarse o descartarse, el hilo se cierra a mensajes nuevos (lo hace la
-- policy de insert, no la UI). Sin adjuntos y sin tiempo real: es la versión
-- acotada de la excepción que 0023 ya concedió a Cobertura de Servicio.
--
-- Columnas de `relevo_mensajes` que quedan SIN USO a partir de aquí (se dejan
-- en la tabla para no perder el dato histórico, pero ya no se leen ni se
-- escriben): `estado`, `es_postulacion`, `decision_leida`, `leido`.
-- ============================================================================


-- ============================================================================
-- 1. Tabla relevo_conversaciones
-- ============================================================================
-- `autor_id` va denormalizado a propósito: si las policies tuvieran que
-- resolverlo con un subselect contra relevo_publicaciones se repetiría el
-- problema de recursión entre policies que en 0017 obligó a crear
-- relevo_soy_postulante. Lo escribe el trigger de 2.1 desde la publicación, así
-- que el cliente no puede falsearlo.
--
-- `cerrada_at` resuelve de paso la limitación documentada en
-- lib/historialUnificado.js: los ítems de Relevo en el historial único se
-- ordenaban por `created_at` porque no había ninguna columna de cierre.
create table if not exists relevo_conversaciones (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references relevo_publicaciones (id) on delete cascade,
  interesado_id uuid not null references perfiles (id) on delete cascade,
  autor_id uuid not null references perfiles (id) on delete cascade,

  estado text not null default 'abierta'
    check (estado in ('abierta', 'aceptada', 'descartada')),
  acuerdo_autor boolean not null default false,
  acuerdo_interesado boolean not null default false,
  descartada_por uuid references perfiles (id) on delete set null,

  created_at timestamptz not null default now(),
  aceptada_at timestamptz,
  cerrada_at timestamptz,
  ultimo_mensaje_at timestamptz not null default now(),
  leido_autor_at timestamptz,
  leido_interesado_at timestamptz,

  -- Una sola negociación por (oferta, interesado). Es lo que hace que
  -- "Contactar" sea idempotente y que un postulante no pueda consumir dos
  -- cupos — lo que en 0016 había que resolver con `count(distinct remitente_id)`.
  constraint relevo_conversaciones_unica unique (publicacion_id, interesado_id),
  constraint relevo_conversaciones_partes_distintas check (autor_id <> interesado_id)
);

create index if not exists relevo_conversaciones_interesado_idx
  on relevo_conversaciones (interesado_id, ultimo_mensaje_at desc);
create index if not exists relevo_conversaciones_autor_idx
  on relevo_conversaciones (autor_id, ultimo_mensaje_at desc);
create index if not exists relevo_conversaciones_publicacion_idx
  on relevo_conversaciones (publicacion_id);

alter table relevo_conversaciones enable row level security;

-- `relevo_mensajes` pasa a ser el hilo de una conversación.
alter table relevo_mensajes
  add column if not exists conversacion_id uuid references relevo_conversaciones (id) on delete cascade;

create index if not exists relevo_mensajes_conversacion_idx
  on relevo_mensajes (conversacion_id, created_at);


-- ============================================================================
-- 2. Triggers de negocio
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 Alta: el autor y el estado inicial los fija el backend
-- ----------------------------------------------------------------------------
-- El bypass de service_role/postgres es lo que deja al backfill del punto 7
-- crear conversaciones ya cerradas; un cliente siempre arranca en 'abierta'
-- con las dos banderas en false (mismo guard de INSERT que 0020 le puso a
-- las postulaciones).
create or replace function relevo_conversaciones_guardar_alta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_autor_id uuid;
begin
  select p.autor_id into v_autor_id
  from relevo_publicaciones p
  where p.id = new.publicacion_id;

  if v_autor_id is null then
    raise exception 'La oferta no existe.';
  end if;

  new.autor_id := v_autor_id;

  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  new.estado := 'abierta';
  new.acuerdo_autor := false;
  new.acuerdo_interesado := false;
  new.descartada_por := null;
  new.aceptada_at := null;
  new.cerrada_at := null;

  return new;
end;
$$;

drop trigger if exists trg_relevo_conversaciones_guardar_alta on relevo_conversaciones;
create trigger trg_relevo_conversaciones_guardar_alta
  before insert on relevo_conversaciones
  for each row execute function relevo_conversaciones_guardar_alta();

-- ----------------------------------------------------------------------------
-- 2.2 Acuerdo mutuo — el corazón del cambio
-- ----------------------------------------------------------------------------
-- La policy de update (4.1) deja escribir a los dos participantes sin
-- restringir columnas, igual que `relevo_mensajes_update_remitente` en 0016.
-- Este trigger es lo que impide abusarla: cada lado solo mueve SU bandera, y
-- `estado` se deriva de las dos.
create or replace function relevo_conversaciones_guardar_acuerdo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_soy_autor boolean;
  v_soy_interesado boolean;
  v_cupos integer;
  v_aceptadas integer;
begin
  -- Mantenimiento y triggers security definer (cascada de cancelación,
  -- `touch` de ultimo_mensaje_at) pasan de largo.
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  v_soy_autor := auth.uid() = old.autor_id;
  v_soy_interesado := auth.uid() = old.interesado_id;

  if not (v_soy_autor or v_soy_interesado) then
    raise exception 'Solo los participantes de la conversación pueden modificarla.';
  end if;

  -- Datos que el cliente nunca cambia. `aceptada_at`/`cerrada_at`/
  -- `descartada_por` los sella este mismo trigger más abajo.
  new.publicacion_id := old.publicacion_id;
  new.interesado_id := old.interesado_id;
  new.autor_id := old.autor_id;
  new.created_at := old.created_at;
  new.aceptada_at := old.aceptada_at;
  new.cerrada_at := old.cerrada_at;
  new.descartada_por := old.descartada_por;

  -- Terminal: aceptada/descartada no se revierten ni se cambian de una a otra
  -- (mismo criterio que 0018 con el estado de la publicación y 0020 con la
  -- decisión). Lo único que sigue admitiendo es marcar el hilo como leído.
  if old.estado in ('aceptada', 'descartada') then
    if new.estado is distinct from old.estado
       or new.acuerdo_autor is distinct from old.acuerdo_autor
       or new.acuerdo_interesado is distinct from old.acuerdo_interesado then
      raise exception 'Esta conversación ya está % y no se puede cambiar.', old.estado;
    end if;
    return new;
  end if;

  if new.acuerdo_autor is distinct from old.acuerdo_autor and not v_soy_autor then
    raise exception 'Solo quien publicó la oferta puede marcar su acuerdo.';
  end if;

  if new.acuerdo_interesado is distinct from old.acuerdo_interesado and not v_soy_interesado then
    raise exception 'Solo quien contactó la oferta puede marcar su acuerdo.';
  end if;

  -- Un acuerdo ya dado no se retira: si cambiaste de idea, se descarta la
  -- conversación. Así "estoy de acuerdo" no se puede usar para sondear al otro.
  if (old.acuerdo_autor and not new.acuerdo_autor)
     or (old.acuerdo_interesado and not new.acuerdo_interesado) then
    raise exception 'Un acuerdo ya dado no se puede retirar. Descarta la conversación si cambiaste de idea.';
  end if;

  -- Descartar: lo puede hacer cualquiera de los dos y es terminal.
  if new.estado = 'descartada' then
    new.acuerdo_autor := false;
    new.acuerdo_interesado := false;
    new.descartada_por := auth.uid();
    new.cerrada_at := now();
    return new;
  end if;

  -- Estado derivado. Aquí es donde vive "si ambas partes están de acuerdo se
  -- acepta la oferta".
  if new.acuerdo_autor and new.acuerdo_interesado then
    -- Guard de cupos en backend: hasta ahora esto solo lo evitaba la UI
    -- deshabilitando el botón "Aceptar" (cuposLlenos en TabOfertas).
    select p.cupos into v_cupos from relevo_publicaciones p where p.id = old.publicacion_id;

    select count(*) into v_aceptadas
    from relevo_conversaciones c
    where c.publicacion_id = old.publicacion_id
      and c.estado = 'aceptada'
      and c.id <> old.id;

    if v_aceptadas >= coalesce(v_cupos, 1) then
      raise exception 'Esta oferta ya no tiene cupos disponibles.';
    end if;

    new.estado := 'aceptada';
    new.aceptada_at := now();
    new.cerrada_at := now();
  else
    new.estado := 'abierta';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_relevo_conversaciones_guardar_acuerdo on relevo_conversaciones;
create trigger trg_relevo_conversaciones_guardar_acuerdo
  before update on relevo_conversaciones
  for each row execute function relevo_conversaciones_guardar_acuerdo();

-- ----------------------------------------------------------------------------
-- 2.3 Cierre por cupos — se muda de relevo_mensajes a relevo_conversaciones
-- ----------------------------------------------------------------------------
-- Sigue siendo `security definer` por la misma razón que en 0016: la última
-- confirmación puede venir del interesado, que por RLS
-- (relevo_publicaciones_update_autor) no puede escribir en la publicación.
-- Ya no hace falta `count(distinct ...)`: el UNIQUE de la tabla garantiza una
-- conversación por persona.
create or replace function relevo_cerrar_publicacion_por_cupos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupos integer;
  v_aceptadas integer;
begin
  select p.cupos into v_cupos from relevo_publicaciones p where p.id = new.publicacion_id;
  if v_cupos is null then
    return null;
  end if;

  select count(*) into v_aceptadas
  from relevo_conversaciones c
  where c.publicacion_id = new.publicacion_id and c.estado = 'aceptada';

  if v_aceptadas >= v_cupos then
    update relevo_publicaciones set activa = false where id = new.publicacion_id and activa;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_relevo_cerrar_publicacion_por_cupos on relevo_mensajes;
drop trigger if exists trg_relevo_cerrar_publicacion_por_cupos on relevo_conversaciones;
create trigger trg_relevo_cerrar_publicacion_por_cupos
  after insert or update on relevo_conversaciones
  for each row execute function relevo_cerrar_publicacion_por_cupos();

-- ----------------------------------------------------------------------------
-- 2.4 `ultimo_mensaje_at` — lo que ordena la bandeja
-- ----------------------------------------------------------------------------
create or replace function relevo_conversaciones_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversacion_id is not null then
    update relevo_conversaciones
      set ultimo_mensaje_at = new.created_at
      where id = new.conversacion_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_relevo_conversaciones_touch on relevo_mensajes;
create trigger trg_relevo_conversaciones_touch
  after insert on relevo_mensajes
  for each row execute function relevo_conversaciones_touch();

-- ----------------------------------------------------------------------------
-- 2.5 Cascada al cancelar la publicación (reemplaza el cuerpo de 0018)
-- ----------------------------------------------------------------------------
-- BUG PREEXISTENTE que se corrige de paso: el comentario de 0018 decía "los
-- relevos ya confirmados por ambas partes quedan intactos", pero el cuerpo
-- rechazaba `estado in ('pendiente','aceptada')`. Cuando 0020 consolidó
-- 'confirmada' → 'aceptada', ese `in` pasó a barrer también los relevos ya
-- cerrados — contradiciendo su propio comentario y a finalizarPublicacion,
-- que exige ≥1 aceptada. Ahora solo se descartan las conversaciones abiertas.
create or replace function relevo_cancelar_rechaza_pendientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    update relevo_conversaciones
      set estado = 'descartada',
          acuerdo_autor = false,
          acuerdo_interesado = false,
          cerrada_at = now()
      where publicacion_id = new.id
        and estado = 'abierta';
  end if;
  return null;
end;
$$;

-- Los triggers de la postulación plana (0020) ya no aplican: `estado`,
-- `es_postulacion` y `decision_leida` de relevo_mensajes quedan sin uso.
drop trigger if exists trg_relevo_mensajes_guardar_decision on relevo_mensajes;
drop function if exists relevo_mensajes_guardar_decision();

revoke execute on function relevo_conversaciones_guardar_alta() from public, anon, authenticated;
revoke execute on function relevo_conversaciones_guardar_acuerdo() from public, anon, authenticated;
revoke execute on function relevo_cerrar_publicacion_por_cupos() from public, anon, authenticated;
revoke execute on function relevo_conversaciones_touch() from public, anon, authenticated;
revoke execute on function relevo_cancelar_rechaza_pendientes() from public, anon, authenticated;


-- ============================================================================
-- 3. Funciones existentes que apuntaban a relevo_mensajes
-- ============================================================================

-- 0017: la usa la policy de select de relevo_publicaciones para que quien se
-- postuló siga viendo una oferta ya cerrada. Ahora "postularse" = tener
-- conversación. Sigue siendo SECURITY DEFINER para cortar la recursión entre
-- policies (misma razón que en 0017).
create or replace function relevo_soy_postulante(p_publicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from relevo_conversaciones c
    where c.publicacion_id = p_publicacion_id
      and c.interesado_id = auth.uid()
  );
$$;

revoke execute on function relevo_soy_postulante(uuid) from public, anon;
grant execute on function relevo_soy_postulante(uuid) to authenticated;

-- 0022: la ficha ampliada pasa a colgar de la conversación, y de paso se
-- RESUELVE EL SUPUESTO que quedó abierto en esa migración ("confirmar con el
-- fundador si el teléfono debe esperar a la aceptación"). Ahora son dos
-- niveles:
--
--   conversación abierta   → matrícula + estado de validación, especialidad,
--                            zona, bio, NIT. Suficiente para saber con quién
--                            estás hablando y decidir.
--   conversación aceptada  → además teléfono y dirección de sede.
--
-- Es D-064 aplicado a Relevo: el dato de contacto directo se revela después
-- del compromiso, no antes.
create or replace function relevo_ficha_contacto(p_perfil_id uuid)
returns table (
  id uuid,
  rol text,
  nombre_completo text,
  telefono text,
  bio text,
  zona_cobertura text,
  especialidad text,
  matricula_comvezcol text,
  estado_validacion text,
  razon_social text,
  nit text,
  direccion_sede text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.rol, p.nombre_completo,
         case when v.aceptada then p.telefono end,
         p.bio, p.zona_cobertura, p.especialidad, p.matricula_comvezcol, p.estado_validacion,
         p.razon_social, p.nit,
         case when v.aceptada then p.direccion_sede end
  from perfiles p
  cross join lateral (
    select count(*) as relaciones,
           coalesce(bool_or(c.estado = 'aceptada'), false) as aceptada
    from relevo_conversaciones c
    where (c.autor_id = auth.uid() and c.interesado_id = p_perfil_id)
       or (c.interesado_id = auth.uid() and c.autor_id = p_perfil_id)
  ) v
  where p.id = p_perfil_id
    and v.relaciones > 0;
$$;

revoke execute on function relevo_ficha_contacto(uuid) from public, anon;
grant execute on function relevo_ficha_contacto(uuid) to authenticated;


-- ============================================================================
-- 4. RLS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 relevo_conversaciones
-- ----------------------------------------------------------------------------
drop policy if exists "relevo_conversaciones_select_participantes" on relevo_conversaciones;
create policy "relevo_conversaciones_select_participantes" on relevo_conversaciones
  for select using (auth.uid() in (autor_id, interesado_id));

-- Defensa en profundidad que hasta ahora NO existía: lib/relevo.js documenta
-- (líneas 6-10) que el matching por `rol_objetivo` y el `activa = true` vivían
-- solo en el cliente porque "RLS solo exige activa=true para escritura". Acá
-- se cierra: no se puede abrir conversación sobre una oferta pausada, cerrada,
-- propia, ni dirigida a otro rol.
drop policy if exists "relevo_conversaciones_insert_interesado" on relevo_conversaciones;
create policy "relevo_conversaciones_insert_interesado" on relevo_conversaciones
  for insert to authenticated
  with check (
    interesado_id = auth.uid()
    and exists (
      select 1
      from relevo_publicaciones p
      join perfiles yo on yo.id = auth.uid()
      where p.id = publicacion_id
        and p.activa
        and p.estado = 'abierta'
        and p.autor_id <> auth.uid()
        and p.rol_objetivo = yo.rol
    )
  );

-- No restringe columnas a propósito: quien las restringe es el trigger 2.2,
-- que es donde vive la regla de negocio (mismo reparto que 0016 + 0020).
drop policy if exists "relevo_conversaciones_update_participantes" on relevo_conversaciones;
create policy "relevo_conversaciones_update_participantes" on relevo_conversaciones
  for update using (auth.uid() in (autor_id, interesado_id))
  with check (auth.uid() in (autor_id, interesado_id));

-- Sin policy de delete: una negociación no se borra, se descarta.

-- ----------------------------------------------------------------------------
-- 4.2 relevo_mensajes — pasan a colgar de la conversación
-- ----------------------------------------------------------------------------
-- Las cuatro policies viejas se caen: las de update (0011, 0016) servían a la
-- decisión y a las banderas de leído, que ya no viven aquí.
drop policy if exists "relevo_mensajes_select_participantes" on relevo_mensajes;
drop policy if exists "relevo_mensajes_insert_remitente" on relevo_mensajes;
drop policy if exists "relevo_mensajes_update_autor_publicacion" on relevo_mensajes;
drop policy if exists "relevo_mensajes_update_remitente" on relevo_mensajes;

create policy "relevo_mensajes_select_conversacion" on relevo_mensajes
  for select using (
    exists (
      select 1 from relevo_conversaciones c
      where c.id = relevo_mensajes.conversacion_id
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

-- `c.estado = 'abierta'` es lo que hace ACOTADA la excepción a D-540: el hilo
-- deja de admitir mensajes en cuanto el relevo se acepta o se descarta. Es
-- backend, no una condición de la UI.
create policy "relevo_mensajes_insert_participante" on relevo_mensajes
  for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and exists (
      select 1 from relevo_conversaciones c
      where c.id = conversacion_id
        and c.estado = 'abierta'
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

-- Sin update ni delete: un mensaje enviado no se edita ni se borra.


-- ============================================================================
-- 5. Notificaciones (amplía 0026)
-- ============================================================================
-- Los tipos viejos se conservan en el CHECK: hay filas históricas que los
-- usan y `notificaciones` no se reescribe.
alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    'relevo_contacto',         -- alguien abrió una conversación sobre mi oferta
    'relevo_mensaje',          -- mensaje nuevo dentro de una conversación
    'relevo_acuerdo',          -- la otra parte marcó "estoy de acuerdo"
    'relevo_confirmada',       -- ambos de acuerdo: relevo cerrado
    'relevo_descartada',       -- la otra parte se retiró
    'relevo_postulacion',      -- (histórico, previo a 0027)
    'relevo_decision',         -- (histórico, previo a 0027)
    'relevo_respuesta',        -- (histórico, previo a 0027)
    'cobertura_ofrecimiento',
    'cobertura_mensaje',
    'cobertura_finalizada'
  ));

-- ----------------------------------------------------------------------------
-- 5.1 Mensajes: un destinatario, no un broadcast
-- ----------------------------------------------------------------------------
-- Reemplaza a la versión de 0026, que tenía tres ramas sobre la misma tabla
-- plana y en la rama (b) repartía la respuesta del autor a TODOS los
-- remitentes de la publicación. Ahora el destinatario es simplemente el otro
-- participante de la conversación. Pasa a ser AFTER INSERT a secas: la
-- decisión ya no vive en esta tabla.
create or replace function relevo_mensajes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor_id uuid;
  v_interesado_id uuid;
  v_publicacion_id uuid;
  v_destinatario uuid;
  v_actor text;
  v_tipo text;
  v_titulo text;
  v_primero boolean;
begin
  if new.conversacion_id is null then
    return null;
  end if;

  select c.autor_id, c.interesado_id, c.publicacion_id
    into v_autor_id, v_interesado_id, v_publicacion_id
  from relevo_conversaciones c
  where c.id = new.conversacion_id;

  if v_autor_id is null then
    return null;
  end if;

  if new.remitente_id = v_autor_id then
    v_destinatario := v_interesado_id;
  else
    v_destinatario := v_autor_id;
  end if;

  if v_destinatario is null or v_destinatario = new.remitente_id then
    return null;
  end if;

  v_actor := notificaciones_nombre_actor(new.remitente_id);

  -- El primer mensaje ES el contacto inicial. Se avisa una sola vez por ese
  -- hecho (no hay aviso separado al crear la conversación) para que el
  -- destinatario no reciba dos notificaciones por una sola acción.
  v_primero := not exists (
    select 1 from relevo_mensajes m
    where m.conversacion_id = new.conversacion_id and m.id <> new.id
  );

  -- "MUVET Turnos" y no "MUVET Relevo": los prefijos `relevo_*` de esta tabla
  -- son identificadores internos anteriores al cambio de nombres — de cara al
  -- usuario este módulo es MUVET Turnos (ver src/lib/nombresModulos.js).
  if v_primero then
    v_tipo := 'relevo_contacto';
    v_titulo := v_actor || ' te contactó por una oferta';
  else
    v_tipo := 'relevo_mensaje';
    v_titulo := v_actor || ' te escribió en MUVET Turnos';
  end if;

  insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
  values (
    v_destinatario,
    v_tipo,
    v_titulo,
    new.mensaje,
    '/relevo/conversacion/' || new.conversacion_id,
    'relevo_mensajes',
    new.id,
    new.remitente_id,
    jsonb_build_object('conversacion_id', new.conversacion_id, 'publicacion_id', v_publicacion_id)
  );

  return null;
end;
$$;

drop trigger if exists trg_relevo_mensajes_notificar on relevo_mensajes;
create trigger trg_relevo_mensajes_notificar
  after insert on relevo_mensajes
  for each row execute function relevo_mensajes_notificar();

revoke execute on function relevo_mensajes_notificar() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5.2 Acuerdo, cierre y descarte
-- ----------------------------------------------------------------------------
-- `auth.uid()` dentro de un trigger sigue devolviendo al usuario que llamó
-- aunque la función sea security definer (lee el JWT, no el rol de ejecución)
-- — mismo criterio que 0026 usa en cobertura_solicitudes_notificar. Sirve para
-- avisarle al OTRO. En la cascada de cancelación (2.5) quien llama es el autor
-- de la publicación, así que el aviso le llega al interesado, que es lo que
-- corresponde.
create or replace function relevo_conversaciones_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid;
  v_destinatario uuid;
  v_descripcion text;
  v_url text;
begin
  v_quien := auth.uid();
  if v_quien = new.autor_id then
    v_destinatario := new.interesado_id;
  elsif v_quien = new.interesado_id then
    v_destinatario := new.autor_id;
  else
    -- Cambio sin usuario identificable (mantenimiento): no se notifica.
    return null;
  end if;

  select p.descripcion into v_descripcion
  from relevo_publicaciones p where p.id = new.publicacion_id;
  v_descripcion := coalesce(nullif(v_descripcion, ''), '(sin descripción)');
  v_url := '/relevo/conversacion/' || new.id;

  -- Relevo cerrado: se avisa al otro (quien pulsó ya lo sabe).
  if new.estado = 'aceptada' and old.estado is distinct from 'aceptada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'relevo_confirmada',
      'Turno confirmado: ' || notificaciones_nombre_actor(v_quien) || ' también aceptó',
      v_descripcion, v_url, 'relevo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  if new.estado = 'descartada' and old.estado is distinct from 'descartada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'relevo_descartada',
      notificaciones_nombre_actor(v_quien) || ' descartó la conversación',
      v_descripcion, v_url, 'relevo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  -- Media confirmación: falta la del otro, y eso es justo lo que hay que
  -- pedirle.
  if new.estado = 'abierta'
     and ((new.acuerdo_autor and not old.acuerdo_autor)
       or (new.acuerdo_interesado and not old.acuerdo_interesado)) then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'relevo_acuerdo',
      notificaciones_nombre_actor(v_quien) || ' está de acuerdo · falta tu confirmación',
      v_descripcion, v_url, 'relevo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_relevo_conversaciones_notificar on relevo_conversaciones;
create trigger trg_relevo_conversaciones_notificar
  after update on relevo_conversaciones
  for each row execute function relevo_conversaciones_notificar();

revoke execute on function relevo_conversaciones_notificar() from public, anon, authenticated;


-- ============================================================================
-- 6. Realtime
-- ============================================================================
-- `relevo_mensajes` ya está en la publicación desde 0013. Se agrega
-- `relevo_conversaciones` de forma condicional (mismo patrón que 0026) por si
-- más adelante se quiere refrescar la bandeja en vivo — hoy no hay consumidor.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'relevo_conversaciones'
  ) then
    execute 'alter publication supabase_realtime add table relevo_conversaciones';
  end if;
end
$$;


-- ============================================================================
-- 7. Backfill
-- ============================================================================
-- Se corre DESPUÉS de haber dropeado trg_relevo_mensajes_guardar_decision
-- (2.5) y de haber convertido el trigger de notificación en AFTER INSERT
-- (5.1), para que reasignar mensajes no dispare avisos ni choque con el guard
-- de decisión terminal.
--
-- Una conversación por cada (publicación, remitente) donde el remitente no es
-- el autor. Mapeo de estados: cualquier fila 'aceptada' del par gana (el
-- relevo se cerró); si no hay ninguna y todas están 'rechazada', la
-- conversación queda 'descartada'; en cualquier otro caso sigue 'abierta'.
insert into relevo_conversaciones (
  publicacion_id, interesado_id, autor_id, estado,
  acuerdo_autor, acuerdo_interesado,
  created_at, aceptada_at, cerrada_at, ultimo_mensaje_at
)
select
  m.publicacion_id,
  m.remitente_id,
  pub.autor_id,
  case
    when bool_or(m.estado = 'aceptada') then 'aceptada'
    when bool_and(m.estado = 'rechazada') then 'descartada'
    else 'abierta'
  end,
  bool_or(m.estado = 'aceptada'),
  bool_or(m.estado = 'aceptada'),
  min(m.created_at),
  case when bool_or(m.estado = 'aceptada') then max(m.created_at) end,
  case when bool_or(m.estado = 'aceptada') or bool_and(m.estado = 'rechazada')
       then max(m.created_at) end,
  max(m.created_at)
from relevo_mensajes m
join relevo_publicaciones pub on pub.id = m.publicacion_id
where m.remitente_id is distinct from pub.autor_id
  and m.remitente_id is not null
group by m.publicacion_id, m.remitente_id, pub.autor_id
on conflict (publicacion_id, interesado_id) do nothing;

-- Cada mensaje del interesado va a su conversación.
update relevo_mensajes m
set conversacion_id = c.id
from relevo_conversaciones c
where c.publicacion_id = m.publicacion_id
  and c.interesado_id = m.remitente_id
  and m.conversacion_id is null;

-- Las respuestas del autor (remitente_id = autor de la publicación) NO tienen
-- destinatario reconstruible: el modelo viejo no lo guardaba. Se asignan solo
-- cuando la publicación tiene exactamente una conversación, que es el único
-- caso en que la atribución es inequívoca. El resto queda con
-- `conversacion_id` NULL, o sea invisible — que es exactamente lo que el
-- destinatario veía hasta ahora (fetchMisPostulaciones nunca las cargaba), así
-- que no se pierde nada que hoy esté a la vista.
update relevo_mensajes m
set conversacion_id = c.id
from relevo_publicaciones pub
join relevo_conversaciones c on c.publicacion_id = pub.id
where m.publicacion_id = pub.id
  and m.remitente_id = pub.autor_id
  and m.conversacion_id is null
  and (select count(*) from relevo_conversaciones c2 where c2.publicacion_id = pub.id) = 1;

-- `ultimo_mensaje_at` se recalcula al final para incluir las respuestas del
-- autor que acaban de asignarse.
update relevo_conversaciones c
set ultimo_mensaje_at = greatest(c.ultimo_mensaje_at, m.ultimo)
from (
  select conversacion_id, max(created_at) as ultimo
  from relevo_mensajes
  where conversacion_id is not null
  group by conversacion_id
) m
where m.conversacion_id = c.id;
