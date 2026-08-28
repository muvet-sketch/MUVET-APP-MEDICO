-- ============================================================================
-- MUVET · App Médico — Migración 0033b: revocar EXECUTE de dos funciones trigger
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0033.
--
-- Se aplicó entre 0033 y 0034 (por eso el sufijo `b`, mismo criterio que la
-- serie 0028a–0028f). Reconciliado en el ledger el 2026-08-28.
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- Al crear las funciones de trigger de 0031/0032 quedaron con el EXECUTE por
-- defecto para `public`, así que el linter de Supabase las reporta como
-- SECURITY DEFINER invocables por `anon` y `authenticated` vía /rest/v1/rpc.
-- Son funciones de TRIGGER: nadie debería poder llamarlas a mano. Mismo
-- `revoke` que ya aplican los RPC de 0029.
--
-- Revocar no las rompe: PostgreSQL comprueba el permiso de EXECUTE al CREAR el
-- trigger, no cada vez que dispara.
--
-- PASOS MANUALES: ninguno.
-- ============================================================================

revoke execute on function apoyo_direccion_touch_conversacion() from public, anon, authenticated;
revoke execute on function cobertura_direccion_touch_solicitud() from public, anon, authenticated;
