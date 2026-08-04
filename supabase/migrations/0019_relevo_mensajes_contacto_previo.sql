-- ============================================================================
-- MUVET · App Médico — Migración 0019: Relevo — mensaje de contacto previo
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0018.
--
-- Contexto: en la pestaña "Ofertas", "Aceptar oferta" ya dejaba escribir un
-- mensaje opcional, pero ENVIARLO ya era aceptar (creaba la postulación).
-- Pedido: cuando un médico o auxiliar le ofrece disponibilidad a una clínica
-- (tipo='ofrezco', rol_objetivo='clinica' — ver PUBLICACIONES_PERMITIDAS_POR_ROL
-- en lib/relevo.js), la clínica necesita poder preguntar algo ANTES de
-- decidir si acepta, sin que esa pregunta cuente como postulación ni consuma
-- un cupo. Se generalizó a cualquier rol que reciba una oferta en esa
-- pestaña, no solo a la clínica, para no bifurcar el componente por rol.
--
-- `es_postulacion` distingue las dos intenciones sobre la misma fila de
-- relevo_mensajes: true = "acepto la oferta" (como hasta ahora), false =
-- "solo quiero preguntar algo antes de decidir". D-540 sigue intacto: sigue
-- siendo un mensaje único de contacto por envío, no un hilo — la pregunta
-- previa es una fila más, no abre una conversación en tiempo real.
--
-- El guard en el trigger evita que una fila de solo-contacto llegue a
-- 'confirmada' y cuente para los cupos (0016): si el cliente tiene un bug o
-- alguien llama al endpoint directo, la base de datos igual lo rechaza.
-- ============================================================================

alter table relevo_mensajes
  add column if not exists es_postulacion boolean not null default true;

create or replace function relevo_mensajes_sync_estado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.es_postulacion and (new.confirmado_autor or new.confirmado_remitente) then
    raise exception 'Un mensaje de solo contacto no puede confirmarse como relevo.';
  end if;

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
