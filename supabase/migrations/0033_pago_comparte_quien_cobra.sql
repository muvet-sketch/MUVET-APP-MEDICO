-- ============================================================================
-- MUVET · App Médico — Migración 0033: los datos de pago los comparte quien cobra
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0032.
--
-- ----------------------------------------------------------------------------
-- ⚠️ NOMBRES (ver src/lib/nombresModulos.js — los ids NO coinciden con la UI)
-- ----------------------------------------------------------------------------
--   UI "MUVET Turnos"    → relevo_conversaciones
--   UI "MUVET Relevo"    → cobertura_solicitudes
--   UI "MUVET Auxiliar"  → apoyo_conversaciones
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- 0029 dejó el opt-in de "compartir mis datos de pago" SIMÉTRICO: las dos
-- partes de un servicio podían publicar su cuenta bancaria. En un matching
-- gremial eso no tiene sentido y es un riesgo gratuito — el pago va en una sola
-- dirección, así que solo quien COBRA tiene motivo para entregar sus datos.
-- Quien paga no comparte nada: marca el pago y copia los datos del otro.
--
-- Regla por módulo, decidida con el fundador. NO es "quien no creó la oferta":
-- en MUVET Turnos un médico puede publicar "Ofrezco disponibilidad a
-- establecimientos" y ser a la vez el autor de la oferta Y el que cobra. La
-- regla correcta es por ROL, no por lado de la conversación:
--
--   Turnos    → cobra el profesional (médico o auxiliar). La clínica nunca
--               comparte — de hecho ni siquiera tiene la sección de datos de
--               pago en su perfil (0029 §A).
--   Auxiliar  → cobra el auxiliar. El médico es quien contrata el apoyo.
--   Relevo    → cobra quien se OFRECIÓ a cubrir (`medico_cobertura_id`), no
--               quien pasó el servicio. Acá los dos lados son médicos, así que
--               el rol no alcanza para desempatar y se mira el lado.
--
-- Esto es defensa en profundidad: la UI ya oculta el botón
-- (puedeCompartirDatosPago en src/lib/pagos.js), pero el RPC es la frontera
-- real y tiene que rechazarlo igual.
--
-- Se reemplazan SOLO las tres `*_pago_compartir`. `*_pago_marcar` y
-- `*_datos_pago` quedan como están: marcar el pago y leer los datos de la
-- contraparte siguen siendo cosa de las dos partes.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES: ninguno.
-- ============================================================================


-- ============================================================================
-- §1 · Normalización de opt-ins ya dados por el lado que no cobra
-- ============================================================================
-- Si alguien alcanzó a compartir sus datos desde el lado equivocado bajo las
-- reglas de 0029, se retira el opt-in. No se borra ningún dato del perfil: solo
-- deja de exponerse en ese servicio.
update relevo_conversaciones c
   set pago_datos_autor = false
  from perfiles p
 where p.id = c.autor_id and p.rol = 'clinica' and c.pago_datos_autor;

update relevo_conversaciones c
   set pago_datos_interesado = false
  from perfiles p
 where p.id = c.interesado_id and p.rol = 'clinica' and c.pago_datos_interesado;

update apoyo_conversaciones c
   set pago_datos_autor = false
  from perfiles p
 where p.id = c.autor_id and p.rol <> 'auxiliar' and c.pago_datos_autor;

update apoyo_conversaciones c
   set pago_datos_interesado = false
  from perfiles p
 where p.id = c.interesado_id and p.rol <> 'auxiliar' and c.pago_datos_interesado;

update cobertura_solicitudes
   set pago_datos_autor = false
 where pago_datos_autor;


-- ============================================================================
-- §2 · MUVET Turnos — solo el profesional (no la clínica)
-- ============================================================================
create or replace function relevo_pago_compartir(p_id uuid, p_compartir boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid;
  v_interesado uuid;
  v_antes boolean;
  v_destinatario uuid;
  v_mi_rol text;
begin
  select autor_id, interesado_id,
         case when auth.uid() = autor_id then pago_datos_autor else pago_datos_interesado end
    into v_autor, v_interesado, v_antes
  from relevo_conversaciones
  where id = p_id;

  if v_autor is null then
    raise exception 'La conversación no existe.';
  end if;
  if auth.uid() not in (v_autor, v_interesado) then
    raise exception 'No participas en este servicio.';
  end if;

  -- 0033: quien cobra es el profesional. La clínica contrata y paga.
  select rol into v_mi_rol from perfiles where id = auth.uid();
  if v_mi_rol = 'clinica' then
    raise exception 'Los datos de pago los comparte quien presta el servicio.';
  end if;

  if auth.uid() = v_autor then
    update relevo_conversaciones set pago_datos_autor = p_compartir where id = p_id;
  else
    update relevo_conversaciones set pago_datos_interesado = p_compartir where id = p_id;
  end if;

  if p_compartir and not coalesce(v_antes, false) then
    v_destinatario := case when auth.uid() = v_autor then v_interesado else v_autor end;
    if v_destinatario is not null and v_destinatario <> auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_destinatario, 'relevo_pago',
        notificaciones_nombre_actor(auth.uid()) || ' compartió sus datos de pago',
        null,
        '/relevo/conversacion/' || p_id,
        'relevo_conversaciones', p_id, auth.uid(),
        jsonb_build_object('evento', 'datos_pago_compartidos')
      );
    end if;
  end if;
