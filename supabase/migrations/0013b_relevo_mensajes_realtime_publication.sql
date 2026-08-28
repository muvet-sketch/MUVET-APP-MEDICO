-- ============================================================================
-- MUVET · App Médico — Migración 0013b: relevo_mensajes en Realtime
-- ============================================================================
-- Hotfix aplicado entre 0013 y 0014 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
-- ============================================================================

alter publication supabase_realtime add table relevo_mensajes;
