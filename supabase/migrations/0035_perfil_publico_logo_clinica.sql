-- ============================================================================
-- MUVET · App Médico — Migración 0035: logo de la clínica visible, NIT oculto
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0034.
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- Pedido: en los módulos gremiales, médicos y auxiliares deben ver la imagen
-- de perfil / logo de la clínica junto a su nombre. Y a la inversa: el NIT del
-- establecimiento deja de mostrarse a los usuarios.
--
-- Dos cambios de backend:
--
--   §1 · `perfiles_publico` (0014) expone `foto_url`, pero SOLO para perfiles
--        de rol 'clinica'. La vista la lee cualquier autenticado, así que las
--        fotos de médicos y auxiliares siguen sin exponerse — el `case` las
--        devuelve NULL y el avatar cae a iniciales. Alcance confirmado con el
--        fundador ("solo clínicas").
--
--   §2 · `relevo_ficha_contacto` (última versión en 0030 §4) DEJA DE DEVOLVER
--        `nit`. La "Ficha de la clínica" del hilo de MUVET Turnos ya no lo
--        muestra. Se agrega `foto_url` (también solo si el perfil es clínica)
--        para que esa ficha pueda pintar el logo sin un segundo viaje a la BD.
--        El resto de la función es idéntico a 0030: mismo gate D-064, misma
--        lógica de sede.
--
-- `foto_url` es un path del bucket `documents` (0003, lectura pública) — no es
-- un dato sensible como matrícula, carné, NIT, dirección o teléfono, que
-- siguen fuera de `perfiles_publico` por diseño (ver 0014).
-- ============================================================================


-- ============================================================================
-- §1 · perfiles_publico + foto_url (solo clínicas)
-- ============================================================================
create or replace view perfiles_publico
with (security_invoker = false)
as
select
  id,
  rol,
  nombre_completo,
  razon_social,
  case when rol = 'clinica' then foto_url end as foto_url
from perfiles;

grant select on perfiles_publico to authenticated;


-- ============================================================================
-- §2 · relevo_ficha_contacto: sin NIT, con logo
-- ============================================================================
-- Cambia la firma (quita `nit`, agrega `foto_url`), así que hay que dropear
-- primero. Reemplaza la versión de 0030 §4.
drop function if exists relevo_ficha_contacto(uuid);

create function relevo_ficha_contacto(p_perfil_id uuid)
returns table (
  id uuid,
  rol text,
  nombre_completo text,
  foto_url text,
  bio text,
  zona_cobertura text,
  especialidad text,
  matricula_comvezcol text,
  estado_validacion text,
  razon_social text,
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
         case when p.rol = 'clinica' then p.foto_url end,
         p.bio, p.zona_cobertura, p.especialidad, p.matricula_comvezcol, p.estado_validacion,
         p.razon_social,
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
