-- ============================================================================
-- MUVET · App Médico — Migración 0031: el punto de encuentro se propaga en vivo
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0030.
--
-- ----------------------------------------------------------------------------
-- Contexto: el auxiliar no recibía la dirección
-- ----------------------------------------------------------------------------
-- Reportado probando MUVET Auxiliar (N-32): ambas partes confirmaron el
-- acuerdo, el médico escribió después la dirección de encuentro, y al auxiliar
-- no le llegó nunca.
--
-- No es un fallo de permisos — `apoyo_direccion_select_post_acuerdo` (0028)
-- ya se la deja leer en cuanto la conversación queda 'aceptada'. Es que nada
-- le AVISA de que apareció:
--
--   · `apoyo_direccion` está deliberadamente FUERA de la publicación
--     supabase_realtime (0028 §C.4: Realtime manda la fila entera y no sabe
--     enmascarar columnas).
--   · La pantalla solo vuelve a pedir la dirección cuando cambia
--     `conversacion.estado`. Si el médico la escribe o la edita DESPUÉS del
--     acuerdo, el estado ya no se mueve y la pantalla del auxiliar se queda
--     con lo que tenía (nada) hasta recargar a mano.
--
-- ----------------------------------------------------------------------------
-- La solución: una señal, no el dato
-- ----------------------------------------------------------------------------
-- En vez de publicar `apoyo_direccion` en Realtime, se publica un LATIDO:
-- `apoyo_conversaciones.direccion_actualizada_at`, que un trigger bumpea cada
-- vez que la dirección se escribe o se edita.
--
-- `apoyo_conversaciones` YA está en la publicación y ambas partes ya la leen y
-- ya tienen suscripción viva (subscribeConversacionApoyo). El cliente ve el
-- timestamp nuevo y vuelve a pedir la dirección por PostgREST, donde la policy
-- de select de 0028 decide como siempre.
--
-- Es mejor que publicar la tabla de direcciones por dos motivos:
--   1. La cautela de 0028 §C.4 queda intacta: el dato sensible nunca viaja por
--      websocket, solo la marca de tiempo de que alguien lo tocó.
--   2. No depende de que Realtime evalúe correctamente una policy con
--      subconsulta a otra tabla; el gate sigue siendo el de PostgREST, que es
--      el que ya está probado.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES: ninguno.
-- ============================================================================


-- ============================================================================
-- §1 · El latido en la fila de la conversación
-- ============================================================================
alter table apoyo_conversaciones
  add column if not exists direccion_actualizada_at timestamptz;


-- ============================================================================
-- §2 · Trigger que lo bumpea
-- ============================================================================
-- `security definer` a propósito: corre como owner (postgres), así que entra
-- por el mismo bypass que `apoyo_conversaciones_guardar_acuerdo` (0028 §C.5)
-- ya reconoce al inicio (`current_user in ('postgres','supabase_admin')`). Sin
-- eso, el UPDATE lo rechazaría el trigger de acuerdo por venir de un
-- participante sobre una conversación ya 'aceptada'.
create or replace function apoyo_direccion_touch_conversacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update apoyo_conversaciones
     set direccion_actualizada_at = now()
   where id = new.conversacion_id;
  return new;
end;
$$;

drop trigger if exists trg_apoyo_direccion_touch on apoyo_direccion;
create trigger trg_apoyo_direccion_touch
  after insert or update on apoyo_direccion
  for each row
  execute function apoyo_direccion_touch_conversacion();


-- ============================================================================
-- §3 · Backfill
-- ============================================================================
-- Las direcciones que ya existen quedan con el latido de su última edición, no
-- con NULL: así el cliente no confunde "nunca se tocó" con "no hay dato".
update apoyo_conversaciones c
   set direccion_actualizada_at = d.updated_at
  from apoyo_direccion d
 where d.conversacion_id = c.id
   and c.direccion_actualizada_at is null;


-- ============================================================================
-- §4 · Cerrar la función de trigger
-- ============================================================================
-- Nace con el EXECUTE por defecto para `public`, y el linter de Supabase la
-- reporta como SECURITY DEFINER invocable vía /rest/v1/rpc. Es una función de
-- TRIGGER: nadie debe poder llamarla a mano. Revocar no la rompe — PostgreSQL
-- comprueba EXECUTE al CREAR el trigger, no cada vez que dispara.
revoke execute on function apoyo_direccion_touch_conversacion() from public, anon, authenticated;
