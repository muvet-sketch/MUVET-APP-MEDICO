-- ============================================================================
-- MUVET · App Médico — Migración 0010b: fase7 hardening — fix grant PUBLIC
-- ============================================================================
-- Hotfix aplicado justo después de 0010 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
--
-- Corrección: el EXECUTE estaba otorgado a PUBLIC (pseudo-rol = todos, incluido
-- anon), no a `anon` directamente. `revoke ... from anon` en la migración
-- anterior no tuvo efecto porque anon seguía heredando el privilegio vía
-- PUBLIC. Fix: revocar de PUBLIC y re-otorgar explícitamente a authenticated
-- (service_role/postgres ya tienen grants propios, no vía PUBLIC).
-- ============================================================================

revoke execute on function abrir_constelacion(uuid) from public;
revoke execute on function aceptar_solicitud(uuid) from public;
revoke execute on function actualizar_estado_formula(uuid, text) from public;
revoke execute on function actualizar_items_orden(uuid, text, jsonb, text) from public;
revoke execute on function agregar_formula_item(uuid, text, text, text, text, text, text, boolean) from public;
revoke execute on function aprobar_recomendaciones(uuid) from public;
revoke execute on function cancelar_servicio(uuid) from public;
revoke execute on function cargar_resultado_orden(uuid, text, jsonb, text) from public;
revoke execute on function cerrar_servicio(uuid) from public;
revoke execute on function crear_orden_externa(uuid, text, jsonb, text) from public;
revoke execute on function eliminar_formula_item(uuid) from public;
revoke execute on function emitir_orden_externa(uuid) from public;
revoke execute on function expirar_solicitudes_vencidas() from public;
revoke execute on function guardar_recomendaciones(uuid, text, text, text, text) from public;
revoke execute on function guardar_soap_nota(uuid, text, jsonb, jsonb, text) from public;
revoke execute on function obtener_o_crear_formula(uuid) from public;
revoke execute on function rechazar_solicitud(uuid) from public;
revoke execute on function registrar_checkin_llegada(uuid) from public;
revoke execute on function registrar_consentimiento_medico(uuid, boolean) from public;
revoke execute on function registrar_respuesta_tutor(uuid, boolean) from public;
revoke execute on function reintentar_consentimiento_tutor(uuid) from public;
revoke execute on function simular_calificacion_tutor(uuid, integer, text) from public;
revoke execute on function solicitar_correccion_soap(uuid, text, text, text) from public;

grant execute on function abrir_constelacion(uuid) to authenticated;
grant execute on function aceptar_solicitud(uuid) to authenticated;
grant execute on function actualizar_estado_formula(uuid, text) to authenticated;
grant execute on function actualizar_items_orden(uuid, text, jsonb, text) to authenticated;
grant execute on function agregar_formula_item(uuid, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function aprobar_recomendaciones(uuid) to authenticated;
grant execute on function cancelar_servicio(uuid) to authenticated;
grant execute on function cargar_resultado_orden(uuid, text, jsonb, text) to authenticated;
grant execute on function cerrar_servicio(uuid) to authenticated;
grant execute on function crear_orden_externa(uuid, text, jsonb, text) to authenticated;
grant execute on function eliminar_formula_item(uuid) to authenticated;
grant execute on function emitir_orden_externa(uuid) to authenticated;
grant execute on function expirar_solicitudes_vencidas() to authenticated;
grant execute on function guardar_recomendaciones(uuid, text, text, text, text) to authenticated;
grant execute on function guardar_soap_nota(uuid, text, jsonb, jsonb, text) to authenticated;
grant execute on function obtener_o_crear_formula(uuid) to authenticated;
grant execute on function rechazar_solicitud(uuid) to authenticated;
grant execute on function registrar_checkin_llegada(uuid) to authenticated;
grant execute on function registrar_consentimiento_medico(uuid, boolean) to authenticated;
grant execute on function registrar_respuesta_tutor(uuid, boolean) to authenticated;
grant execute on function reintentar_consentimiento_tutor(uuid) to authenticated;
grant execute on function simular_calificacion_tutor(uuid, integer, text) to authenticated;
grant execute on function solicitar_correccion_soap(uuid, text, text, text) to authenticated;
