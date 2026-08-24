-- ============================================================================
-- MUVET · App Médico — Migración 0024: Verificación automática COMVEZCOL
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0023.
--
-- Contexto: hasta ahora la validación de la matrícula COMVEZCOL era 100%
-- manual — el médico la ingresaba (N-1 registro / N-8 perfil), el perfil
-- quedaba en estado_validacion='pendiente' y alguien tenía que consultar a
-- mano el registro público del Consejo Profesional de Medicina Veterinaria y
-- Zootecnia de Colombia y cambiar el estado en el Dashboard.
--
-- MODIFICACIÓN EXPLÍCITA A D-541 ("Validación COMVEZCOL manual"): confirmada
-- con el fundador. La validación pasa a ser AUTOMÁTICA cuando la consulta al
-- registro público arroja una coincidencia inequívoca, con RESPALDO MANUAL en
-- todos los demás casos. Lo que NO cambia de D-541: sin matrícula validada el
-- médico no puede activar disponibilidad (el bloqueo del toggle sigue leyendo
-- estado_validacion, ver DisponibleToggle.jsx), y el plazo ≤24h sigue
-- aplicando para los casos que caen a revisión manual.
--
-- La automatización NUNCA rechaza: si no hay coincidencia, hay más de una, o
-- el servicio externo falla, el perfil se queda en 'pendiente' y cae al flujo
-- manual. 'rechazado' sigue siendo una decisión exclusivamente humana — un
-- fallo de red no puede dejar fuera a un médico legítimo.
--
-- La consulta la ejecuta la Edge Function `verificar-comvezcol`
-- (supabase/functions/verificar-comvezcol/index.ts), nunca el cliente.
-- ============================================================================

-- ============================================================================
-- perfiles.fecha_validacion
-- ============================================================================
-- Resuelve el `// SUPUESTO` que quedó anotado en
-- src/screens/n8-perfil-medico/MatriculaSection.jsx ("perfiles no tiene
-- columna de fecha de validación en el esquema actual"). Se escribe tanto en
-- la validación automática como cuando alguien valide a mano.
alter table perfiles add column if not exists fecha_validacion timestamptz;

-- ============================================================================
-- validaciones_comvezcol — bitácora de auditoría
-- ============================================================================
-- Ahora que una máquina decide sobre una credencial profesional, cada intento
-- queda registrado con lo que devolvió el registro público. Sirve para dos
-- cosas: (a) que quien revise manualmente un 'pendiente' vea por qué no se
-- pudo automatizar, y (b) dejar rastro de en qué se basó una aprobación
-- automática.
create table if not exists validaciones_comvezcol (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references perfiles (id) on delete cascade,

  resultado text not null check (resultado in (
    'validado',          -- coincidencia inequívoca → estado_validacion='validado'
    'sin_coincidencia',  -- 0 filas, o el nombre no concuerda → revisión manual
    'ambiguo',           -- >1 fila o matrícula no numérica → respuesta no confiable
    'error'              -- red/timeout/HTML inesperado → revisión manual
  )),

  matricula_consultada text,
  nombre_encontrado text,
  detalle jsonb,

  created_at timestamptz not null default now()
);

create index if not exists validaciones_comvezcol_medico_idx
  on validaciones_comvezcol (medico_id, created_at desc);

alter table validaciones_comvezcol enable row level security;

-- Select: el médico ve únicamente sus propios intentos.
create policy "validaciones_comvezcol_select_own" on validaciones_comvezcol
  for select using (medico_id = auth.uid());

-- Sin policy de insert/update/delete para el cliente: solo la Edge Function
-- (service role, que salta RLS) escribe en esta tabla. Si el cliente pudiera
-- insertar acá, la bitácora dejaría de ser evidencia y pasaría a ser algo que
-- el propio interesado puede fabricar.
