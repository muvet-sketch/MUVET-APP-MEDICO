-- ============================================================================
-- MUVET · App Médico — Migración 0001: Schema inicial (MVP v1.2, 18 pantallas)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
--
-- Reglas de negocio referenciadas (ver CLAUDE.md para el detalle completo):
--   D-043  SOAP absolutamente inaccesible para el tutor.
--   D-064  Dirección exacta del tutor oculta hasta que el médico confirma.
--   D-116  Doble consentimiento (tutor + médico) antes de abrir la Constelación.
--   D-537  checkin_llegada_at es inmutable una vez escrito.
--   D-541  Validación COMVEZCOL manual (perfiles.estado_validacion).
--   D-550  Toggle DISPONIBLE requiere >=1 servicio con precio > 0.
--   D-539  Sustancias controladas: aviso, no bloqueo.
--   D-540  Relevo: mensaje único, sin hilo de chat.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- perfiles
-- ============================================================================
create table if not exists perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  rol text not null check (rol in ('medico', 'auxiliar', 'clinica')),
  nombre_completo text,
  telefono text,
  foto_url text,
  zona_cobertura text,
  especialidad text,
  bio text,

  -- Solo médico
  matricula_comvezcol text,
  carne_url text,
  estado_validacion text default 'pendiente' check (estado_validacion in ('pendiente', 'validado', 'rechazado')),
  logo_firma_url text, -- D-552: estampado en Fórmula (N-12) y Recomendaciones (N-18)
  disponible boolean not null default false,

  -- Solo clínica
  razon_social text,
  nit text,
  direccion_sede text,

  created_at timestamptz not null default now()
);

