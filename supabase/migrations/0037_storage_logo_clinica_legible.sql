-- ============================================================================
-- MUVET · App Médico — Migración 0037: el logo de la clínica se puede LEER
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0036.
--
-- ----------------------------------------------------------------------------
-- Contexto — 0035 quedó a medias
-- ----------------------------------------------------------------------------
-- 0035 §1 expuso `perfiles_publico.foto_url` para los perfiles de rol
-- 'clinica', para que médicos y auxiliares vieran el logo junto al nombre en
-- los módulos gremiales. La vista quedó bien, pero el logo seguía sin verse:
-- todos los avatares caían a las iniciales.
--
-- La causa es que `foto_url` no es una URL, es un PATH del bucket privado
-- `documents` (`<uid>/logo-….png`, ver lib/storage.js). El cliente lo firma con
-- `createSignedUrl`, y firmar exige permiso de SELECT sobre esa fila de
-- `storage.objects`. La única policy de lectura del bucket es
-- `documents_select_own_folder` (0010): cada usuario solo puede leer su propia
-- carpeta. Un médico pidiendo el logo de una clínica recibía un error, el hook
-- `useSignedUrl` devolvía null y el Avatar mostraba iniciales.
--
-- Es decir: 0035 dio a conocer el path pero no el permiso para leerlo.
--
-- ----------------------------------------------------------------------------
-- Qué hace esta migración
-- ----------------------------------------------------------------------------
-- Agrega una SEGUNDA policy de SELECT sobre `documents` (las policies se
-- combinan con OR, así que `documents_select_own_folder` sigue intacta) que
-- permite leer un objeto SOLO si ese path exacto es el `foto_url` de un perfil
-- de rol 'clinica'. Nada más del bucket se abre: carné, matrícula, firma y
-- cualquier otro documento del mismo usuario siguen siendo privados, porque la
-- comparación es contra el path completo, no contra la carpeta.
--
-- Alcance idéntico al de 0035 ("solo clínicas", confirmado con el fundador).
-- Las fotos de médicos y auxiliares no se abren: `perfiles_publico` ni siquiera
-- devuelve su `foto_url`, y esta policy tampoco las contempla.
-- ============================================================================


-- ============================================================================
-- §1 · Helper: ¿este path es el logo de una clínica?
-- ============================================================================
-- Tiene que ser SECURITY DEFINER. `perfiles` solo deja leer la fila propia
-- (`perfiles_select_own`, 0001), así que un EXISTS escrito directamente dentro
-- de la policy se evaluaría con la RLS de quien mira y nunca encontraría la
-- fila de la clínica — la policy sería siempre falsa.
--
-- No filtra por `auth.uid()` a propósito: el logo es público para cualquier
-- autenticado, igual que el nombre de la clínica en `perfiles_publico`. La
-- función no revela el path (hay que traerlo ya sabido), solo confirma si el
-- que se pasa corresponde a un logo de clínica.
create or replace function es_logo_clinica(p_path text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from perfiles p
    where p.rol = 'clinica'
      and p.foto_url = p_path
  );
$$;

revoke execute on function es_logo_clinica(text) from public, anon;
grant execute on function es_logo_clinica(text) to authenticated;


-- ============================================================================
-- §2 · Policy de lectura del logo en el bucket `documents`
-- ============================================================================
drop policy if exists documents_select_logo_clinica on storage.objects;

create policy documents_select_logo_clinica
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and es_logo_clinica(name)
);
