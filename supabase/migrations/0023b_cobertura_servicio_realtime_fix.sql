-- ============================================================================
-- MUVET · App Médico — Migración 0023b: cobertura_* en Realtime
-- ============================================================================
-- Hotfix aplicado justo después de 0023 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
-- ============================================================================

alter publication supabase_realtime add table cobertura_solicitudes;
alter publication supabase_realtime add table cobertura_mensajes;