end;
$$;


-- ============================================================================
-- §3 · MUVET Auxiliar — solo el auxiliar
-- ============================================================================
create or replace function apoyo_pago_compartir(p_id uuid, p_compartir boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid;
  v_interesado uuid;
  v_antes boolean;
  v_destinatario uuid;
  v_mi_rol text;
begin
  select autor_id, interesado_id,
         case when auth.uid() = autor_id then pago_datos_autor else pago_datos_interesado end
    into v_autor, v_interesado, v_antes
  from apoyo_conversaciones
  where id = p_id;

  if v_autor is null then
    raise exception 'La conversación no existe.';
  end if;
  if auth.uid() not in (v_autor, v_interesado) then
    raise exception 'No participas en este servicio.';
  end if;

  -- 0033: en este módulo el que cobra es siempre el auxiliar — el médico es
  -- quien contrata el apoyo. Da igual quién de los dos publicó.
  select rol into v_mi_rol from perfiles where id = auth.uid();
  if v_mi_rol <> 'auxiliar' then
    raise exception 'Los datos de pago los comparte quien presta el servicio.';
  end if;

  if auth.uid() = v_autor then
    update apoyo_conversaciones set pago_datos_autor = p_compartir where id = p_id;
  else
    update apoyo_conversaciones set pago_datos_interesado = p_compartir where id = p_id;
  end if;

  if p_compartir and not coalesce(v_antes, false) then
    v_destinatario := case when auth.uid() = v_autor then v_interesado else v_autor end;
    if v_destinatario is not null and v_destinatario <> auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_destinatario, 'apoyo_pago',
        notificaciones_nombre_actor(auth.uid()) || ' compartió sus datos de pago',
        null,
        '/apoyo/conversacion/' || p_id,
        'apoyo_conversaciones', p_id, auth.uid(),
        jsonb_build_object('evento', 'datos_pago_compartidos')
      );
    end if;
  end if;
end;
$$;


-- ============================================================================
-- §4 · MUVET Relevo — solo quien se ofreció a cubrir
-- ============================================================================
-- Único módulo donde el rol no desempata (los dos lados son médicos): cobra
-- quien TOMA el servicio, no quien lo pasa. Como el autor ya no puede
-- compartir, `pago_datos_autor` queda sin uso acá y `cobertura_datos_pago`
-- (0029) sigue funcionando: al autor le devuelve los datos del que cubre.
create or replace function cobertura_pago_compartir(p_id uuid, p_compartir boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid;
  v_cobertura uuid;
  v_antes boolean;
begin
  select autor_id, medico_cobertura_id, pago_datos_cobertura
    into v_autor, v_cobertura, v_antes
  from cobertura_solicitudes
  where id = p_id;

  if v_autor is null then
    raise exception 'La solicitud no existe.';
  end if;
  if auth.uid() not in (v_autor, v_cobertura) then
    raise exception 'No participas en este servicio.';
  end if;

  -- 0033: cobra quien se ofreció a cubrir el servicio.
  if auth.uid() is distinct from v_cobertura then
    raise exception 'Los datos de pago los comparte quien cubre el servicio.';
  end if;

  update cobertura_solicitudes set pago_datos_cobertura = p_compartir where id = p_id;

  if p_compartir and not coalesce(v_antes, false) and v_autor <> auth.uid() then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_autor, 'cobertura_pago',
      notificaciones_nombre_actor(auth.uid()) || ' compartió sus datos de pago',
      null,
      '/cobertura-servicio/chat/' || p_id,
      'cobertura_solicitudes', p_id, auth.uid(),
      jsonb_build_object('evento', 'datos_pago_compartidos')
    );
  end if;
end;
$$;
