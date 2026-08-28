-- ============================================================================
-- MUVET · App Médico — Migración 0023c: cobertura_finalizar_servicio + policy delete
-- ============================================================================
-- Hotfix aplicado justo después de 0023b vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `c`, mismo criterio que 0028a–0028f).
--
-- NOTA: esta versión de cobertura_finalizar_servicio (borra el chat en el acto)
-- y la policy "cobertura_chat_delete_participantes" quedaron SUPERADAS por
-- 0034_relevo_acuerdo_mutuo_y_chat_24h (chat +24h). Se conserva el archivo por
-- fidelidad histórica con el ledger.
-- ============================================================================

create or replace function cobertura_finalizar_servicio(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_participante boolean;
begin
  select exists (
    select 1 from cobertura_solicitudes
    where id = p_solicitud_id
      and (autor_id = auth.uid() or medico_cobertura_id = auth.uid())
      and estado = 'cubierta'
  ) into v_es_participante;

  if not v_es_participante then
    raise exception 'No autorizado o el servicio no está en curso.';
  end if;

  delete from cobertura_mensajes where solicitud_id = p_solicitud_id;

  update cobertura_solicitudes
  set estado = 'finalizada', finalizada_at = now()
  where id = p_solicitud_id;
end;
$$;

create policy "cobertura_chat_delete_participantes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cobertura-chat'
    and exists (
      select 1 from cobertura_solicitudes s
      where s.id::text = (storage.foldername(name))[1]
        and s.estado = 'cubierta'
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );
