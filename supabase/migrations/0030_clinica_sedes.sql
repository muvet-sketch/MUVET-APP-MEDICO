-- ============================================================================
-- MUVET · App Médico — Migración 0030: Sedes de la clínica + ubicación de oferta
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0029.
--
-- ----------------------------------------------------------------------------
-- ⚠️ NOMBRES (ver src/lib/nombresModulos.js — los ids NO coinciden con la UI)
-- ----------------------------------------------------------------------------
--   UI "MUVET Turnos"    → tablas relevo_*    → publicaciones: relevo_publicaciones
--   UI "MUVET Relevo"    → tablas cobertura_*
--   UI "MUVET Auxiliar"  → tablas apoyo_*
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- Las ofertas de las clínicas NO aparecían bajo el filtro de cercanía de la
-- pestaña "Ofertas" (N-26). La causa es de datos, no de UI:
--
--   · El perfil de clínica solo tenía `direccion_sede`, texto libre con una
--     dirección de calle, y `zona_cobertura` quedaba NULL (ver
--     ActorProfileForm.jsx: `zona_cobertura: rol !== 'clinica' ? ... : null`).
--   · Al publicar, TabMiOferta copiaba esa dirección de calle a
--     `relevo_publicaciones.zona`.
--   · El filtro compara la `zona` de la publicación contra las zonas del perfil
--     de quien mira, que SÍ salen del catálogo cerrado de src/lib/municipios.js
--     ("Bogotá D.C.", "Envigado"…). Una dirección de calle nunca hace match.
--
-- Esta migración le da a la clínica una ubicación ESTRUCTURADA y multi-sede:
--
--   clinica_sedes = etiqueta ("Sede Norte") + ciudad del catálogo (lo que
--   alimenta el filtro) + dirección exacta + link de mapas opcional.
--
-- La oferta elige UNA sede (`relevo_publicaciones.sede_id`) y copia su ciudad a
-- `zona`. La dirección exacta y el link siguen el criterio D-064: no se revelan
-- hasta que la conversación queda 'aceptada' — control de backend, dentro de
-- `relevo_ficha_contacto` (§4), no de la UI.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES: ninguno. No hay buckets ni secrets nuevos.
-- ============================================================================


-- ============================================================================
-- §1 · Tabla clinica_sedes
-- ============================================================================
-- Una clínica puede tener varias sedes físicas. `ciudad` es NULLABLE a
-- propósito: el backfill de §2 no puede adivinar la ciudad de las clínicas que
-- ya existen a partir de su dirección de texto libre. La UI la exige de aquí en
-- adelante y el formulario de oferta solo deja elegir sedes que ya tengan
-- ciudad, así que el dato incompleto no puede entrar al filtro y quedar mudo.
create table if not exists clinica_sedes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references perfiles (id) on delete cascade,
  etiqueta text not null,
  ciudad text,                -- valor del catálogo ZONAS_COBERTURA (src/lib/municipios.js)
  direccion text not null,
  link_maps text,             -- link que la propia clínica pega (D-536: deep link, sin mapa interno)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinica_sedes_clinica_idx on clinica_sedes (clinica_id);

alter table clinica_sedes enable row level security;

-- Solo la dueña ve y gestiona sus sedes por PostgREST. La contraparte de una
-- conversación NO lee esta tabla: recibe la dirección de la sede a través de
-- `relevo_ficha_contacto` (§4, security definer), que es donde vive el gate de
-- "solo tras el acuerdo". Mismo criterio que `perfiles` + `perfiles_publico`.
drop policy if exists "clinica_sedes_select_own" on clinica_sedes;
create policy "clinica_sedes_select_own" on clinica_sedes
  for select to authenticated using (clinica_id = auth.uid());

drop policy if exists "clinica_sedes_insert_own" on clinica_sedes;
create policy "clinica_sedes_insert_own" on clinica_sedes
  for insert to authenticated with check (clinica_id = auth.uid());

drop policy if exists "clinica_sedes_update_own" on clinica_sedes;
create policy "clinica_sedes_update_own" on clinica_sedes
  for update to authenticated
  using (clinica_id = auth.uid())
  with check (clinica_id = auth.uid());

drop policy if exists "clinica_sedes_delete_own" on clinica_sedes;
create policy "clinica_sedes_delete_own" on clinica_sedes
  for delete to authenticated using (clinica_id = auth.uid());


