-- ============================================================================
-- MUVET · App Médico — Migración 0034: MUVET Relevo — acuerdo mutuo, chat +24h
--                                      y salida del control de pagos
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0033.
--
-- ----------------------------------------------------------------------------
-- ⚠️ NOMBRES (ver src/lib/nombresModulos.js — los ids NO coinciden con la UI)
-- ----------------------------------------------------------------------------
--   UI "MUVET Relevo"    → N-30 · /cobertura-servicio · tablas cobertura_*
--   UI "MUVET Turnos"    → N-26 · /relevo             · tablas relevo_*
--   UI "MUVET Auxiliar"  → N-32 · /apoyo              · tablas apoyo_*
--
-- ----------------------------------------------------------------------------
-- Contexto — tres cambios pedidos por el fundador sobre MUVET Relevo
-- ----------------------------------------------------------------------------
--
-- 1. ACUERDO MUTUO (antes: ofrecerse cerraba el trato solo).
--    Era el único de los tres módulos gremiales sin confirmación de las dos
--    partes: `cobertura_ofrecerse` (0023) pasaba de 'abierta' a 'cubierta' en
--    un único UPDATE, sin que el autor —el médico que pasa el servicio— dijera
--    nada. Se alinea con `relevo_conversaciones` (0027) y `apoyo_conversaciones`
--    (0028): dos banderas de acuerdo y un `estado` DERIVADO de ellas.
--
--      abierta ──ofrecerse──→ propuesta ──ambos "De acuerdo"──→ cubierta
--                                 │                                 │
--                                 └──cualquiera descarta──→ abierta  └─→ finalizada
--
--    Diferencia con los otros dos módulos, y es deliberada: acá NO hay tabla de
--    conversaciones. Una solicitud de relevo es un servicio concreto con UN
--    solo cupo, no una oferta con N postulantes, así que la negociación vive en
--    la propia fila. La consecuencia es que descartar NO es terminal: devuelve
--    la solicitud al tablón ('abierta') para que otro médico pueda ofrecerse.
--    Sin eso, un médico que se ofrece y desaparece dejaría el servicio muerto.
--
--    Al descartar se BORRAN los mensajes de esa negociación: la solicitud
--    vuelve al tablón y el siguiente médico que se ofrezca pasa a ser
--    participante, con lo que la policy de `cobertura_mensajes` le dejaría leer
--    el hilo del anterior. No es un detalle de UI: es una fuga.
--
-- 2. CHAT 24 h DESPUÉS DE FINALIZAR (antes: se borraba en el acto).
--    `cobertura_finalizar_servicio` (0023) borraba los mensajes al cerrar el
--    servicio. Ahora el chat sigue vivo —se puede leer Y escribir— durante 24
--    horas contadas desde la finalización, y recién entonces se cierra.
--
--    SUPUESTO (reportado al fundador): "después de este tiempo ya no se podrá
--    chatear más" se implementa como CIERRE + BORRADO, no como cierre a secas.
--    Se mantiene así la regla original de 0023 ("sin historial del chat" es
--    retención real, no un filtro de UI); lo único que cambia es que la
--    retención pasa de 0 h a 24 h. Si el fundador quiere que el hilo quede
--    legible para siempre en solo lectura, se quita el borrado y basta con la
--    policy de insert.
--
--    Sin pg_cron en el proyecto, el borrado es PEREZOSO y best-effort, igual
--    que `expirarSolicitudesVencidas` en lib/solicitudes.js: la ventana la
--    cierra la RLS (que es la frontera real y no depende de que nadie pase por
--    ahí), y `cobertura_purgar_chats_vencidos` borra las filas cuando un
--    participante entra al módulo. El RPC DEVUELVE los paths de los adjuntos
--    porque Supabase no admite DELETE por SQL sobre storage.objects (ver la
--    cabecera de 0023): los archivos los borra el cliente con la Storage API.
--
-- 3. SIN CONTROL DE PAGOS en este módulo.
--    En MUVET Relevo el médico que releva le cobra directamente al tutor, así
--    que no hay pago entre las dos partes que marcar ni datos bancarios que
--    intercambiar. Se retiran los tres RPC de 0029/0033 (`cobertura_pago_marcar`,
--    `cobertura_pago_compartir`, `cobertura_datos_pago`). Las COLUMNAS `pago_*`
--    de `cobertura_solicitudes` se conservan —no se tira dato histórico— pero
--    quedan inertes: sin RPC no hay forma de escribirlas ni de leer los datos
--    de la contraparte. Turnos y Auxiliar no se tocan.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES: ninguno.
-- ============================================================================


