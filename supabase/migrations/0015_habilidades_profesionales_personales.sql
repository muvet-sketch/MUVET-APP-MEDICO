-- ============================================================================
-- MUVET · App Médico — Migración 0015: habilidades profesionales y personales
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0014.
--
-- Contexto: Relevo pasa de una sola lista libre de habilidades a dos catálogos
-- cerrados (profesionales · personales) que viven en dos lugares:
--
--   1. En `perfiles` (médico y auxiliar): son la configuración del usuario.
--      Se editan desde N-8 (Perfil Médico) o desde el perfil inline del
--      auxiliar en N-28, y quedan activas cada vez que ese usuario crea o
--      activa su oferta en Relevo (el cliente las copia a la publicación).
--   2. En `relevo_publicaciones`: son las habilidades que la publicación
--      muestra. Para médico/auxiliar es la copia de su perfil; para una
--      clínica son las habilidades que ESPERA del candidato que vea o acepte
--      la oferta (por eso la clínica no tiene habilidades en su perfil).
--
-- `habilidades` (0012) se conserva tal cual como "otras habilidades" de texto
-- libre — no se migra nada a las columnas nuevas porque los valores existentes
-- ("Manejo de felinos", "Urgencias", "Cirugía") no pertenecen a los catálogos.
-- ============================================================================

alter table perfiles
  add column if not exists habilidades_profesionales text[] not null default '{}',
  add column if not exists habilidades_personales text[] not null default '{}';

alter table relevo_publicaciones
  add column if not exists habilidades_profesionales text[] not null default '{}',
  add column if not exists habilidades_personales text[] not null default '{}';

-- Hygiene: publicaciones creadas antes de que `rol_objetivo` fuera obligatorio
-- (D-545) quedaron en NULL. La pestaña Ofertas ya no filtra por rol_objetivo
-- —muestra toda publicación activa—, pero el campo se sigue usando para la
-- etiqueta de audiencia de cada tarjeta y para el label de "Mi Oferta", así
-- que se rellena con el objetivo por defecto de cada tipo.
update relevo_publicaciones set rol_objetivo = 'clinica' where rol_objetivo is null and tipo = 'ofrezco';
update relevo_publicaciones set rol_objetivo = 'medico' where rol_objetivo is null and tipo = 'busco';
