-- ============================================================================
-- MUVET · App Médico — Migración 0005: Expediente del paciente (N-5) —
-- medicamentos actuales + alergias (Fase 3)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
-- No modifica 0001/0002/0003/0004.
--
-- 0001 ya creaba vacunas, desparasitaciones, y campos libres
-- mascotas.alergias / mascotas.condiciones_preexistentes — no se duplican.
-- Esta migración agrega las dos tablas estructuradas que faltaban para las
-- tabs "Medicamentos" y "Alergias" del expediente (N-5).
-- ============================================================================

create table if not exists medicamentos_actuales (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references mascotas (id) on delete cascade,
  nombre text not null,
  dosis text,
  frecuencia text,
  cronico boolean not null default false,
  desde date,
  prescrito_por text, -- texto libre: puede ser un médico externo a MUVET
  created_at timestamptz not null default now()
);

create table if not exists alergias (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references mascotas (id) on delete cascade,
  alergeno text not null,
  reaccion text,
  severidad text check (severidad in ('leve', 'moderada', 'severa')),
  registrado_por uuid references perfiles (id),
  fecha date,
  created_at timestamptz not null default now()
);

alter table medicamentos_actuales enable row level security;
alter table alergias enable row level security;

-- Solo lectura en esta fase: el registro/edición durante la consulta
-- (Constelación) se conecta en Fase 4/5 — TODO Fase 4/5: políticas de
-- insert/update restringidas al médico dentro de un servicio activo.
create policy "medicamentos_actuales_select_authenticated" on medicamentos_actuales
  for select using (auth.role() = 'authenticated');

create policy "alergias_select_authenticated" on alergias
  for select using (auth.role() = 'authenticated');
