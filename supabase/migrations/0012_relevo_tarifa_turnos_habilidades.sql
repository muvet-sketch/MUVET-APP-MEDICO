-- ============================================================================
-- MUVET · App Médico — Migración 0012: Relevo — tarifa, turnos y habilidades
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010/0011.
--
-- Contexto: "Editar oferta" en Mi Oferta (N-26) suma un campo de tarifa
-- solicitada, selección múltiple de disponibilidad (turno día / turno noche /
-- hospitalización / consulta) y habilidades personales (con opción de agregar
-- habilidades nuevas no listadas). `turnos` y `habilidades` son arrays de
-- texto libre — no hay catálogo cerrado en BD porque el usuario puede agregar
-- valores nuevos desde el formulario.
-- ============================================================================

alter table relevo_publicaciones
  add column if not exists tarifa numeric,
  add column if not exists turnos text[] not null default '{}',
  add column if not exists habilidades text[] not null default '{}';
