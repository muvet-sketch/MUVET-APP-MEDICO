-- ============================================================================
-- MUVET · App Médico — Migración 0026: Notificaciones (Relevo + Cobertura)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0025.
--
-- Aplicada vía MCP contra el proyecto real (APP_MEDICO, hwfhzvpfwzejhqxprsfz).
--
-- Contexto: hasta ahora "notificaciones" era solo la campana
-- (src/components/ui/NotificationBell.jsx), que derivaba dos contadores al
-- vuelo de dos banderas de `relevo_mensajes` (`leido`, 0013; `decision_leida`,
-- 0020) y al tocarla llevaba directo a una pestaña de /relevo. Eso no permite
-- ni historial (la bandera se borra al abrir la pestaña), ni saber QUÉ pasó,
-- ni un destino por evento.
--
-- Esta migración crea la tabla `notificaciones`: una fila por evento, con su
-- tipo, su texto y la URL a la que debe llevar al tocarla. Las filas las
-- escriben triggers `security definer` sobre las tablas de los dos módulos
-- con mensajería — MUVET Relevo (`relevo_mensajes`) y Cobertura de Servicio
-- (`cobertura_solicitudes`, `cobertura_mensajes`, ver 0023). El cliente NO
-- puede insertar: solo lee las suyas y las marca como leídas.
--
-- Las banderas `leido`/`decision_leida` de `relevo_mensajes` NO se tocan:
-- siguen sirviendo al punto de "sin leer" dentro de las pestañas de N-26.
-- Lo que deja de depender de ellas es la campana y la pantalla nueva
-- (N-31 · /notificaciones).
--
-- D-540 sigue intacto: notificar un mensaje no lo convierte en un hilo de
-- chat en tiempo real. La notificación es un aviso, no una conversación.
-- ============================================================================

-- ============================================================================
-- 1. Tabla notificaciones
-- ============================================================================
create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  -- Destinatario: a quién le suena la campana.
  perfil_id uuid not null references perfiles (id) on delete cascade,
  tipo text not null check (tipo in (
    'relevo_postulacion',      -- alguien validó mi oferta (se postuló)
    'relevo_decision',         -- aceptaron o rechazaron mi postulación
    'relevo_mensaje',          -- mensaje nuevo, sin intercambio previo
    'relevo_respuesta',        -- respuesta dentro de un intercambio existente
    'cobertura_ofrecimiento',  -- otro médico se ofreció a cubrir mi servicio
    'cobertura_mensaje',       -- mensaje nuevo en el chat de una cobertura
    'cobertura_finalizada'     -- el otro participante finalizó el servicio
  )),
  titulo text not null,
  cuerpo text,
  -- Destino al tocarla (ruta del router, incluidos query params).
  url text not null,
  -- Trazabilidad al hecho que la originó.
  ref_tabla text,
  ref_id uuid,
  -- Quien la provocó. `on delete set null`: si el otro usuario se da de baja
  -- la notificación sobrevive (ya no se puede navegar a su perfil, pero el
  -- texto sigue teniendo sentido).
  actor_id uuid references perfiles (id) on delete set null,
  payload jsonb,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notificaciones_perfil_idx
  on notificaciones (perfil_id, created_at desc);
create index if not exists notificaciones_perfil_no_leidas_idx
  on notificaciones (perfil_id) where not leida;

alter table notificaciones enable row level security;

-- Sin policy de insert ni de delete para el cliente: las filas solo las
-- escriben los triggers security definer de más abajo. El usuario únicamente
-- lee las suyas y las marca como leídas.
drop policy if exists "notificaciones_select_own" on notificaciones;
create policy "notificaciones_select_own" on notificaciones
  for select using (perfil_id = auth.uid());

drop policy if exists "notificaciones_update_own" on notificaciones;
create policy "notificaciones_update_own" on notificaciones
  for update using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- La policy de arriba no restringe columnas (mismo hueco que 0025 señaló en
-- `perfiles_update_own`): sin este guard, el dueño de la fila podría
-- reescribir el `titulo` o el `url` de su propia notificación. Lo único que
-- el cliente tiene que poder cambiar es `leida`.
create or replace function notificaciones_solo_marcar_leida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if new.perfil_id is distinct from old.perfil_id
     or new.tipo is distinct from old.tipo
     or new.titulo is distinct from old.titulo
     or new.cuerpo is distinct from old.cuerpo
     or new.url is distinct from old.url
     or new.ref_tabla is distinct from old.ref_tabla
     or new.ref_id is distinct from old.ref_id
     or new.actor_id is distinct from old.actor_id
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at then
    raise exception 'De una notificación solo se puede cambiar si está leída.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificaciones_solo_marcar_leida on notificaciones;
