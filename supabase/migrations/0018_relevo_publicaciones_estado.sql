-- ============================================================================
-- MUVET · App Médico — Migración 0018: Relevo — cancelación y finalización
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0017.
--
-- Contexto: hasta ahora una publicación solo tenía `activa` (boolean) —
-- "visible en el tablón sí/no" — sin distinguir POR QUÉ dejó de estarlo: la
-- desactivó su autor (puede reactivarla), se llenaron los cupos (0016, cierre
-- automático), la canceló su autor (ya no la necesita) o el relevo se cumplió
-- (labor terminada). Esta migración agrega `estado` para separar esos casos:
--
--   - 'abierta'    → el default. Puede estar activa o no (`activa` sigue
--                    siendo el toggle de publicación de "Mi Oferta").
--   - 'cancelada'  → el autor la dio de baja antes de completarse. Terminal.
--   - 'finalizada' → el autor confirmó que la labor ya se cumplió. Terminal.
--
-- Terminal = no se puede volver a 'abierta' (mismo espíritu de inmutabilidad
-- que D-537, acotado aquí a Relevo). El trigger de abajo lo hace cumplir en
-- backend, no solo en el cliente.
-- ============================================================================

alter table relevo_publicaciones
  add column if not exists estado text not null default 'abierta';

alter table relevo_publicaciones drop constraint if exists relevo_publicaciones_estado_check;
alter table relevo_publicaciones add constraint relevo_publicaciones_estado_check
  check (estado in ('abierta', 'cancelada', 'finalizada'));

-- Terminal no se revierte, y cancelada/finalizada siempre apaga `activa` sin
-- depender de que el cliente también lo mande en el mismo payload.
create or replace function relevo_publicaciones_guardar_estado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado in ('cancelada', 'finalizada') and new.estado is distinct from old.estado then
    raise exception 'No se puede cambiar el estado de una publicación %.', old.estado;
  end if;

  if new.estado <> 'abierta' then
    new.activa := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_relevo_publicaciones_guardar_estado on relevo_publicaciones;
create trigger trg_relevo_publicaciones_guardar_estado
  before update on relevo_publicaciones
  for each row execute function relevo_publicaciones_guardar_estado();

-- Al cancelar, las postulaciones que todavía no llegaron a 'confirmada'
-- (pendiente/aceptada) se marcan 'rechazada' — ya no hay oferta sobre la que
-- confirmar. Los relevos que ya estaban confirmados por ambas partes quedan
-- intactos: la cancelación es sobre reclutamiento futuro, no deshace un
-- compromiso ya cerrado.
create or replace function relevo_cancelar_rechaza_pendientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    update relevo_mensajes
      set estado = 'rechazada'
      where publicacion_id = new.id
        and estado in ('pendiente', 'aceptada');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_relevo_cancelar_rechaza_pendientes on relevo_publicaciones;
create trigger trg_relevo_cancelar_rechaza_pendientes
  after update on relevo_publicaciones
  for each row execute function relevo_cancelar_rechaza_pendientes();

-- No es un endpoint: solo corre como trigger (mismo criterio que 0017 con
-- relevo_cerrar_publicacion_por_cupos).
revoke execute on function relevo_cancelar_rechaza_pendientes() from public, anon, authenticated;
