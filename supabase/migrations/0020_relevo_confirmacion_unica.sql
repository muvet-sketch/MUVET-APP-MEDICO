-- ============================================================================
-- MUVET · App Médico — Migración 0020: Relevo — confirmación única
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0019.
--
-- Contexto: la confirmación doble de 0016 (autor Y postulante confirman por
-- separado, con `estado` derivado de dos banderas) resultó redundante en la
-- práctica — "Validar Oferta" (antes "Aceptar oferta") ya ES el compromiso
-- del interesado; pedirle una SEGUNDA confirmación después de que el autor
-- decide no agregaba nada, solo fricción. Se vuelve al modelo de 0011: una
-- sola decisión, del autor de la publicación (acepta o rechaza), conservando
-- lo que 0016–0019 sí aportaron (cupos, estado de publicación, mensaje de
-- contacto previo).
--
-- Nuevo flujo (N-26):
--   1. El interesado pulsa "Validar Oferta" → crea la postulación, 'pendiente'.
--   2. El autor de la oferta decide UNA vez: acepta o rechaza (terminal).
--   3. Al aceptar, ambas partes pueden enviarse un mensaje de contacto
--      directo (D-540 sigue intacto: mensaje único, no un hilo).
--
-- `confirmado_autor`/`confirmado_remitente` (0016) quedan sin uso: se
-- consolidan de nuevo en `estado` ('pendiente' | 'aceptada' | 'rechazada'),
-- que vuelve a escribirlo directamente el autor a través de la policy
-- `relevo_mensajes_update_autor_publicacion` (0011, intacta).
-- ============================================================================

-- Los relevos que ya habían llegado a 'confirmada' (ambas banderas en true)
-- se consolidan en 'aceptada' — es el mismo hecho de negocio, ahora con un
-- solo nombre de estado.
update relevo_mensajes set estado = 'aceptada' where estado = 'confirmada';

drop trigger if exists trg_relevo_mensajes_sync_estado on relevo_mensajes;
drop function if exists relevo_mensajes_sync_estado();

alter table relevo_mensajes drop constraint if exists relevo_mensajes_estado_check;
alter table relevo_mensajes add constraint relevo_mensajes_estado_check
  check (estado in ('pendiente', 'aceptada', 'rechazada'));

alter table relevo_mensajes
  drop column if exists confirmado_autor,
  drop column if exists confirmado_remitente;

-- Notifica al interesado cuando su postulación es decidida (campana +
-- "Mis postulaciones"). Arranca en `true` porque una fila recién creada
-- ('pendiente') no tiene ninguna decisión que notificar todavía; el trigger
-- de abajo la pone en `false` justo cuando el autor decide, y el propio
-- remitente la vuelve a poner en `true` al abrir "Mis postulaciones"
-- (marcarPostulacionesLeidas en lib/relevo.js).
alter table relevo_mensajes
  add column if not exists decision_leida boolean not null default true;

-- Reemplaza al trigger de sync de arriba. Dos cosas que antes garantizaba
-- ese trigger y que había que conservar:
--
-- 1. Que nadie escriba `estado` fuera de las reglas del negocio. La policy
--    `relevo_mensajes_update_remitente` (0016) no restringe columnas, así
--    que sin este guard un postulante podría escribirse su propia
--    aceptación; y sin el guard de INSERT, cualquiera podría insertar una
--    fila ya 'aceptada' directamente (antes lo evitaba el trigger BEFORE
--    INSERT OR UPDATE que forzaba el estado desde las banderas, que
--    arrancaban en false).
-- 2. Que la decisión sea terminal — mismo espíritu que 0018 con el estado de
--    la publicación: una vez aceptada o rechazada, no se puede revertir ni
--    cambiar de una a otra.
create or replace function relevo_mensajes_guardar_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado is distinct from 'pendiente' then
      raise exception 'Una postulación nueva siempre empieza pendiente.';
    end if;
    return new;
  end if;

  if new.estado is distinct from old.estado then
    if old.estado in ('aceptada', 'rechazada') then
      raise exception 'Esta postulación ya fue % y no se puede cambiar.', old.estado;
    end if;

    if not new.es_postulacion and new.estado = 'aceptada' then
      raise exception 'Un mensaje de solo contacto no puede aceptarse como relevo.';
    end if;

    if not exists (
      select 1 from relevo_publicaciones p
      where p.id = new.publicacion_id and p.autor_id = auth.uid()
    ) then
      raise exception 'Solo el autor de la oferta puede aceptar o rechazar una postulación.';
    end if;

    new.decision_leida := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_relevo_mensajes_guardar_decision on relevo_mensajes;
create trigger trg_relevo_mensajes_guardar_decision
  before insert or update on relevo_mensajes
  for each row execute function relevo_mensajes_guardar_decision();

-- Cierre de cupos (0016): ahora cuenta por `estado = 'aceptada'` en vez de
-- las dos banderas. La definición del trigger (after insert or update en
-- relevo_mensajes) no cambia, solo el cuerpo de la función.
create or replace function relevo_cerrar_publicacion_por_cupos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupos integer;
  v_confirmados integer;
begin
  select cupos into v_cupos from relevo_publicaciones where id = new.publicacion_id;
  if v_cupos is null then
    return null;
  end if;

  select count(distinct remitente_id) into v_confirmados
  from relevo_mensajes
  where publicacion_id = new.publicacion_id and estado = 'aceptada';

  if v_confirmados >= v_cupos then
    update relevo_publicaciones set activa = false where id = new.publicacion_id and activa;
  end if;

  return null;
end;
$$;
