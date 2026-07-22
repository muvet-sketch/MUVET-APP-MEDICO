-- ============================================================================
-- MUVET · App Médico — Migración 0002: Notificaciones del perfil (N-8)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
-- No modifica 0001_schema_inicial.sql.
-- ============================================================================

alter table perfiles
  add column if not exists notif_solicitudes boolean not null default true,
  add column if not exists notif_relevo boolean not null default true;