-- ============================================================================
-- §1 · Columnas nuevas y estado 'propuesta'
-- ============================================================================
alter table cobertura_solicitudes
  add column if not exists acuerdo_autor     boolean not null default false,
  add column if not exists acuerdo_cobertura boolean not null default false,
  add column if not exists propuesta_at      timestamptz,
  add column if not exists chat_cierra_at    timestamptz;

comment on column cobertura_solicitudes.chat_cierra_at is
  'Instante en que el chat deja de admitir y de mostrar mensajes. Lo sella cobertura_finalizar_servicio en finalizada_at + 24 h.';

alter table cobertura_solicitudes drop constraint if exists cobertura_solicitudes_estado_check;
alter table cobertura_solicitudes add constraint cobertura_solicitudes_estado_check
  check (estado in ('abierta', 'propuesta', 'cubierta', 'finalizada', 'cancelada'));

create index if not exists cobertura_solicitudes_chat_cierra_idx
  on cobertura_solicitudes (chat_cierra_at)
  where chat_cierra_at is not null;

-- Backfill. Lo que ya está 'cubierta'/'finalizada' se acordó bajo las reglas
-- viejas (ofrecerse cerraba el trato): las dos banderas van a true para que la
-- UI no lo pinte como pendiente de confirmar.
update cobertura_solicitudes
   set acuerdo_autor = true,
       acuerdo_cobertura = true,
       propuesta_at = coalesce(propuesta_at, cubierta_at)
 where estado in ('cubierta', 'finalizada')
   and not (acuerdo_autor and acuerdo_cobertura);

-- Las ya finalizadas tienen el chat borrado desde antes de esta migración: su
-- ventana nace cerrada, no se les regalan 24 h retroactivas.
update cobertura_solicitudes
   set chat_cierra_at = coalesce(finalizada_at, now())
 where estado = 'finalizada'
   and chat_cierra_at is null;

-- §3 deja los pago_* inertes: se retira también el opt-in ya dado, para que
-- ningún dato bancario quede marcado como compartido en un módulo que ya no
-- tiene por dónde mostrarlo.
update cobertura_solicitudes
   set pago_datos_autor = false,
       pago_datos_cobertura = false
 where pago_datos_autor or pago_datos_cobertura;


-- ============================================================================
-- §2 · RLS de cobertura_solicitudes — el cliente deja de escribir la fila
-- ============================================================================
-- La policy de update de 0023 dejaba a los dos participantes escribir CUALQUIER
-- columna. Con dos banderas de acuerdo y un `estado` derivado de ellas eso es
-- insostenible: cualquiera podría marcar el acuerdo del otro o saltarse la
-- confirmación escribiendo 'cubierta' directo.
--
-- En vez de un trigger-guardián por columna (el camino de 0027 §2.2, que allá
-- era obligado porque la UI hacía updates sueltos), acá se cierra la puerta:
-- NO hay policy de update para el cliente y todas las transiciones pasan por
-- los RPC security definer de §4. Es la misma frontera, con menos superficie.
drop policy if exists "cobertura_solicitudes_update" on cobertura_solicitudes;

