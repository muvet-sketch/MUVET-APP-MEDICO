-- ============================================================================
-- MUVET · App Médico — Migración 0014: Relevo — vista pública de perfiles
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010/0011/0012/0013.
--
-- Bug reportado: en N-26 · Ofertas, los botones de filtro por rol del autor
-- solo funcionaban con "Todo". Causa raíz: `perfiles_select_own` (0001) solo
-- permite a un usuario leer su PROPIA fila — el join `autor:autor_id(...)`
-- en fetchPublicacionesActivas (lib/relevo.js) siempre devolvía null para
-- publicaciones de otros usuarios, así que `p.autor?.rol` nunca coincidía
-- con ningún botón de filtro específico. Lo mismo afectaba al nombre del
-- autor mostrado en cada tarjeta (caía siempre al placeholder "Usuario
-- MUVET") y a la lista de remitentes en "Solicitudes recibidas" (Mi Oferta).
--
-- Fix: una vista con SOLO columnas no sensibles (rol, nombre, razón social)
-- que cualquier autenticado puede leer, sin tocar la RLS de `perfiles` —
-- matrícula COMVEZCOL, carné, NIT, dirección de sede y teléfono siguen
-- protegidos por `perfiles_select_own` y NO se exponen aquí. Las vistas en
-- Postgres se ejecutan con los privilegios de quien las crea (no aplican la
-- RLS de la tabla base a quien las consulta), así que esto no requiere una
-- policy adicional en `perfiles`.
--
-- SUPUESTO: el teléfono del remitente en "Solicitudes recibidas" (D-540,
-- contacto tras aceptar) sigue sin resolverse — necesitaría una función
-- security definer que valide que el que pregunta es el dueño de la
-- publicación antes de revelarlo. Fuera de alcance de este fix; queda
-- pendiente como mejora futura.
-- ============================================================================

create or replace view perfiles_publico
with (security_invoker = false)
as
select id, rol, nombre_completo, razon_social
from perfiles;

grant select on perfiles_publico to authenticated;
