-- ============================================================================
-- MUVET · App Médico — Migración 0011: Relevo — "Ofertas" / "Mi Oferta"
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010.
--
-- Contexto: la pestaña "Buscar" de N-26 pasa a llamarse "Ofertas" (botón
-- "Aceptar oferta" en vez de "Contactar") y la pestaña "Publicar" pasa a
-- llamarse "Mi Oferta" (resumen + activar/desactivar + editar + solicitudes
-- recibidas con acción "Aceptar oferta"). Esto introduce un estado de
-- aceptación de dos pasos sobre `relevo_mensajes` (quien navega "Aceptar
-- oferta" crea una fila 'pendiente'; el dueño de la publicación la marca
-- 'aceptada' desde "Mi Oferta"), similar en espíritu al doble consentimiento
-- de D-116 pero acotado a Relevo — D-540 (mensaje único, sin chat en tiempo
-- real) sigue intacto: `estado` es una bandera sobre el mismo mensaje único,
-- no habilita un hilo de conversación.
-- ============================================================================

alter table relevo_mensajes
  add column if not exists estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada'));

-- Antes solo existían policies de select (participantes) e insert (remitente).
-- Falta la de update: el dueño de la publicación necesita poder marcar una
-- solicitud recibida como 'aceptada' (o 'rechazada') sin poder tocar el
-- contenido del mensaje en sí (eso lo deja intacto el check de abajo, que no
-- restringe columnas — se confía en que el cliente solo mande `estado` en el
-- payload, igual que el resto de la capa de acceso a datos de este repo).
create policy "relevo_mensajes_update_autor_publicacion" on relevo_mensajes
  for update using (
    exists (select 1 from relevo_publicaciones p where p.id = relevo_mensajes.publicacion_id and p.autor_id = auth.uid())
  )
  with check (
    exists (select 1 from relevo_publicaciones p where p.id = relevo_mensajes.publicacion_id and p.autor_id = auth.uid())
  );