-- El select no cambia de forma, pero se reescribe para dejar constancia de que
-- 'propuesta' NO es pública: una solicitud en negociación sale del tablón y
-- solo la ven sus dos partes. Si la negociación se descarta vuelve a 'abierta'
-- y reaparece para todos.
drop policy if exists "cobertura_solicitudes_select" on cobertura_solicitudes;
create policy "cobertura_solicitudes_select" on cobertura_solicitudes
  for select using (
    estado = 'abierta' or autor_id = auth.uid() or medico_cobertura_id = auth.uid()
  );


-- ============================================================================
-- §3 · Fuera el control de pagos (ver punto 3 de la cabecera)
-- ============================================================================
drop function if exists cobertura_pago_marcar(uuid, boolean, text);
drop function if exists cobertura_pago_compartir(uuid, boolean);
drop function if exists cobertura_datos_pago(uuid);


-- ============================================================================
-- §4 · Transiciones — un RPC por movimiento
-- ============================================================================
-- Todos security definer y todos con el mismo contrato: validan quién llama y
-- en qué estado está la fila, y devuelven la fila resultante (o los paths de
-- los adjuntos a borrar, cuando toca limpiar el chat).

-- ----------------------------------------------------------------------------
-- 4.1 Ofrecerse a cubrir · abierta → propuesta
-- ----------------------------------------------------------------------------
-- Reemplaza el de 0023, que saltaba directo a 'cubierta'. Ahora solo abre la
-- negociación: ninguna de las dos banderas se marca acá — ofrecerse es sentarse
-- a coordinar, no cerrar el trato (mismo criterio que "Contactar" en Turnos y
-- Auxiliar). El UPDATE ... WHERE estado='abierta' sigue siendo atómico, así que
-- entre dos médicos ofreciéndose a la vez gana quien primero llega y el segundo
-- recibe null.
create or replace function cobertura_ofrecerse(p_solicitud_id uuid)
returns cobertura_solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila cobertura_solicitudes;
begin
  update cobertura_solicitudes
     set medico_cobertura_id = auth.uid(),
         estado = 'propuesta',
         propuesta_at = now(),
         acuerdo_autor = false,
         acuerdo_cobertura = false
   where id = p_solicitud_id
     and estado = 'abierta'
     and autor_id <> auth.uid()
  returning * into v_fila;

  return v_fila;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4.2 "Estoy de acuerdo" · propuesta → (propuesta | cubierta)
-- ----------------------------------------------------------------------------
-- El corazón del cambio. Cada lado marca SU bandera; `estado` se deriva de las
-- dos, nunca lo manda el cliente. Un acuerdo ya dado no se retira —si cambiaste
-- de idea, se descarta la propuesta—, mismo criterio que 0027 §2.2: así
-- "estoy de acuerdo" no sirve para sondear al otro.
create or replace function cobertura_acordar(p_solicitud_id uuid)
returns cobertura_solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila cobertura_solicitudes;
  v_ambos boolean;
begin
  select * into v_fila from cobertura_solicitudes where id = p_solicitud_id;

  if v_fila.id is null then
    raise exception 'La solicitud no existe.';
  end if;
  if auth.uid() is distinct from v_fila.autor_id
     and auth.uid() is distinct from v_fila.medico_cobertura_id then
    raise exception 'No participas en este servicio.';
  end if;
  if v_fila.estado <> 'propuesta' then
    raise exception 'Esta solicitud no está en negociación.';
  end if;

  if auth.uid() = v_fila.autor_id then
    v_fila.acuerdo_autor := true;
  else
    v_fila.acuerdo_cobertura := true;
  end if;

  v_ambos := v_fila.acuerdo_autor and v_fila.acuerdo_cobertura;

  update cobertura_solicitudes
     set acuerdo_autor = v_fila.acuerdo_autor,
         acuerdo_cobertura = v_fila.acuerdo_cobertura,
         -- Estado DERIVADO: acá es donde vive "si ambas partes están de
         -- acuerdo, el servicio queda tomado".
         estado = case when v_ambos then 'cubierta' else 'propuesta' end,
         cubierta_at = case when v_ambos then now() else cubierta_at end
   where id = p_solicitud_id
  returning * into v_fila;

  return v_fila;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4.3 Descartar la propuesta · propuesta → abierta
