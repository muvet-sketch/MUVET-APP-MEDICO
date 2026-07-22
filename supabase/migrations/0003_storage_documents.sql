-- ============================================================================
-- MUVET · App Médico — Migración 0003: Storage bucket 'documents'
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
--
-- Contexto: el bucket de Storage creado por el fundador se llama 'documents'
-- (no 'documentos', como asumía el código de Fase 1 en ActorProfileForm.jsx).
-- Además estaba marcado como privado y sin policies en storage.objects, por lo
-- que ninguna subida (carné COMVEZCOL, logo/firma D-552, foto de perfil)
-- podía funcionar contra el proyecto real. Esta migración:
--   1. Marca el bucket 'documents' como público (getPublicUrl funcional).
--   2. Agrega policies en storage.objects para que cada usuario autenticado
--      solo pueda subir/editar/borrar archivos dentro de su propia carpeta
--      (primer segmento de la ruta = su auth.uid()), siguiendo la convención
--      de path `${userId}/{proposito}-{timestamp}.{ext}` ya usada en el código.
-- ============================================================================

update storage.buckets set public = true where id = 'documents';

create policy "documents_select_public" on storage.objects
  for select using (bucket_id = 'documents');

create policy "documents_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_update_own_folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_delete_own_folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
