-- ============================================================================
-- MUVET · App Médico — Migración 0027b: textos de notificación tras renombre UI
-- ============================================================================
-- Hotfix aplicado justo después de 0027 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
--
-- Ajuste de 0027: los títulos de notificación decían "MUVET Relevo", pero tras
-- el cambio de nombres de la UI ese nombre pasó al módulo médico↔médico
-- (cobertura_*). Los prefijos `relevo_*` son identificadores internos y NO se
-- renombran; solo el texto de cara al usuario. Ver src/lib/nombresModulos.js.
-- ============================================================================

create or replace function relevo_mensajes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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

  v_primero := not exists (
    select 1 from relevo_mensajes m
    where m.conversacion_id = new.conversacion_id and m.id <> new.id
  );

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
$fn$;

revoke execute on function relevo_mensajes_notificar() from public, anon, authenticated;

create or replace function relevo_conversaciones_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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
    return null;
  end if;

  select p.descripcion into v_descripcion
  from relevo_publicaciones p where p.id = new.publicacion_id;
  v_descripcion := coalesce(nullif(v_descripcion, ''), '(sin descripción)');
  v_url := '/relevo/conversacion/' || new.id;

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
$fn$;

revoke execute on function relevo_conversaciones_notificar() from public, anon, authenticated;