create trigger trg_notificaciones_solo_marcar_leida
  before update on notificaciones
  for each row execute function notificaciones_solo_marcar_leida();

revoke execute on function notificaciones_solo_marcar_leida() from public, anon, authenticated;

-- ============================================================================
-- 2. Helper: nombre visible de quien provoca la notificación
-- ============================================================================
-- Mismo criterio que la UI (razón social de la clínica, si no el nombre del
-- médico/auxiliar). Es `security definer` porque la RLS de `perfiles` es
-- solo-fila-propia (0001) y estos triggers necesitan el nombre del OTRO.
-- Equivale a lo que `perfiles_publico` (0014) expone al cliente.
create or replace function notificaciones_nombre_actor(p_perfil_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(nullif(p.razon_social, ''), nullif(p.nombre_completo, ''), 'Usuario MUVET')
  from perfiles p
  where p.id = p_perfil_id;
$$;

-- Supabase concede EXECUTE a anon y authenticated por defecto sobre lo que se
-- crea en `public`, así que `revoke ... from public` NO alcanza: hay que
-- revocarle a `anon` explícitamente. Sin eso, un anónimo podría resolver
-- UUID → nombre de cualquier perfil (esta función no tiene control de acceso
-- propio, a diferencia de relevo_ficha_contacto que sí se cierra con
-- auth.uid()). Estado final igual al de relevo_soy_postulante tras 0017:
-- postgres / authenticated / service_role.
revoke execute on function notificaciones_nombre_actor(uuid) from public, anon;
grant execute on function notificaciones_nombre_actor(uuid) to authenticated;

-- ============================================================================
-- 3. Trigger de MUVET Relevo (relevo_mensajes)
-- ============================================================================
-- Tres hechos distintos viven en la misma tabla (ver lib/relevo.js):
--
--   a) INSERT de un interesado sobre la publicación de otro
--      · primera fila con es_postulacion=true  → "validó tu oferta"
--        (relevo_postulacion). Va a la pestaña "Ofertas", que es donde el
--        autor tiene "Solicitudes activas" con Aceptar/Rechazar.
--      · ya hubo mensajes de ese remitente en esa publicación
--        → relevo_respuesta.
--      · si no → relevo_mensaje (típicamente la pregunta previa de 0019,
--        es_postulacion=false).
--   b) INSERT del propio autor respondiendo (post-aceptación, 0020) → todos
--      los remitentes de esa publicación reciben relevo_respuesta.
--   c) UPDATE con cambio de `estado` a aceptada/rechazada → el remitente
--      recibe relevo_decision.
--
-- `security definer`: inserta en `notificaciones`, tabla que el llamante no
-- puede escribir (no hay policy de insert). Mismo patrón que
-- relevo_cerrar_publicacion_por_cupos (0020).
create or replace function relevo_mensajes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor_id uuid;
  v_descripcion text;
  v_actor text;
  v_tipo text;
  v_titulo text;
  v_url text;
