-- ============================================================================
-- MUVET · App Médico — Migración 0016: Relevo — confirmación doble y cupos
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0015.
--
-- Contexto: "Aceptar oferta" pasa a ser solo la postulación. Para que el
-- relevo quede cerrado hacen falta DOS confirmaciones explícitas —
-- "Confirmar Relevo" del autor de la publicación y del postulante— en el
-- mismo espíritu del doble consentimiento de D-116, pero acotado a Relevo.
-- D-540 sigue intacto: son banderas sobre el mismo mensaje único, no un hilo.
--
-- Cuando se completan tantos relevos confirmados como `cupos` tenga la
-- publicación, la publicación deja de ser pública (activa = false) para que
-- nadie más acepte una oferta que ya no es válida. `cupos` existe sobre todo
-- para las clínicas, que pueden pedir varios médicos o auxiliares con una
-- sola publicación; el resto de actores usa el default de 1.
--
-- El cierre se hace en un trigger SECURITY DEFINER y no en el cliente porque
-- la última confirmación puede venir del postulante, que por RLS
-- (relevo_publicaciones_update_autor) no puede escribir en la publicación.
-- ============================================================================

alter table relevo_publicaciones
  add column if not exists cupos integer not null default 1;

alter table relevo_publicaciones drop constraint if exists relevo_publicaciones_cupos_check;
alter table relevo_publicaciones add constraint relevo_publicaciones_cupos_check check (cupos >= 1);

alter table relevo_mensajes
  add column if not exists confirmado_autor boolean not null default false,
  add column if not exists confirmado_remitente boolean not null default false;

-- 0011 dejó estado in ('pendiente','aceptada','rechazada'); se suma
-- 'confirmada' = ambas partes dijeron que sí.
alter table relevo_mensajes drop constraint if exists relevo_mensajes_estado_check;
alter table relevo_mensajes add constraint relevo_mensajes_estado_check
  check (estado in ('pendiente', 'aceptada', 'confirmada', 'rechazada'));

-- `estado` pasa a ser derivado de las dos banderas: lo fija el trigger de
-- abajo, no el cliente. Así no puede quedar inconsistente sin importar quién
-- escriba. 'rechazada' se respeta tal cual (no depende de las banderas).
create or replace function relevo_mensajes_sync_estado()
returns trigger
language plpgsql
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

drop trigger if exists trg_relevo_mensajes_sync_estado on relevo_mensajes;
create trigger trg_relevo_mensajes_sync_estado
  before insert or update on relevo_mensajes
  for each row execute function relevo_mensajes_sync_estado();

-- Cierra la publicación cuando los relevos confirmados llenan los cupos.
-- `count(distinct remitente_id)` para que dos mensajes del mismo postulante
-- no consuman dos cupos.
create or replace function relevo_cerrar_publicacion_por_cupos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupos integer;
  v_confirmados integer;
begin
  select cupos into v_cupos from relevo_publicaciones where id = new.publicacion_id;
  if v_cupos is null then
    return null;
  end if;

  select count(distinct remitente_id) into v_confirmados
  from relevo_mensajes
  where publicacion_id = new.publicacion_id and confirmado_autor and confirmado_remitente;

  if v_confirmados >= v_cupos then
    update relevo_publicaciones set activa = false where id = new.publicacion_id and activa;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_relevo_cerrar_publicacion_por_cupos on relevo_mensajes;
create trigger trg_relevo_cerrar_publicacion_por_cupos
  after insert or update on relevo_mensajes
  for each row execute function relevo_cerrar_publicacion_por_cupos();

-- 0011 solo dejaba actualizar al autor de la publicación; ahora el postulante
-- necesita poder marcar su propia confirmación.
drop policy if exists "relevo_mensajes_update_remitente" on relevo_mensajes;
create policy "relevo_mensajes_update_remitente" on relevo_mensajes
  for update using (auth.uid() = remitente_id)
  with check (auth.uid() = remitente_id);

-- Las solicitudes que el autor ya había aceptado con el flujo de 0011 cuentan
-- como su confirmación; falta la del postulante.
update relevo_mensajes set confirmado_autor = true where estado = 'aceptada' and not confirmado_autor;
