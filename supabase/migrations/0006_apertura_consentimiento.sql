-- ============================================================================
-- MUVET · App Médico — Migración 0006: Apertura del servicio — check-in +
-- doble consentimiento (Fase 4, Acción 1)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
-- No modifica 0001/0002/0003/0004/0005.
--
-- Reglas de negocio referenciadas (ver CLAUDE.md):
--   D-537  checkin_llegada_at es inmutable una vez escrito (ya lo garantiza
--          el trigger fn_bloquear_update_checkin_llegada de 0001 — no se toca).
--   D-116  Doble consentimiento obligatorio (tutor + médico). Sin ambos, la
--          Constelación no abre.
--   El timer de 60s se valida en backend, nunca solo en frontend.
--
-- -- SUPUESTO (se reporta al fundador): el despacho de Fase 4 redacta el
-- consentimiento del tutor como si aplicara solo a la activación de IRIS
-- ("si el tutor rechaza, IRIS no se activa, no bloquea el resto del
-- flujo"), pero también pide cubrir un estado "tutor rechazó" con modal
-- [Reintentar]/[Cancelar servicio] — contradictorio. Como D-116 está
-- marcada INAMOVIBLE, se resuelve a favor de la regla dura: la ventana de
-- 60s y el aviso al tutor se generan siempre al confirmar el médico (no
-- solo cuando pide IRIS); un rechazo explícito del tutor bloquea la
-- apertura; aceptación o falta de respuesta en 60s la habilita. Lo único
-- condicionado a la respuesta del tutor es si iris_activo queda en true.
-- ============================================================================

-- ============================================================================
-- servicios: columnas nuevas para el resultado de IRIS y la respuesta del tutor
-- ============================================================================
alter table servicios
  add column if not exists iris_solicitado boolean not null default false,
  add column if not exists iris_activo boolean not null default false,
  add column if not exists consentimiento_tutor_rechazado_at timestamptz,
  add column if not exists consentimiento_tutor_expira_en timestamptz;

-- ============================================================================
-- Funciones (SECURITY DEFINER — mismo patrón que aceptar_solicitud /
-- cancelar_servicio en 0004_solicitudes_servicios.sql)
-- ============================================================================

-- registrar_checkin_llegada: Paso 1 de Apertura. El trigger de 0001 ya
-- impide reescribir checkin_llegada_at una vez fijado (D-537); aquí solo se
-- valida que sea el médico dueño del servicio y que aún no haya check-in.
create or replace function registrar_checkin_llegada(p_servicio_id uuid)
returns servicios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio servicios%rowtype;
begin
  update servicios
    set checkin_llegada_at = now(),
        estado = 'en_apertura'
    where id = p_servicio_id
      and medico_id = auth.uid()
      and estado = 'en_camino'
  returning * into v_servicio;

  if not found then
    raise exception 'Servicio no encontrado, no pertenece al médico actual, o ya tiene check-in registrado';
  end if;

  return v_servicio;
end;
$$;

-- registrar_consentimiento_medico: Paso 2 de Apertura. Registra la decisión
-- del médico sobre IRIS y abre la ventana de 60s para el tutor (D-116).
create or replace function registrar_consentimiento_medico(p_servicio_id uuid, p_iris_solicitado boolean)
returns servicios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio servicios%rowtype;
begin
  update servicios
    set consentimiento_medico_at = now(),
        iris_solicitado = p_iris_solicitado,
        consentimiento_tutor_expira_en = now() + interval '60 seconds'
    where id = p_servicio_id
      and medico_id = auth.uid()
      and estado = 'en_apertura'
      and consentimiento_medico_at is null
  returning * into v_servicio;

  if not found then
    raise exception 'Servicio no encontrado, no pertenece al médico actual, o ya tiene consentimiento del médico registrado';
  end if;

  return v_servicio;
end;
$$;

-- registrar_respuesta_tutor -- MOCK: la App Tutor no existe todavía. En
-- producción este RPC lo invocaría el backend de esa app (o un endpoint
-- equivalente autenticado como el tutor), nunca un botón en la app del
-- médico. Aquí lo dispara un control dev-only en la propia pantalla de
-- Apertura (ver src/screens/apertura-servicio/index.jsx).
-- SECURITY: el advisor de Supabase marcó (correctamente) que esta función,
-- al no validar quién la llama, quedaba ejecutable por el rol `anon` sin
-- ninguna autenticación — cualquiera con la anon key pública podría forjar
-- o bloquear el consentimiento del tutor de cualquier servicio (violación
-- directa de D-116). Como en el MVP no existe autenticación real de la App
-- Tutor, se acota temporalmente a que solo el médico dueño del servicio
-- pueda dispararla (coherente con que hoy el mock vive en su propia
-- pantalla autenticada). Cuando exista la App Tutor real, este chequeo debe
-- cambiar a validar la identidad del tutor, no la del médico.
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

-- reintentar_consentimiento_tutor: limpia un rechazo previo y reabre una
-- ventana de 60s, para el botón [Reintentar] del modal de rechazo.
create or replace function reintentar_consentimiento_tutor(p_servicio_id uuid)
returns servicios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio servicios%rowtype;
begin
  update servicios
    set consentimiento_tutor_rechazado_at = null,
        consentimiento_tutor_expira_en = now() + interval '60 seconds'
    where id = p_servicio_id
      and medico_id = auth.uid()
      and estado = 'en_apertura'
  returning * into v_servicio;

  if not found then
    raise exception 'Servicio no encontrado, no pertenece al médico actual, o no está en apertura';
  end if;

  return v_servicio;
end;
$$;

-- abrir_constelacion: valida D-116 en el servidor (con el now() del
-- servidor, no del cliente) y, si corresponde, transiciona a 'activa'.
-- iris_activo solo queda en true si el médico lo pidió Y el tutor no
-- rechazó explícitamente.
create or replace function abrir_constelacion(p_servicio_id uuid)
returns servicios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio servicios%rowtype;
begin
  select * into v_servicio from servicios
    where id = p_servicio_id and medico_id = auth.uid()
    for update;

  if not found then
    raise exception 'Servicio no encontrado o no pertenece al médico actual';
  end if;

  if v_servicio.estado <> 'en_apertura' then
    raise exception 'El servicio no está en apertura (estado actual: %)', v_servicio.estado;
  end if;

  if v_servicio.consentimiento_medico_at is null then
    raise exception 'Falta el consentimiento del médico (D-116)';
  end if;

  if v_servicio.consentimiento_tutor_rechazado_at is not null then
    raise exception 'El tutor rechazó el consentimiento (D-116)';
  end if;

  if v_servicio.consentimiento_tutor_at is null
     and (v_servicio.consentimiento_tutor_expira_en is null or now() < v_servicio.consentimiento_tutor_expira_en) then
    raise exception 'Aún se espera respuesta del tutor (D-116)';
  end if;

  update servicios
    set estado = 'activa',
        iris_activo = (iris_solicitado and consentimiento_tutor_rechazado_at is null)
    where id = p_servicio_id
  returning * into v_servicio;

  return v_servicio;
end;
$$;

-- No se agrega RLS ni Realtime nuevos: todo el flujo pasa por estos RPC
-- SECURITY DEFINER (igual que cancelar_servicio en 0004), y la respuesta
-- del tutor se mockea en el mismo cliente/pestaña del médico — no depende
-- de recibir el cambio por Realtime, se usa directamente el valor que
-- devuelve cada RPC.