-- ----------------------------------------------------------------------------
-- Lo puede hacer cualquiera de los dos: el autor porque no le sirve ese médico,
-- o el médico porque se arrepintió. NO es terminal (ver la cabecera): la
-- solicitud vuelve al tablón para que otro se ofrezca.
--
-- Borra los mensajes de la negociación y devuelve los paths de los adjuntos
-- para que el cliente los quite de Storage. Es obligatorio, no higiene: sin
-- esto el próximo médico que se ofrezca pasaría a ser participante de la
-- solicitud y la policy de `cobertura_mensajes` le abriría el hilo anterior.
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
         propuesta_at = null
   where id = p_solicitud_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4.4 Cancelar la solicitud · abierta → cancelada
-- ----------------------------------------------------------------------------
-- Antes era un UPDATE directo del cliente (cancelarSolicitud en
-- lib/coberturaServicio.js). Se muda a RPC porque §2 le quitó al cliente la
-- policy de update. Sigue siendo solo del autor y solo mientras nadie se haya
-- ofrecido: con una propuesta viva hay que descartarla primero.
create or replace function cobertura_cancelar(p_solicitud_id uuid)
returns cobertura_solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila cobertura_solicitudes;
begin
  update cobertura_solicitudes
     set estado = 'cancelada'
   where id = p_solicitud_id
     and autor_id = auth.uid()
     and estado = 'abierta'
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'Solo puedes cancelar una solicitud tuya que siga abierta.';
  end if;

  return v_fila;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4.5 Finalizar el servicio · cubierta → finalizada (+ ventana de 24 h)
