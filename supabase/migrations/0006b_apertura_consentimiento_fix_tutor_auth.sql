-- ============================================================================
-- MUVET · App Médico — Migración 0006b: fix auth de registrar_respuesta_tutor
-- ============================================================================
-- Hotfix aplicado entre 0006 y 0007 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
--
-- Cierra un hallazgo del security advisor: registrar_respuesta_tutor no
-- validaba quién la llamaba y quedaba ejecutable por el rol anon sin
-- autenticación (cualquiera con la anon key pública podía forjar/bloquear
-- el consentimiento del tutor de cualquier servicio — D-116). Se acota al
-- médico dueño del servicio mientras no exista autenticación real de la
-- App Tutor.
-- ============================================================================

create or replace function registrar_respuesta_tutor(p_servicio_id uuid, p_aceptado boolean)
returns servicios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio servicios%rowtype;
begin
  update servicios
    set consentimiento_tutor_at = case when p_aceptado then now() else consentimiento_tutor_at end,
        consentimiento_tutor_rechazado_at = case when p_aceptado then null else now() end
    where id = p_servicio_id
      and medico_id = auth.uid()
      and estado = 'en_apertura'
  returning * into v_servicio;

  if not found then
    raise exception 'Servicio no encontrado o no está esperando consentimiento del tutor';
  end if;

  return v_servicio;
end;
$$;
