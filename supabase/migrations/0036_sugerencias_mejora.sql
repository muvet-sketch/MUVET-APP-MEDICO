-- ============================================================================
-- MUVET · App Médico — Migración 0036: "Ayúdanos a Mejorar" (recomendaciones
-- de producto, cualquier rol)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0035.
--
-- Contexto: opción nueva del menú hamburguesa (src/components/ui/AppMenu.jsx),
-- abierta a los 3 actores (medico/auxiliar/clinica). El usuario escribe una
-- recomendación en texto libre y adjunta hasta 4 imágenes. El feedback es para
-- el fundador y se lee por el Dashboard:
--
--     select * from sugerencias_mejora_pendientes;
--
-- NO se responde al usuario dentro de la app, y la pantalla tampoco lista lo
-- ya enviado: envía y confirma con un Toast, nada más. La columna `estado`
-- existe solo para el triage del fundador.
--
-- Es un espejo de soporte_tickets (0025 §5): insert propio, select propio, sin
-- update/delete para el cliente. A diferencia de soporte_tickets, este SÍ exige
-- `not perfil_en_disputa()` en el insert — mandar ideas de producto no es un
-- canal esencial para quien está bloqueado por posible suplantación (contactar
-- a soporte sí lo es, por eso aquel se dejó abierto a propósito).
--
-- Storage: a diferencia de 0003 ('documents') y 0023 ('cobertura-chat'), acá el
-- bucket SÍ se crea por SQL (§0 más abajo) y no a mano en el Dashboard —
-- funciona y de paso deja los límites (5MB, solo PNG/JPG) aplicados en el
-- servidor y no solo en fileValidation.js del cliente.
--
-- Convención de ruta: `${perfil_id}/${timestamp}-${i}.${ext}` — owner-folder,
-- igual que 'documents' (0003) y a diferencia de los buckets de chat, donde el
-- primer segmento es la conversación porque el archivo lo leen DOS personas.
-- Acá el archivo es de una sola persona, así que el primer segmento es el
-- perfil (perfiles.id = auth.uid(), ver 0001).
-- ============================================================================

-- ============================================================================
-- 0. Bucket privado 'sugerencias-mejora'
-- ============================================================================
-- `on conflict do nothing` para que la migración se pueda volver a correr.
-- public = false: las imágenes solo se miran con signed url, y solo las emite
-- quien pasa las policies de §3.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sugerencias-mejora', 'sugerencias-mejora', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- ============================================================================
-- 1. Tabla sugerencias_mejora
-- ============================================================================
create table if not exists sugerencias_mejora (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  texto text not null,
  -- Paths del bucket privado, NO urls: se resuelven a signed url al mirarlas.
  imagenes text[] not null default '{}',
  estado text not null default 'nueva'
    check (estado in ('nueva', 'en_revision', 'planificada', 'implementada', 'descartada')),
  created_at timestamptz not null default now()
);

create index if not exists sugerencias_mejora_perfil_idx
  on sugerencias_mejora (perfil_id, created_at desc);
create index if not exists sugerencias_mejora_estado_idx
  on sugerencias_mejora (estado);

alter table sugerencias_mejora enable row level security;

-- ============================================================================
-- 2. RLS: crear la propia, leer la propia
-- ============================================================================
-- Sin update ni delete para el cliente: el `estado` lo mueve el fundador desde
-- el Dashboard, y una recomendación enviada no se edita ni se borra (mismo
-- criterio que soporte_tickets, 0025 §5).
drop policy if exists "sugerencias_mejora_insert_own" on sugerencias_mejora;
create policy "sugerencias_mejora_insert_own" on sugerencias_mejora
  for insert to authenticated
  with check (perfil_id = auth.uid() and not perfil_en_disputa());

drop policy if exists "sugerencias_mejora_select_own" on sugerencias_mejora;
create policy "sugerencias_mejora_select_own" on sugerencias_mejora
  for select to authenticated
  using (perfil_id = auth.uid());

-- ============================================================================
-- 3. Storage: policies del bucket privado 'sugerencias-mejora'
-- ============================================================================
-- Owner-folder: (storage.foldername(name))[1] = auth.uid()::text. Nadie ve las
-- imágenes de otro, ni siquiera con el path exacto — el bucket es privado y la
-- signed url solo la puede emitir quien pasa esta policy.
drop policy if exists "sugerencias_mejora_storage_select_own" on storage.objects;
create policy "sugerencias_mejora_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sugerencias-mejora'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "sugerencias_mejora_storage_insert_own" on storage.objects;
create policy "sugerencias_mejora_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sugerencias-mejora'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: para que el usuario pueda limpiar lo suyo y para poder recoger a mano
-- imágenes huérfanas (si el insert de la fila falla después de subirlas).
drop policy if exists "sugerencias_mejora_storage_delete_own" on storage.objects;
create policy "sugerencias_mejora_storage_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sugerencias-mejora'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 4. sugerencias_mejora_pendientes — la bandeja del fundador
-- ============================================================================
-- Dashboard → SQL Editor → `select * from sugerencias_mejora_pendientes;`
-- Trae la recomendación + quién la mandó (nombre y rol). Las imágenes son paths
-- del bucket privado: para verlas, Storage → sugerencias-mejora → esa carpeta.
--
-- security_invoker = true + revoke: NO queda expuesta a los usuarios de la app
-- (mostraría recomendaciones de terceros con su nombre). Solo la leen el
-- service role y el Dashboard. Mismo criterio que revision_matriculas_pendientes
-- (0025 §6) y que la corrección de 0007_fix_security_invoker.
create or replace view sugerencias_mejora_pendientes
with (security_invoker = true) as
select
  s.id,
  s.created_at,
  s.estado,
  s.texto,
  s.imagenes,
  cardinality(s.imagenes)   as n_imagenes,
  s.perfil_id,
  p.nombre_completo,
  p.razon_social,
  p.rol
from sugerencias_mejora s
join perfiles p on p.id = s.perfil_id
order by
  -- Primero lo que nadie ha mirado todavía.
  case s.estado
    when 'nueva' then 0
    when 'en_revision' then 1
    else 2
  end,
  s.created_at desc;

revoke all on sugerencias_mejora_pendientes from anon, authenticated;