begin
  select p.autor_id, p.descripcion into v_autor_id, v_descripcion
  from relevo_publicaciones p
  where p.id = new.publicacion_id;

  if v_autor_id is null then
    return null;
  end if;

  -- (c) Decisión del autor sobre una postulación.
  if tg_op = 'UPDATE' then
    if new.estado is distinct from old.estado and new.estado in ('aceptada', 'rechazada') then
      -- El autor decide sobre su propia fila solo en el caso raro de que se
      -- hubiera postulado a sí mismo; igual se excluye por consistencia.
      if new.remitente_id is distinct from v_autor_id then
        insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
        values (
          new.remitente_id,
          'relevo_decision',
          'Tu postulación fue ' || new.estado,
          coalesce(nullif(v_descripcion, ''), '(sin descripción)'),
          '/relevo?tab=mi-oferta',
          'relevo_mensajes',
          new.id,
          v_autor_id,
          jsonb_build_object('estado', new.estado, 'publicacion_id', new.publicacion_id)
        );
      end if;
    end if;
    return null;
  end if;

  v_actor := notificaciones_nombre_actor(new.remitente_id);

  -- (b) El autor responde: se avisa a todos los que le escribieron.
  if new.remitente_id = v_autor_id then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    select distinct
      m.remitente_id,
      'relevo_respuesta',
      v_actor || ' respondió tu mensaje',
      new.mensaje,
      '/relevo?tab=mi-oferta',
      'relevo_mensajes',
      new.id,
      v_autor_id,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    from relevo_mensajes m
    where m.publicacion_id = new.publicacion_id
      and m.remitente_id is distinct from v_autor_id;
    return null;
  end if;

  -- (a) Un interesado escribe al autor.
  if new.es_postulacion and not exists (
    select 1 from relevo_mensajes m
    where m.publicacion_id = new.publicacion_id
      and m.remitente_id = new.remitente_id
      and m.es_postulacion
      and m.id <> new.id
  ) then
    v_tipo := 'relevo_postulacion';
    v_titulo := v_actor || ' validó tu oferta';
    -- "Solicitudes activas" (Aceptar/Rechazar) vive en la pestaña Ofertas.
    v_url := '/relevo?tab=ofertas';
  elsif exists (
    select 1 from relevo_mensajes m
    where m.publicacion_id = new.publicacion_id
      and m.remitente_id = new.remitente_id
      and m.id <> new.id
  ) then
    v_tipo := 'relevo_respuesta';
    v_titulo := v_actor || ' respondió sobre tu oferta';
    v_url := '/relevo?tab=mensajes';
  else
    v_tipo := 'relevo_mensaje';
    v_titulo := v_actor || ' te envió un mensaje';
    v_url := '/relevo?tab=mensajes';
  end if;

  insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
  values (
    v_autor_id,
    v_tipo,
    v_titulo,
    new.mensaje,
    v_url,
    'relevo_mensajes',
    new.id,
    new.remitente_id,
    jsonb_build_object('publicacion_id', new.publicacion_id)
  );

  return null;
end;
$$;

drop trigger if exists trg_relevo_mensajes_notificar on relevo_mensajes;
create trigger trg_relevo_mensajes_notificar
  after insert or update on relevo_mensajes
  for each row execute function relevo_mensajes_notificar();

-- A las funciones de trigger no las llama nadie: las dispara el motor (revocar
-- EXECUTE no impide que el trigger corra). Mismo cierre que 0017 le hizo a las
-- funciones de 0016 — sin esto quedan expuestas como RPC en /rest/v1/rpc/.
revoke execute on function relevo_mensajes_notificar() from public, anon, authenticated;

-- ============================================================================
-- 4. Triggers de Cobertura de Servicio (0023)
-- ============================================================================
-- Cambios de estado de la solicitud:
--   abierta → cubierta    (RPC cobertura_ofrecerse)      → avisa al autor
--   cubierta → finalizada (RPC cobertura_finalizar_servicio) → avisa al otro
--
-- Los dos RPC son `security definer`, pero `auth.uid()` dentro del trigger
-- sigue devolviendo al usuario que llamó (lee el JWT, no el rol de ejecución),
-- así que sirve para no notificar a quien provocó el hecho.
create or replace function cobertura_solicitudes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destinatario uuid;
  v_actor_id uuid;
begin
  if old.estado = 'abierta' and new.estado = 'cubierta' and new.medico_cobertura_id is not null then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      new.autor_id,
      'cobertura_ofrecimiento',
      notificaciones_nombre_actor(new.medico_cobertura_id) || ' se ofreció a cubrir tu servicio',
      new.tipo_servicio,
      '/cobertura-servicio/chat/' || new.id,
      'cobertura_solicitudes',
      new.id,
      new.medico_cobertura_id,
      jsonb_build_object('estado', new.estado)
    );
    return null;
  end if;

  if old.estado = 'cubierta' and new.estado = 'finalizada' then
    -- Finalizar lo puede hacer cualquiera de los dos: el aviso va al otro.
    if auth.uid() = new.autor_id then
      v_actor_id := new.autor_id;
      v_destinatario := new.medico_cobertura_id;
    else
      v_actor_id := new.medico_cobertura_id;
      v_destinatario := new.autor_id;
    end if;

    if v_destinatario is not null and v_destinatario is distinct from v_actor_id then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_destinatario,
        'cobertura_finalizada',
        notificaciones_nombre_actor(v_actor_id) || ' finalizó el servicio',
        new.tipo_servicio,
        '/cobertura-servicio',
        'cobertura_solicitudes',
        new.id,
        v_actor_id,
        jsonb_build_object('estado', new.estado)
      );
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_cobertura_solicitudes_notificar on cobertura_solicitudes;
create trigger trg_cobertura_solicitudes_notificar
  after update on cobertura_solicitudes
  for each row execute function cobertura_solicitudes_notificar();