-- ============================================================================
-- catalogo_servicios_medico (N-27)
-- ============================================================================
create table if not exists catalogo_servicios_medico (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references perfiles (id) on delete cascade,
  nombre_servicio text not null,
  descripcion text,
  precio numeric not null check (precio > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- tutores y mascotas
-- ============================================================================
-- En el MVP se crean como registros de referencia; la App Tutor real los poblará.
create table if not exists tutores (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text,
  telefono text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists mascotas (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid references tutores (id) on delete cascade,
  nombre text,
  especie text,
  raza text,
  sexo text,
  fecha_nacimiento date,
  peso_kg numeric,
  esterilizado boolean,
  alergias text,
  condiciones_preexistentes text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- solicitudes
-- ============================================================================
-- D-064: la dirección exacta NUNCA es visible antes de que el médico confirme
-- asistencia. La app debe consultar la vista `solicitudes_pre_aceptacion`
-- (que excluye direccion_exacta) antes de la aceptación, y solo puede leer
-- direccion_exacta de la tabla base post-aceptación. El control fino de RLS
-- por fila (para impedir el acceso directo a la tabla base antes de aceptar)
-- queda documentado como -- TODO Fase 7: hardening RLS completo.
create table if not exists solicitudes (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid references tutores (id),
  mascota_id uuid references mascotas (id),
  motivo_consulta text,
  zona_aproximada text,
  direccion_exacta text,
  tarifa_estimada numeric,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'expirada', 'cancelada')),
  medico_id uuid references perfiles (id),
  expira_en timestamptz,
  created_at timestamptz not null default now()
);

create or replace view solicitudes_pre_aceptacion as
  select
    id,
    tutor_id,
    mascota_id,
    motivo_consulta,
    zona_aproximada,
    tarifa_estimada,
    estado,
    medico_id,
    expira_en,
    created_at
  from solicitudes;
-- direccion_exacta queda deliberadamente excluida de esta vista (D-064).

-- ============================================================================
-- servicios
-- ============================================================================
create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid references solicitudes (id),
  medico_id uuid references perfiles (id),
  mascota_id uuid references mascotas (id),
  estado text not null default 'en_camino' check (estado in ('en_camino', 'en_apertura', 'activa', 'cerrada')),
  checkin_llegada_at timestamptz,
  consentimiento_tutor_at timestamptz,
  consentimiento_medico_at timestamptz,
  cerrado_at timestamptz,
  calificacion_tutor numeric,
  created_at timestamptz not null default now()
);

-- D-537: el timestamp de check-in de llegada es inmutable una vez escrito.
create or replace function fn_bloquear_update_checkin_llegada()
returns trigger as $$
begin
  if old.checkin_llegada_at is not null and new.checkin_llegada_at is distinct from old.checkin_llegada_at then
    raise exception 'checkin_llegada_at es inmutable una vez registrado (D-537)';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bloquear_update_checkin_llegada on servicios;
create trigger trg_bloquear_update_checkin_llegada
  before update on servicios
  for each row
  execute function fn_bloquear_update_checkin_llegada();

-- ============================================================================
-- soap_notas
-- ============================================================================
-- D-043: el SOAP es ABSOLUTAMENTE inaccesible para el tutor. Ninguna vista,
-- policy o endpoint debe exponer estas filas a un usuario con rol distinto
-- del médico dueño del servicio. Notación siempre S/O/A/P.
create table if not exists soap_notas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios (id) on delete cascade,
  s_subjetivo text,
  o_objetivo jsonb, -- constantes + hallazgos por sistema + fotos[]
  a_assessment jsonb, -- dx principal, diferenciales, estado_problema
  p_plan text,
  editado_por uuid references perfiles (id),
  editado_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- formulas y formula_items
-- ============================================================================
create table if not exists formulas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists formula_items (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid references formulas (id) on delete cascade,
  dci text not null, -- Denominación Común Internacional
  dosis text,
  via text,
  frecuencia text,
  duracion text,
  instrucciones text,
  contiene_controlada boolean not null default false, -- D-539
  created_at timestamptz not null default now()
);

-- ============================================================================
-- sustancias_controladas (lista semilla editable — Resolución 1478/2006)
-- ============================================================================
create table if not exists sustancias_controladas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

insert into sustancias_controladas (nombre)
values ('Tramadol'), ('Fenobarbital'), ('Ketamina'), ('Diazepam'), ('Morfina')
on conflict (nombre) do nothing;

-- ============================================================================
-- ordenes_externas
-- ============================================================================
create table if not exists ordenes_externas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios (id) on delete cascade,
  descripcion_examen text,
  laboratorio_destino text,
  resultado_archivo_url text,
  valores_manuales jsonb,
  interpretacion text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- vacunas y desparasitaciones
-- ============================================================================
create table if not exists vacunas (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid references mascotas (id) on delete cascade,
  producto text,
  lote text,
  laboratorio text,
  fecha_aplicacion date,
  proxima_dosis date,
  created_at timestamptz not null default now()
);

create table if not exists desparasitaciones (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid references mascotas (id) on delete cascade,
  tipo text,
  producto text,
  lote text,
  laboratorio text,
  fecha_aplicacion date,
  proxima_dosis date,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- seguimientos
-- ============================================================================
create table if not exists seguimientos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid references mascotas (id) on delete cascade,
  servicio_id uuid references servicios (id),
  fecha_programada date,
  descripcion text,
  estado text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- recomendaciones (documento separado del SOAP, visible al tutor)
-- ============================================================================
create table if not exists recomendaciones (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios (id) on delete cascade,
  contenido text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- relevo_publicaciones y relevo_mensajes
-- ============================================================================
create table if not exists relevo_publicaciones (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid references perfiles (id) on delete cascade,
  tipo text not null check (tipo in ('ofrezco', 'busco')),
  rol_objetivo text,
  descripcion text,
  zona text,
  fecha_inicio date,
  fecha_fin date,
  tipo_jornada text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- D-540: Relevo es un mensaje único de contacto. Sin hilo, sin chat en tiempo real.
create table if not exists relevo_mensajes (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid references relevo_publicaciones (id) on delete cascade,
  remitente_id uuid references perfiles (id),
  mensaje text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table perfiles enable row level security;
alter table catalogo_servicios_medico enable row level security;
alter table tutores enable row level security;
alter table mascotas enable row level security;
alter table solicitudes enable row level security;
alter table servicios enable row level security;
alter table soap_notas enable row level security;
alter table formulas enable row level security;
alter table formula_items enable row level security;
alter table sustancias_controladas enable row level security;
alter table ordenes_externas enable row level security;
alter table vacunas enable row level security;
alter table desparasitaciones enable row level security;
alter table seguimientos enable row level security;
alter table recomendaciones enable row level security;
alter table relevo_publicaciones enable row level security;
alter table relevo_mensajes enable row level security;

-- perfiles: cada usuario lee y escribe solo su propia fila.
create policy "perfiles_select_own" on perfiles for select using (auth.uid() = id);
create policy "perfiles_insert_own" on perfiles for insert with check (auth.uid() = id);
create policy "perfiles_update_own" on perfiles for update using (auth.uid() = id);

-- catalogo_servicios_medico: el médico gestiona solo su propio catálogo.
create policy "catalogo_select_own" on catalogo_servicios_medico for select using (auth.uid() = medico_id);
create policy "catalogo_insert_own" on catalogo_servicios_medico for insert with check (auth.uid() = medico_id);
create policy "catalogo_update_own" on catalogo_servicios_medico for update using (auth.uid() = medico_id);
create policy "catalogo_delete_own" on catalogo_servicios_medico for delete using (auth.uid() = medico_id);

-- servicios: el médico asignado lee y actualiza sus servicios.
create policy "servicios_select_medico" on servicios for select using (auth.uid() = medico_id);
create policy "servicios_update_medico" on servicios for update using (auth.uid() = medico_id);

-- soap_notas: D-043 — SOLO el médico dueño del servicio. Nunca el tutor.
create policy "soap_notas_select_medico_dueno" on soap_notas for select
  using (exists (
    select 1 from servicios s where s.id = soap_notas.servicio_id and s.medico_id = auth.uid()
  ));
create policy "soap_notas_write_medico_dueno" on soap_notas for all
  using (exists (
    select 1 from servicios s where s.id = soap_notas.servicio_id and s.medico_id = auth.uid()
  ))
  with check (exists (
    select 1 from servicios s where s.id = soap_notas.servicio_id and s.medico_id = auth.uid()
  ));

-- formulas / formula_items: el médico dueño del servicio asociado.
create policy "formulas_medico_dueno" on formulas for all
  using (exists (
    select 1 from servicios s where s.id = formulas.servicio_id and s.medico_id = auth.uid()
  ));
create policy "formula_items_medico_dueno" on formula_items for all
  using (exists (
    select 1 from formulas f join servicios s on s.id = f.servicio_id
    where f.id = formula_items.formula_id and s.medico_id = auth.uid()
  ));

-- sustancias_controladas: catálogo de solo lectura para cualquier usuario autenticado.
create policy "sustancias_controladas_select_authenticated" on sustancias_controladas
  for select using (auth.role() = 'authenticated');

-- ordenes_externas: el médico dueño del servicio.
create policy "ordenes_externas_medico_dueno" on ordenes_externas for all
  using (exists (
    select 1 from servicios s where s.id = ordenes_externas.servicio_id and s.medico_id = auth.uid()
  ));

-- recomendaciones: el médico dueño del servicio (visible al tutor se resuelve en Fase 7 vía API pública controlada).
create policy "recomendaciones_medico_dueno" on recomendaciones for all
  using (exists (
    select 1 from servicios s where s.id = recomendaciones.servicio_id and s.medico_id = auth.uid()
  ));

-- relevo_publicaciones: cualquier autenticado lee; solo el autor escribe/edita.
create policy "relevo_publicaciones_select_authenticated" on relevo_publicaciones
  for select using (auth.role() = 'authenticated');
create policy "relevo_publicaciones_write_autor" on relevo_publicaciones
  for insert with check (auth.uid() = autor_id);
create policy "relevo_publicaciones_update_autor" on relevo_publicaciones
  for update using (auth.uid() = autor_id);

-- relevo_mensajes: el remitente y el autor de la publicación pueden leer/escribir.
create policy "relevo_mensajes_select_participantes" on relevo_mensajes for select
  using (
    auth.uid() = remitente_id
    or exists (select 1 from relevo_publicaciones p where p.id = relevo_mensajes.publicacion_id and p.autor_id = auth.uid())
  );
create policy "relevo_mensajes_insert_remitente" on relevo_mensajes for insert
  with check (auth.uid() = remitente_id);

-- tutores, mascotas, solicitudes: acceso amplio para autenticados en MVP.
-- El hardening fino (p.ej. limitar solicitudes visibles por zona antes de aceptar,
-- o mascotas visibles solo si hay un servicio asociado) queda pendiente.
create policy "tutores_select_authenticated" on tutores for select using (auth.role() = 'authenticated');
create policy "mascotas_select_authenticated" on mascotas for select using (auth.role() = 'authenticated');
create policy "solicitudes_select_authenticated" on solicitudes for select using (auth.role() = 'authenticated');
create policy "vacunas_select_authenticated" on vacunas for select using (auth.role() = 'authenticated');
create policy "desparasitaciones_select_authenticated" on desparasitaciones for select using (auth.role() = 'authenticated');
create policy "seguimientos_select_authenticated" on seguimientos for select using (auth.role() = 'authenticated');

-- TODO Fase 7: hardening RLS completo (políticas finas por zona, por doble
-- consentimiento D-116, por relación tutor-mascota-servicio, y separación
-- estricta de escritura vs lectura en cada tabla listada arriba).