-- ----------------------------------------------------------------------------
-- Reemplaza el de 0023, que borraba los mensajes en el acto. Ahora solo sella
-- el cierre y abre la ventana: `chat_cierra_at = now() + 24 h`. Quién borra y
-- cuándo, en 4.6.
create or replace function cobertura_finalizar_servicio(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_participante boolean;
begin
  select exists (
    select 1 from cobertura_solicitudes
    where id = p_solicitud_id
      and (autor_id = auth.uid() or medico_cobertura_id = auth.uid())
      and estado = 'cubierta'
  ) into v_es_participante;

  if not v_es_participante then
    raise exception 'No autorizado o el servicio no está en curso.';
  end if;

  update cobertura_solicitudes
     set estado = 'finalizada',
         finalizada_at = now(),
         chat_cierra_at = now() + interval '24 hours'
   where id = p_solicitud_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4.6 Purga de los chats vencidos
-- ----------------------------------------------------------------------------
-- Best-effort y perezosa: la corre el cliente al entrar al módulo o al chat
-- (lib/coberturaServicio.js), igual que `expirarSolicitudesVencidas` con las
-- solicitudes de domicilio. Que nadie la corra NO reabre el chat: la ventana la
-- cierra la RLS de §5, esto solo hace efectivo el borrado.
--
-- Devuelve los paths de los adjuntos borrados porque Supabase no permite
-- DELETE por SQL sobre storage.objects ni desde security definer (comprobado
-- contra el proyecto real, ver la cabecera de 0023): los archivos los quita el
-- cliente con la Storage API, amparado por la policy de delete de §6.
create or replace function cobertura_purgar_chats_vencidos()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with borrados as (
    delete from cobertura_mensajes m
    using cobertura_solicitudes s
    where m.solicitud_id = s.id
      and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
      and s.estado = 'finalizada'
      and s.chat_cierra_at is not null
      and now() >= s.chat_cierra_at
    returning m.archivo_path
  )
  select b.archivo_path from borrados b where b.archivo_path is not null;
end;
$$;

revoke execute on function cobertura_ofrecerse(uuid) from public, anon;
grant  execute on function cobertura_ofrecerse(uuid) to authenticated;
revoke execute on function cobertura_acordar(uuid) from public, anon;
grant  execute on function cobertura_acordar(uuid) to authenticated;
revoke execute on function cobertura_descartar_propuesta(uuid) from public, anon;
grant  execute on function cobertura_descartar_propuesta(uuid) to authenticated;
revoke execute on function cobertura_cancelar(uuid) from public, anon;
grant  execute on function cobertura_cancelar(uuid) to authenticated;
revoke execute on function cobertura_finalizar_servicio(uuid) from public, anon;
grant  execute on function cobertura_finalizar_servicio(uuid) to authenticated;
revoke execute on function cobertura_purgar_chats_vencidos() from public, anon;
grant  execute on function cobertura_purgar_chats_vencidos() to authenticated;


-- ============================================================================
-- §5 · La ventana del chat, en RLS
-- ============================================================================
-- Dos funciones auxiliares para no repetir el predicado en cuatro policies. La
-- de `text` existe porque en storage.objects la solicitud llega como el primer
-- segmento del path: castearlo a uuid dentro de la policy reventaría con
-- cualquier objeto de otro bucket cuyo primer segmento no sea un uuid.
--
-- `stable` y no `immutable`: dependen de now() y de la fila.
create or replace function cobertura_chat_abierto_path(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cobertura_solicitudes s
    where s.id::text = p_folder
      and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
      and (
        s.estado in ('propuesta', 'cubierta')
        -- La ventana de 24 h. `chat_cierra_at` nulo en 'finalizada' solo puede
        -- venir de filas anteriores a esta migración: chat cerrado.
        or (s.estado = 'finalizada'
            and s.chat_cierra_at is not null
            and now() < s.chat_cierra_at)
      )
  );
$$;

create or replace function cobertura_chat_abierto(p_solicitud_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select cobertura_chat_abierto_path(p_solicitud_id::text);
$$;

revoke execute on function cobertura_chat_abierto_path(text) from public, anon;
grant  execute on function cobertura_chat_abierto_path(text) to authenticated;
revoke execute on function cobertura_chat_abierto(uuid) from public, anon;
grant  execute on function cobertura_chat_abierto(uuid) to authenticated;

-- El SELECT también se cierra al vencer la ventana, no solo el INSERT. Es lo
-- que hace que "ya no se podrá chatear más" no dependa de que la purga de 4.6
-- haya pasado por ahí: aunque las filas sigan existiendo, nadie las lee.
drop policy if exists "cobertura_mensajes_select_participantes" on cobertura_mensajes;
create policy "cobertura_mensajes_select_participantes" on cobertura_mensajes
  for select to authenticated
  using (cobertura_chat_abierto(solicitud_id));

-- Insert: se abre desde 'propuesta' (hay que poder coordinar ANTES de acordar,
-- que es justamente de lo que trata el acuerdo mutuo) y sigue vivo 24 h tras
-- finalizar.
drop policy if exists "cobertura_mensajes_insert_participantes" on cobertura_mensajes;
create policy "cobertura_mensajes_insert_participantes" on cobertura_mensajes
  for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and cobertura_chat_abierto(solicitud_id)
  );

-- Sigue sin haber policy de update/delete para el cliente: borrar el chat es
-- cosa de los RPC de 4.3 y 4.6.


-- ============================================================================
-- §6 · Storage 'cobertura-chat' — mismas tres puertas
-- ============================================================================
drop policy if exists "cobertura_chat_select_participantes" on storage.objects;
create policy "cobertura_chat_select_participantes" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cobertura-chat'
    and cobertura_chat_abierto_path((storage.foldername(name))[1])
  );

drop policy if exists "cobertura_chat_insert_participantes" on storage.objects;
create policy "cobertura_chat_insert_participantes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cobertura-chat'
    and cobertura_chat_abierto_path((storage.foldername(name))[1])
  );