revoke execute on function cobertura_solicitudes_notificar() from public, anon, authenticated;

-- Mensajes del chat de cobertura. El chat ya es en tiempo real mientras la
-- pantalla está abierta (0023); esto es para cuando NO lo está.
create or replace function cobertura_mensajes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor_id uuid;
  v_cobertura_id uuid;
  v_destinatario uuid;
begin
  select s.autor_id, s.medico_cobertura_id into v_autor_id, v_cobertura_id
  from cobertura_solicitudes s
  where s.id = new.solicitud_id;

  if new.remitente_id = v_autor_id then
    v_destinatario := v_cobertura_id;
  else
    v_destinatario := v_autor_id;
  end if;

  if v_destinatario is null or v_destinatario = new.remitente_id then
    return null;
  end if;

  insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
  values (
    v_destinatario,
    'cobertura_mensaje',
    notificaciones_nombre_actor(new.remitente_id) || ' te escribió en la cobertura',
    coalesce(nullif(new.mensaje, ''), new.archivo_nombre, 'Archivo adjunto'),
    '/cobertura-servicio/chat/' || new.solicitud_id,
    'cobertura_mensajes',
    new.id,
    new.remitente_id,
    jsonb_build_object('solicitud_id', new.solicitud_id)
  );

  return null;
end;
$$;

drop trigger if exists trg_cobertura_mensajes_notificar on cobertura_mensajes;
create trigger trg_cobertura_mensajes_notificar
  after insert on cobertura_mensajes
  for each row execute function cobertura_mensajes_notificar();

revoke execute on function cobertura_mensajes_notificar() from public, anon, authenticated;

-- ============================================================================
-- 5. Realtime (campana + pantalla en vivo)
-- ============================================================================
-- `add table` falla si ya está en la publicación, así que se hace condicional
-- para que la migración se pueda volver a correr sin romperse.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones'
  ) then
    execute 'alter publication supabase_realtime add table notificaciones';
  end if;
end
$$;

-- ============================================================================
-- 6. Backfill: lo que estaba sin leer antes de esta migración
-- ============================================================================
-- Para que la pantalla nueva no arranque vacía para quien ya tenía avisos
-- pendientes. Solo se reconstruye lo que las banderas de `relevo_mensajes`
-- todavía marcan como no visto — no hay forma de reconstruir el pasado ya
-- leído, ni Cobertura tiene bandera equivalente que mirar.
insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload, created_at)
select
  pub.autor_id,
  case when m.es_postulacion then 'relevo_postulacion' else 'relevo_mensaje' end,
  notificaciones_nombre_actor(m.remitente_id)
    || case when m.es_postulacion then ' validó tu oferta' else ' te envió un mensaje' end,
  m.mensaje,
  case when m.es_postulacion then '/relevo?tab=ofertas' else '/relevo?tab=mensajes' end,
  'relevo_mensajes',
  m.id,
  m.remitente_id,
  jsonb_build_object('publicacion_id', m.publicacion_id),
  m.created_at
from relevo_mensajes m
join relevo_publicaciones pub on pub.id = m.publicacion_id
where not m.leido
  and m.remitente_id is distinct from pub.autor_id
  and not exists (
    select 1 from notificaciones n
    where n.ref_tabla = 'relevo_mensajes'
      and n.ref_id = m.id
      and n.tipo in ('relevo_postulacion', 'relevo_mensaje', 'relevo_respuesta')
  );

insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload, created_at)
select
  m.remitente_id,
  'relevo_decision',
  'Tu postulación fue ' || m.estado,
  coalesce(nullif(pub.descripcion, ''), '(sin descripción)'),
  '/relevo?tab=mi-oferta',
  'relevo_mensajes',
  m.id,
  pub.autor_id,
  jsonb_build_object('estado', m.estado, 'publicacion_id', m.publicacion_id),
  m.created_at
from relevo_mensajes m
join relevo_publicaciones pub on pub.id = m.publicacion_id
where not m.decision_leida
  and m.estado in ('aceptada', 'rechazada')
  and m.remitente_id is distinct from pub.autor_id
  and not exists (
    select 1 from notificaciones n
    where n.ref_tabla = 'relevo_mensajes'
      and n.ref_id = m.id
      and n.tipo = 'relevo_decision'
  );
