-- ============================================================================
-- MUVET · App Médico — Migración 0025b: proteger_estado_validacion incluye carné
-- ============================================================================
-- Hotfix aplicado justo después de 0025 vía MCP; reconciliado en el ledger el
-- 2026-08-28 (sufijo `b`, mismo criterio que 0028a–0028f).
--
-- Ajuste al trigger de 0025: el cambio de carné también reinicia el estado
-- (D-541 dice "cualquier cambio de matrícula/carné"). Antes lo forzaba el
-- cliente; ahora lo garantiza la base de datos.
-- ============================================================================

create or replace function fn_proteger_estado_validacion()
returns trigger as $$
declare
  v_privilegiado boolean;
begin
  v_privilegiado := coalesce(auth.role(), '') = 'service_role'
                    or current_user in ('postgres', 'supabase_admin');

  if v_privilegiado then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.rol = 'medico' then
      new.estado_validacion := 'pendiente';
    end if;
    new.fecha_validacion := null;
    if new.disponible then
      new.disponible := false;
    end if;
    return new;
  end if;

  if new.estado_validacion is distinct from old.estado_validacion then
    raise exception 'estado_validacion solo lo escribe la verificación COMVEZCOL (D-541)';
  end if;
  if new.fecha_validacion is distinct from old.fecha_validacion then
    raise exception 'fecha_validacion solo lo escribe la verificación COMVEZCOL (D-541)';
  end if;

  if new.matricula_comvezcol is distinct from old.matricula_comvezcol
     or new.carne_url is distinct from old.carne_url then
    if old.estado_validacion = 'en_disputa' then
      new.estado_validacion := 'en_disputa';
    else
      new.estado_validacion := 'pendiente';
      new.fecha_validacion := null;
    end if;
  end if;

  if new.disponible and not old.disponible and new.estado_validacion is distinct from 'validado' then
    raise exception 'No puedes activar disponibilidad sin matrícula validada (D-541)';
  end if;

  return new;
end;
$$ language plpgsql;