-- OJO: el delete NO puede exigir la ventana abierta. Justo al revés que antes —
-- ahora se borra CUANDO YA VENCIÓ (4.6) o al descartar una propuesta (4.3), y
-- en el primero de los dos casos la ventana está cerrada por definición. Queda
-- acotado a los dos participantes de la solicitud, que es la garantía que
-- importa: nadie toca adjuntos de un servicio ajeno.
drop policy if exists "cobertura_chat_delete_participantes" on storage.objects;
create policy "cobertura_chat_delete_participantes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cobertura-chat'
    and exists (
      select 1 from cobertura_solicitudes s
      where s.id::text = (storage.foldername(name))[1]
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );


-- ============================================================================
-- §7 · Dirección de encuentro — se puede redactar durante la negociación
-- ============================================================================
-- 0032 dejaba escribir en 'abierta' y 'cubierta'. Con el estado intermedio hay
-- que añadir 'propuesta', o el autor perdería la posibilidad de redactarla
-- justo en el tramo en que está coordinando.
--
-- La policy de SELECT no se toca a propósito: el que cubre sigue sin verla
-- hasta 'cubierta', o sea hasta que HAY acuerdo de las dos partes. Con el
-- cambio de este archivo el criterio de D-064 queda de hecho más estricto que
-- antes, no menos: antes bastaba con ofrecerse.
drop policy if exists "cobertura_direccion_insert_autor" on cobertura_direccion;
create policy "cobertura_direccion_insert_autor" on cobertura_direccion
  for insert to authenticated
  with check (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = solicitud_id
        and s.autor_id = auth.uid()
        and s.estado in ('abierta', 'propuesta', 'cubierta')
    )
  );

drop policy if exists "cobertura_direccion_update_autor" on cobertura_direccion;
create policy "cobertura_direccion_update_autor" on cobertura_direccion
  for update to authenticated
  using (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = cobertura_direccion.solicitud_id
        and s.autor_id = auth.uid()
        and s.estado in ('abierta', 'propuesta', 'cubierta')
    )
  )
  with check (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = solicitud_id and s.autor_id = auth.uid()
    )
  );


-- ============================================================================
-- §8 · Notificaciones
-- ============================================================================
-- Vocabulario nuevo para las transiciones que antes no existían. Se conservan
-- todos los valores históricos, incluido 'cobertura_pago': §3 retira los RPC
-- que lo emitían, pero los avisos ya enviados siguen en la tabla.
alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    -- MUVET Turnos (tablas relevo_*)
    'relevo_contacto',
    'relevo_mensaje',
    'relevo_acuerdo',
    'relevo_confirmada',
    'relevo_descartada',
    'relevo_finalizada',
    'relevo_pago',
    'relevo_postulacion',      -- (histórico, previo a 0027)
    'relevo_decision',         -- (histórico, previo a 0027)
    'relevo_respuesta',        -- (histórico, previo a 0027)
    -- MUVET Relevo (tablas cobertura_*)
    'cobertura_ofrecimiento',
    'cobertura_mensaje',
    'cobertura_acuerdo',       -- 0034: la otra parte marcó "estoy de acuerdo"
    'cobertura_confirmada',    -- 0034: ambos de acuerdo, servicio tomado
    'cobertura_descartada',    -- 0034: la propuesta se deshizo, vuelve al tablón
    'cobertura_finalizada',
    'cobertura_pago',          -- (histórico, retirado en 0034 §3)
    -- MUVET Auxiliar (tablas apoyo_*)
    'apoyo_contacto',
    'apoyo_mensaje',
    'apoyo_acuerdo',
    'apoyo_confirmada',
    'apoyo_descartada',
    'apoyo_finalizada',
    'apoyo_pago'
  ));