-- ============================================================================
-- §2 · Backfill de las clínicas que ya existen
-- ============================================================================
-- `direccion_sede` se conserva en `perfiles` como dato legacy (lo pinta
-- HeaderPerfilClinica y es el fallback de §4); la fuente de verdad estructurada
-- pasa a ser esta tabla. Sin ciudad: la pone la clínica desde su perfil.
insert into clinica_sedes (clinica_id, etiqueta, ciudad, direccion)
select p.id, 'Sede principal', null, p.direccion_sede
from perfiles p
where p.rol = 'clinica'
  and coalesce(btrim(p.direccion_sede), '') <> ''
  and not exists (select 1 from clinica_sedes s where s.clinica_id = p.id);


-- ============================================================================
-- §3 · La oferta apunta a una sede
-- ============================================================================
-- `on delete set null`: borrar una sede no borra las ofertas ni el historial —
-- la publicación conserva su `zona` (la ciudad ya copiada) y solo pierde el
-- vínculo con la dirección exacta.
alter table relevo_publicaciones
  add column if not exists sede_id uuid references clinica_sedes (id) on delete set null;

create index if not exists relevo_publicaciones_sede_idx on relevo_publicaciones (sede_id);


-- ============================================================================
-- §4 · relevo_ficha_contacto: la dirección sale de la sede de la oferta
-- ============================================================================
-- Reemplaza la versión de 0028 §D.6. Cambia la firma (tres columnas nuevas),
-- así que hay que dropear primero.
--
-- Sigue habiendo dos niveles y el gate es el mismo de D-064:
--
--   conversación abierta                → matrícula + estado de validación,
--                                         especialidad, zona, bio, NIT.
--   conversación aceptada o finalizada  → además la dirección de la sede, su
--                                         etiqueta y su link de mapas.
--
-- SUPUESTO: si hay varias conversaciones aceptadas con la misma contraparte
-- sobre ofertas de sedes distintas, se devuelve la de la más reciente. La firma
-- recibe un `p_perfil_id` (no una conversación), así que no hay forma de
-- desambiguar sin cambiarla y romper a todos sus llamadores. Es un caso de
-- borde; el fallback nunca miente: si esa oferta no tenía sede se cae a
-- `perfiles.direccion_sede`, que es lo que se devolvía antes de 0030.
drop function if exists relevo_ficha_contacto(uuid);

create function relevo_ficha_contacto(p_perfil_id uuid)
returns table (
  id uuid,
  rol text,
  nombre_completo text,
  bio text,
  zona_cobertura text,
  especialidad text,
  matricula_comvezcol text,
  estado_validacion text,
  razon_social text,
  nit text,
  direccion_sede text,
  sede_etiqueta text,
  sede_link_maps text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.rol, p.nombre_completo,
         p.bio, p.zona_cobertura, p.especialidad, p.matricula_comvezcol, p.estado_validacion,
         p.razon_social, p.nit,
         case when v.aceptada then coalesce(s.direccion, p.direccion_sede) end,
         case when v.aceptada then s.etiqueta end,
         case when v.aceptada then s.link_maps end
  from perfiles p
  cross join lateral (
    select count(*) as relaciones,
           coalesce(bool_or(c.estado in ('aceptada', 'finalizada')), false) as aceptada,
           (
             select pub.sede_id
             from relevo_conversaciones c2
             join relevo_publicaciones pub on pub.id = c2.publicacion_id
             where (
                     (c2.autor_id = auth.uid() and c2.interesado_id = p_perfil_id)
                  or (c2.interesado_id = auth.uid() and c2.autor_id = p_perfil_id)
                   )
               and c2.estado in ('aceptada', 'finalizada')
               and pub.sede_id is not null
             order by c2.aceptada_at desc nulls last
             limit 1
           ) as sede_id
    from relevo_conversaciones c
    where (c.autor_id = auth.uid() and c.interesado_id = p_perfil_id)
       or (c.interesado_id = auth.uid() and c.autor_id = p_perfil_id)
  ) v
  left join clinica_sedes s on s.id = v.sede_id
  where p.id = p_perfil_id
    and v.relaciones > 0;
$$;

revoke execute on function relevo_ficha_contacto(uuid) from public, anon;
grant execute on function relevo_ficha_contacto(uuid) to authenticated;
