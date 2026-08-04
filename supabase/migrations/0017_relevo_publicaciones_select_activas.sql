-- ============================================================================
-- MUVET · App Médico — Migración 0017: RLS de lectura de relevo_publicaciones
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0016.
--
-- Bug: `relevo_publicaciones_select_authenticated` (0001) dejaba a cualquier
-- autenticado leer TODAS las filas, activas o no. El `activa = true` vivía
-- solo en el cliente (fetchPublicacionesActivas), así que una oferta
-- despublicada —o cerrada automáticamente al llenarse los cupos (0016)— se
-- seguía pudiendo leer consultando la tabla directamente. Con el cierre
-- automático de 0016 esto importa más: "ya no es pública" tiene que ser una
-- garantía de backend, no una convención del frontend.
--
-- Quién debe seguir leyendo una publicación NO activa:
--   1. su autor — la gestiona en "Mi Oferta" (fetchMisPublicaciones);
--   2. quien se postuló a ella — "Mis postulaciones" (fetchMisPostulaciones)
--      tiene que seguir mostrando el relevo justo después de que la
--      publicación se cierre por cupos llenos, que es cuando más importa.
--
-- El caso 2 no se puede escribir como `exists (select 1 from relevo_mensajes
-- ...)` dentro de la policy: `relevo_mensajes_select_participantes` (0001) ya
-- consulta relevo_publicaciones, y las dos policies se llamarían entre sí
-- ("infinite recursion detected in policy for relation"). Por eso la
-- comprobación va en una función SECURITY DEFINER, que salta la RLS de
-- relevo_mensajes y corta la recursión.
-- ============================================================================

create or replace function relevo_soy_postulante(p_publicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from relevo_mensajes m
    where m.publicacion_id = p_publicacion_id
      and m.remitente_id = auth.uid()
  );
$$;

revoke execute on function relevo_soy_postulante(uuid) from public;
grant execute on function relevo_soy_postulante(uuid) to authenticated;

drop policy if exists "relevo_publicaciones_select_authenticated" on relevo_publicaciones;
drop policy if exists "relevo_publicaciones_select_activas_o_participante" on relevo_publicaciones;
create policy "relevo_publicaciones_select_activas_o_participante" on relevo_publicaciones
  for select using (
    auth.role() = 'authenticated'
    and (
      activa
      or autor_id = auth.uid()
      or relevo_soy_postulante(id)
    )
  );

-- ---------------------------------------------------------------------------
-- Cabos sueltos que reportó el database linter sobre las funciones de 0016.
-- ---------------------------------------------------------------------------

-- `search_path` mutable: sin fijarlo, quien invoque el trigger podría anteponer
-- un esquema propio y hacer que los nombres sin calificar resuelvan a otra
-- cosa. Es la misma precaución que ya llevan las funciones SECURITY DEFINER.
create or replace function relevo_mensajes_sync_estado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado is distinct from 'rechazada' then
    if new.confirmado_autor and new.confirmado_remitente then
      new.estado := 'confirmada';
    elsif new.confirmado_autor or new.confirmado_remitente then
      new.estado := 'aceptada';
    else
      new.estado := 'pendiente';
    end if;
  end if;
  return new;
end;
$$;

-- Ninguna de las dos funciones de Relevo es un endpoint: la de cupos solo
-- corre como trigger y `relevo_soy_postulante` solo se evalúa dentro de la
-- policy de arriba. PostgREST las expone igual bajo /rest/v1/rpc/, así que se
-- les quita el EXECUTE que Postgres concede a PUBLIC por defecto.
-- `authenticated` sí conserva el de relevo_soy_postulante: las expresiones de
-- una policy se evalúan con el rol que consulta, y sin ese grant la lectura
-- de relevo_publicaciones fallaría.
revoke execute on function relevo_cerrar_publicacion_por_cupos() from public, anon, authenticated;
revoke execute on function relevo_soy_postulante(uuid) from public, anon;
grant execute on function relevo_soy_postulante(uuid) to authenticated;