-- Reemplaza el de 0026, que solo conocía abierta→cubierta y cubierta→finalizada.
-- Sigue siendo un AFTER UPDATE sobre la tabla: los RPC de §4 son updates como
-- cualquier otro, y `auth.uid()` sigue resolviendo al usuario real dentro de
-- una función security definer.
create or replace function cobertura_solicitudes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otro uuid;
begin
  -- 1. Alguien se ofreció a cubrir → avisa al autor.
  if old.estado = 'abierta' and new.estado = 'propuesta' and new.medico_cobertura_id is not null then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      new.autor_id,
      'cobertura_ofrecimiento',
      notificaciones_nombre_actor(new.medico_cobertura_id) || ' se ofreció a cubrir tu servicio',
      'Coordinen por el chat y confirmen los dos para cerrarlo.',
      '/cobertura-servicio/chat/' || new.id,
      'cobertura_solicitudes', new.id, new.medico_cobertura_id,
      jsonb_build_object('evento', 'ofrecimiento')
    );
    return null;
  end if;

  -- 2. La propuesta se deshizo → avisa al otro (a quien no la deshizo).
  if old.estado = 'propuesta' and new.estado = 'abierta' then
    v_otro := case when auth.uid() = old.autor_id then old.medico_cobertura_id else old.autor_id end;
    if v_otro is not null and v_otro is distinct from auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_otro,
        'cobertura_descartada',
        notificaciones_nombre_actor(auth.uid()) || ' descartó el relevo',
        'La solicitud volvió al tablón.',
        '/cobertura-servicio',
        'cobertura_solicitudes', new.id, auth.uid(),
        jsonb_build_object('evento', 'descartada')
      );
    end if;
    return null;
  end if;

  -- 3. Servicio tomado: ambos de acuerdo → avisa a quien confirmó primero.
  if old.estado = 'propuesta' and new.estado = 'cubierta' then
    v_otro := case when auth.uid() = new.autor_id then new.medico_cobertura_id else new.autor_id end;
    if v_otro is not null and v_otro is distinct from auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_otro,
        'cobertura_confirmada',
        'Relevo confirmado por ambas partes',
        new.tipo_servicio,
        '/cobertura-servicio/chat/' || new.id,
        'cobertura_solicitudes', new.id, auth.uid(),
        jsonb_build_object('evento', 'confirmada')
      );
    end if;
    return null;
  end if;

  -- 4. Un lado marcó su acuerdo y todavía falta el otro.
  if new.estado = 'propuesta'
     and (new.acuerdo_autor is distinct from old.acuerdo_autor
          or new.acuerdo_cobertura is distinct from old.acuerdo_cobertura) then
    v_otro := case when auth.uid() = new.autor_id then new.medico_cobertura_id else new.autor_id end;
    if v_otro is not null and v_otro is distinct from auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_otro,
        'cobertura_acuerdo',
        notificaciones_nombre_actor(auth.uid()) || ' está de acuerdo con el relevo',
        'Falta tu confirmación para cerrarlo.',
        '/cobertura-servicio/chat/' || new.id,
        'cobertura_solicitudes', new.id, auth.uid(),
        jsonb_build_object('evento', 'acuerdo')
      );
    end if;
    return null;
  end if;

  -- 5. Servicio finalizado → avisa al otro, con la ventana del chat.
  if old.estado = 'cubierta' and new.estado = 'finalizada' then
    v_otro := case when auth.uid() = new.autor_id then new.medico_cobertura_id else new.autor_id end;
    if v_otro is not null and v_otro is distinct from auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_otro,
        'cobertura_finalizada',
        notificaciones_nombre_actor(auth.uid()) || ' finalizó el servicio',
        'El chat sigue abierto 24 horas.',
        '/cobertura-servicio/chat/' || new.id,
        'cobertura_solicitudes', new.id, auth.uid(),
        jsonb_build_object('evento', 'finalizada')
      );
    end if;
    return null;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_cobertura_solicitudes_notificar on cobertura_solicitudes;
create trigger trg_cobertura_solicitudes_notificar
  after update on cobertura_solicitudes
  for each row execute function cobertura_solicitudes_notificar();

revoke execute on function cobertura_solicitudes_notificar() from public, anon, authenticated;
