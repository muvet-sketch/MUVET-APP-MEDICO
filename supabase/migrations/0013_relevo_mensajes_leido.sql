-- ============================================================================
-- MUVET · App Médico — Migración 0013: Relevo — mensajes leído/no leído
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010/0011/0012.
--
-- Contexto: la campana de notificaciones (badge de mensajes sin leer) necesita
-- saber qué mensajes de `relevo_mensajes` ya vio el dueño de la publicación.
-- D-540 sigue intacto: esto es solo una bandera de lectura sobre el mismo
-- mensaje único, no habilita hilo ni chat en tiempo real.
-- ============================================================================

alter table relevo_mensajes
  add column if not exists leido boolean not null default false;

-- La campana necesita postgres_changes en INSERT (subscribeNuevosMensajesRelevo,
-- src/lib/relevo.js). Sin esto, el badge solo se actualiza al recargar la
-- pantalla — igual que `solicitudes`, que ya estaba en esta publicación
-- (subscribeNuevasSolicitudesPendientes en lib/solicitudes.js).
alter publication supabase_realtime add table relevo_mensajes;

-- Reutiliza la policy de update ya creada en 0011
-- ("relevo_mensajes_update_autor_publicacion", scoped a
-- publicacion.autor_id = auth.uid()) — no hace falta una policy nueva porque
-- esa ya permite al dueño de la publicación actualizar cualquier columna,
-- incluida `leido`.
