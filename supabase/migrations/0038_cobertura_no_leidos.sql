-- ============================================================================
-- 0038 · MUVET Relevo (cobertura) — "sin leer" y orden por último mensaje
-- ============================================================================
-- ⚠️ NOMBRES: `cobertura` es el identificador interno de lo que la UI llama
-- "MUVET Relevo" (N-30, médico↔médico). Lo que en el código se llama `relevo`
-- es "MUVET Turnos". Ver src/lib/nombresModulos.js.
--
-- POR QUÉ
-- Turnos (0013/0027) y Auxiliar (0028) llevan `ultimo_mensaje_at` +
-- `leido_*_at` en su tabla de conversaciones, y de ahí salen el punto rojo de
-- "sin leer" y el orden de la bandeja. MUVET Relevo nunca las tuvo: su
-- negociación vive en la propia `cobertura_solicitudes`, que se creó (0023) sin
-- pensar en una bandeja de mensajes.
--
-- Eso dejaba al módulo cojo en N-34 · Mensajes (la bandeja unificada por
-- contacto): sus conversaciones no podían mostrar "sin leer" y se ordenaban por
-- `finalizada_at ?? created_at`, que es la fecha del SERVICIO, no la del último
-- mensaje. Esta migración cierra esa diferencia.
--
-- DECISIONES
--   · `ultimo_mensaje_at` es NULLABLE, a diferencia de apoyo_conversaciones
--     (0028), que lo tiene not null default now(). Allá la conversación nace
--     CON un primer mensaje; acá la solicitud existe desde antes de que haya
--     chat. null = "todavía nadie ha escrito", y así una solicitud 'abierta'
--     recién publicada no aparece como no leída.
--   · Las columnas de lectura se llaman `leido_autor_at` / `leido_cobertura_at`
--     siguiendo a `acuerdo_autor` / `acuerdo_cobertura` de 0034, no al
--     `leido_interesado_at` de los otros dos módulos: acá el otro lado es "quien
--     cubre", no "el interesado".
--   · Marcar leído va por RPC y no por policy de update, porque 0034 §2 le quitó
--     al cliente TODA policy de update sobre `cobertura_solicitudes` a
--     propósito. Se respeta esa frontera en vez de reabrirla.
--
-- Es aditiva: no cambia ningún estado ni ninguna policy existente.

-- ----------------------------------------------------------------------------
-- §1 · Columnas e índices
-- ----------------------------------------------------------------------------
alter table cobertura_solicitudes
  add column if not exists ultimo_mensaje_at timestamptz,
  add column if not exists leido_autor_at timestamptz,
  add column if not exists leido_cobertura_at timestamptz;

-- Mismo par de índices que apoyo_conversaciones (0028): la bandeja se consulta
-- por "mis filas de un lado o del otro", ordenadas por actividad.
create index if not exists cobertura_solicitudes_autor_msg_idx
  on cobertura_solicitudes (autor_id, ultimo_mensaje_at desc);
create index if not exists cobertura_solicitudes_cobertura_msg_idx
  on cobertura_solicitudes (medico_cobertura_id, ultimo_mensaje_at desc);


-- ----------------------------------------------------------------------------
-- §2 · Backfill de lo que ya existe
-- ----------------------------------------------------------------------------
-- Sin esto, todo chat anterior a esta migración se ordenaría como si nunca
-- hubiera tenido mensajes. Los que ya se purgaron (0034 §4.6) no tienen de
-- dónde sacar la fecha y se quedan en null, que es lo correcto: no hay mensajes
-- que leer.
update cobertura_solicitudes s
   set ultimo_mensaje_at = m.ultimo
  from (
    select solicitud_id, max(created_at) as ultimo
      from cobertura_mensajes
     group by solicitud_id
  ) m
 where m.solicitud_id = s.id
   and s.ultimo_mensaje_at is null;


