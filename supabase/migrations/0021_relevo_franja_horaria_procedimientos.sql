-- ============================================================================
-- MUVET · App Médico — Migración 0021: Relevo — franja horaria y procedimientos
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0020.
--
-- Contexto: el creador de ofertas (N-26) suma una franja horaria (hora de
-- inicio + duración del turno, con hora de fin calculada en cliente a partir
-- de esas dos) sobre las 3 jornadas existentes (renombradas en frontend a
-- "Turno completo" / "Medio turno" / "Varios días" — sin CHECK constraint
-- sobre `tipo_jornada`, así que no requiere migrar filas existentes).
--
-- Además, cuando el médico solicita apoyo a un auxiliar (busco:auxiliar),
-- puede definir la oferta por procedimiento (asistencia en consulta/cirugía/
-- ecografía/rayos X, toma de muestras) en vez de por jornada. `procedimientos`
-- es un array de texto libre, mismo patrón que `turnos`/`habilidades` (0012):
-- sin catálogo cerrado en BD porque el formulario permite agregar valores
-- nuevos no listados.
-- ============================================================================

alter table relevo_publicaciones
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time,
  add column if not exists duracion_horas numeric,
  add column if not exists procedimientos text[] not null default '{}';
