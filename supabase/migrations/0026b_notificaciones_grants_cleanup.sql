-- ============================================================================
-- MUVET · App Médico — Migración 0026b: cierre de permisos de 0026
-- ============================================================================
-- Hotfix aplicado justo después de 0026 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
--
-- Cierre de permisos de 0026, mismo criterio que el cleanup de 0017 sobre las
-- funciones de 0016.
-- ============================================================================

-- Las funciones de trigger no las llama nadie: las dispara el motor. Quedan
-- como relevo_cerrar_publicacion_por_cupos (0017): solo postgres/service_role.
revoke execute on function relevo_mensajes_notificar() from public, anon, authenticated;
revoke execute on function cobertura_solicitudes_notificar() from public, anon, authenticated;
revoke execute on function cobertura_mensajes_notificar() from public, anon, authenticated;
revoke execute on function notificaciones_solo_marcar_leida() from public, anon, authenticated;

-- El helper de nombres sí lo puede necesitar la app, pero NUNCA anon: no
-- tiene control de acceso propio (devuelve el nombre de cualquier perfil_id),
-- así que sin este revoke un anónimo podría resolver UUID → nombre. Queda
-- como relevo_soy_postulante (0017): postgres/authenticated/service_role.
revoke execute on function notificaciones_nombre_actor(uuid) from anon;