-- ----------------------------------------------------------------------------
-- §3 · `ultimo_mensaje_at` lo escribe la BD, no el cliente
-- ----------------------------------------------------------------------------
-- Espejo de apoyo_conversaciones_touch (0028). Es un AFTER INSERT sobre los
-- mensajes: el cliente no puede mentir sobre cuándo se escribió el último.
--
-- No dispara notificaciones de más: trg_cobertura_solicitudes_notificar (0034
-- §8) solo reacciona a transiciones de `estado` y a cambios en las banderas de
-- acuerdo, y este update no toca ninguna de las dos.
create or replace function cobertura_solicitudes_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update cobertura_solicitudes
     set ultimo_mensaje_at = new.created_at
   where id = new.solicitud_id;
  return null;
end;
$$;

drop trigger if exists trg_cobertura_solicitudes_touch on cobertura_mensajes;
create trigger trg_cobertura_solicitudes_touch
  after insert on cobertura_mensajes
  for each row execute function cobertura_solicitudes_touch();

revoke execute on function cobertura_solicitudes_touch() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- §4 · Descartar una propuesta también borra los marcadores
-- ----------------------------------------------------------------------------
-- Reemplaza el de 0034 §4.3 añadiendo tres líneas al UPDATE final. El resto es
-- idéntico.
--
-- Es obligatorio, por el mismo motivo por el que aquel borra los mensajes: la
-- solicitud vuelve al tablón y otro médico puede ofrecerse. Si los marcadores
-- sobrevivieran, el próximo hilo heredaría la fecha del anterior — el nuevo
-- médico entraría con un chat vacío marcado como "no leído", y el autor con uno
-- ya "leído" que en realidad nunca vio.
create or replace function cobertura_descartar_propuesta(p_solicitud_id uuid)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid;
  v_cobertura uuid;
  v_estado text;
begin
  select autor_id, medico_cobertura_id, estado
    into v_autor, v_cobertura, v_estado
  from cobertura_solicitudes
  where id = p_solicitud_id;

  if v_autor is null then
    raise exception 'La solicitud no existe.';
  end if;
  if auth.uid() is distinct from v_autor and auth.uid() is distinct from v_cobertura then
    raise exception 'No participas en este servicio.';
  end if;
  if v_estado <> 'propuesta' then
    raise exception 'Esta solicitud no está en negociación.';
  end if;

  return query
  with borrados as (
    delete from cobertura_mensajes
    where solicitud_id = p_solicitud_id
    returning archivo_path
  )
  select b.archivo_path from borrados b where b.archivo_path is not null;

  update cobertura_solicitudes
     set estado = 'abierta',
         medico_cobertura_id = null,
         acuerdo_autor = false,
         acuerdo_cobertura = false,
         propuesta_at = null,
         -- 0038: el hilo se borró, los marcadores no pueden sobrevivirle.
         ultimo_mensaje_at = null,
         leido_autor_at = null,
         leido_cobertura_at = null
   where id = p_solicitud_id;
end;
$$;

revoke execute on function cobertura_descartar_propuesta(uuid) from public, anon;
grant  execute on function cobertura_descartar_propuesta(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- §5 · Marcar leído
-- ----------------------------------------------------------------------------
-- Escribe SOLO la columna del lado de quien llama: nadie puede marcar como
-- leído lo del otro. Idempotente y sin efectos sobre el estado.
create or replace function cobertura_marcar_leida(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid;
  v_cobertura uuid;
begin
  select autor_id, medico_cobertura_id
    into v_autor, v_cobertura
  from cobertura_solicitudes
  where id = p_solicitud_id;

  if v_autor is null then
    raise exception 'La solicitud no existe.';
  end if;

  if auth.uid() = v_autor then
    update cobertura_solicitudes
       set leido_autor_at = now()
     where id = p_solicitud_id;
  elsif auth.uid() = v_cobertura then
    update cobertura_solicitudes
       set leido_cobertura_at = now()
     where id = p_solicitud_id;
  else
    raise exception 'No participas en este servicio.';
  end if;
end;
$$;

revoke execute on function cobertura_marcar_leida(uuid) from public, anon;
grant  execute on function cobertura_marcar_leida(uuid) to authenticated;
