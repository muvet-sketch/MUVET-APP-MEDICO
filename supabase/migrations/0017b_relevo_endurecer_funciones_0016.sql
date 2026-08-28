-- ============================================================================
-- MUVET · App Médico — Migración 0017b: endurecer funciones de 0016
-- ============================================================================
-- Hotfix aplicado justo después de 0017 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
-- ============================================================================

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

revoke execute on function relevo_cerrar_publicacion_por_cupos() from public, anon, authenticated;
revoke execute on function relevo_soy_postulante(uuid) from public, anon;
grant execute on function relevo_soy_postulante(uuid) to authenticated;
