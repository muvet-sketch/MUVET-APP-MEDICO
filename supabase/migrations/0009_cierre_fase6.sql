-- ============================================================================
-- MUVET · App Médico — Migración 0009: N-17 Órdenes externas, N-18
-- Recomendaciones, N-19 Cierre de servicio, N-9 Historial (calificaciones +
-- correcciones post-cierre) — Fase 6 (DESP-CLAUDECODE-P-EI-AppMedico-006)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr).
-- No modifica 0001-0008.
--
-- Reglas de negocio referenciadas (ver CLAUDE.md):
--   D-043  SOAP inaccesible para el tutor — ninguna tabla de esta migración
--          expone contenido de soap_notas salvo correcciones_soap_post_cierre,
--          que hereda la misma restricción RLS (médico dueño only).
--   D-507  El SOAP queda inmutable tras el cierre — trigger de abajo, no
--          solo RLS (guardar_soap_nota es SECURITY DEFINER y evadiría una
--          policy; un trigger se ejecuta sin importar el rol).
--   D-506  Checklist de pre-cierre: BLOQUEANTES (SOAP·A vacío, fórmula en
--          borrador) vs ADVISORY (se resuelven en frontend con los datos que
--          N-15/N-12/N-17/N-18 ya exponen — no hay RPC de checklist aparte).
--   D-505  Único punto de entrada a N-19 es el botón [✕] de la Barra Trueta
--          (se resuelve en frontend, no aquí).
--   D-228/229  Orden externa con sustancia controlada bloquea emisión y
--          queda marcada para Comité Médico (solo el flag/estado en el MVP;
--          el despacho usa tanto "bloqueada_comite" como "escalado_comite" —
--          se unifica en un solo valor de estado, ver -- SUPUESTO abajo).
-- ============================================================================

-- ============================================================================
-- ordenes_externas: columnas nuevas (N-17)
-- ============================================================================
alter table ordenes_externas
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists indicaciones text,
  add column if not exists estado text not null default 'borrador'
    check (estado in ('borrador', 'bloqueada_comite', 'emitida', 'resultado_cargado')),
  add column if not exists emitida_at timestamptz,
  add column if not exists resultado_cargado_at timestamptz;

-- ============================================================================
-- recomendaciones: columnas nuevas (N-18)
-- ============================================================================
alter table recomendaciones
  add column if not exists cuidados_casa text,
  add column if not exists signos_alarma text,
  add column if not exists proxima_cita text,
  add column if not exists seccion_personalizada text,
  add column if not exists estado text not null default 'borrador'
    check (estado in ('borrador', 'en_edicion', 'aprobado')),
  add column if not exists aprobado_at timestamptz,
  add column if not exists editado_por uuid references perfiles (id),
  add column if not exists editado_at timestamptz;

alter table recomendaciones
  add constraint recomendaciones_servicio_id_key unique (servicio_id);

-- ============================================================================
-- servicios: cierre (N-19)
-- ============================================================================
alter table servicios
  add column if not exists pago_simulado boolean not null default false;

-- ============================================================================
-- notificaciones_pendientes (N-19) — MOCK/DEV: no hay canal push real (no
-- hay App Tutor ni FCM/OneSignal todavía, eso es Fase 7). Solo se registra
-- el evento, sin enviar nada.
-- ============================================================================
create table if not exists notificaciones_pendientes (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid references servicios (id) on delete cascade,
  tipo text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table notificaciones_pendientes enable row level security;
create policy "notificaciones_pendientes_medico_dueno" on notificaciones_pendientes for all
  using (exists (
    select 1 from servicios s where s.id = notificaciones_pendientes.servicio_id and s.medico_id = auth.uid()
  ));

-- ============================================================================
-- calificaciones_servicio (N-9 / N-8) — el rating real reemplaza el mock de
-- N-8 (CalificacionSection.jsx, Fase 2). Se puebla vía el RPC
-- simular_calificacion_tutor (MOCK/DEV: no existe App Tutor todavía).
-- ============================================================================
create table if not exists calificaciones_servicio (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios (id) on delete cascade unique,
  medico_id uuid not null references perfiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);

alter table calificaciones_servicio enable row level security;
create policy "calificaciones_servicio_medico_dueno" on calificaciones_servicio for all
  using (auth.uid() = medico_id);

-- ============================================================================
-- correcciones_soap_post_cierre (N-9) — D-507: nunca edita soap_notas, solo
-- registra la solicitud de corrección como anexo con su propio timestamp y
-- autor. El SOAP original permanece visible e intacto. No hay canal real de
-- revisión por Comité en esta fase — solo queda guardada la solicitud.
-- ============================================================================
create table if not exists correcciones_soap_post_cierre (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios (id) on delete cascade,
  soap_id uuid not null references soap_notas (id) on delete cascade,
  campo text not null check (campo in ('s', 'o', 'a', 'p')),
  valor_anterior text,
  valor_corregido text not null,
  motivo text not null,
  autor_id uuid not null references perfiles (id),
  estado text not null default 'pendiente_revision' check (estado in ('pendiente_revision')),
  created_at timestamptz not null default now()
);

alter table correcciones_soap_post_cierre enable row level security;
create policy "correcciones_soap_medico_dueno" on correcciones_soap_post_cierre for all
  using (exists (
    select 1 from servicios s where s.id = correcciones_soap_post_cierre.servicio_id and s.medico_id = auth.uid()
  ));

-- ============================================================================
-- D-507: SOAP inmutable tras el cierre.
-- ============================================================================
create or replace function fn_bloquear_update_soap_post_cierre()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from servicios s where s.id = old.servicio_id and s.estado = 'cerrada'
  ) then
    raise exception 'El SOAP es inmutable una vez cerrado el servicio (D-507). Usa el flujo de corrección post-cierre.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_update_soap_post_cierre on soap_notas;
create trigger trg_bloquear_update_soap_post_cierre
  before update on soap_notas
  for each row
  execute function fn_bloquear_update_soap_post_cierre();

-- ============================================================================
-- Funciones (SECURITY DEFINER — mismo patrón que 0004/0006/0008). Todas
-- verifican explícitamente que el servicio/recurso pertenezca al médico que
-- llama (auth.uid()), como refuerzo defensivo además de las policies de RLS.
-- ============================================================================

-- crear_orden_externa: N-17. Evalúa cada ítem (texto libre) contra el
-- catálogo semilla sustancias_controladas con fuzzy match simple (ilike).
-- Si algún ítem coincide, la orden nace bloqueada (D-228/229).
create or replace function crear_orden_externa(
  p_servicio_id uuid,
  p_laboratorio_destino text,
  p_items jsonb,
  p_indicaciones text
)
returns ordenes_externas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden ordenes_externas%rowtype;
  v_bloqueada boolean;
begin
  if not exists (select 1 from servicios where id = p_servicio_id and medico_id = auth.uid()) then
    raise exception 'Servicio no encontrado o no pertenece al médico actual';
  end if;

  select exists (
    select 1
    from jsonb_array_elements_text(p_items) as item
    join sustancias_controladas sc on lower(item) like '%' || lower(sc.nombre) || '%'
  ) into v_bloqueada;

  insert into ordenes_externas (servicio_id, laboratorio_destino, items, indicaciones, estado)
  values (p_servicio_id, p_laboratorio_destino, p_items, p_indicaciones,
          case when v_bloqueada then 'bloqueada_comite' else 'borrador' end)
  returning * into v_orden;

  return v_orden;
end;
$$;

-- actualizar_items_orden: reemplaza ítems/indicaciones/laboratorio mientras
-- la orden no esté emitida; re-evalúa el bloqueo por sustancia controlada.
create or replace function actualizar_items_orden(
  p_orden_id uuid,
  p_laboratorio_destino text,
  p_items jsonb,
  p_indicaciones text
)
returns ordenes_externas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden ordenes_externas%rowtype;
  v_bloqueada boolean;
begin
  select exists (
    select 1
    from jsonb_array_elements_text(p_items) as item
    join sustancias_controladas sc on lower(item) like '%' || lower(sc.nombre) || '%'
  ) into v_bloqueada;

  update ordenes_externas oe
    set laboratorio_destino = p_laboratorio_destino,
        items = p_items,
        indicaciones = p_indicaciones,
        estado = case when v_bloqueada then 'bloqueada_comite' else 'borrador' end
    from servicios s
    where oe.id = p_orden_id
      and oe.servicio_id = s.id
      and s.medico_id = auth.uid()
      and oe.estado in ('borrador', 'bloqueada_comite')
  returning oe.* into v_orden;

  if not found then
    raise exception 'Orden no encontrada, no pertenece al médico actual, o ya fue emitida';
  end if;

  return v_orden;
end;
$$;

-- emitir_orden_externa: borrador → emitida. Rechaza si sigue bloqueada.
create or replace function emitir_orden_externa(p_orden_id uuid)
returns ordenes_externas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden ordenes_externas%rowtype;
begin
  update ordenes_externas oe
    set estado = 'emitida',
        emitida_at = now()
    from servicios s
    where oe.id = p_orden_id
      and oe.servicio_id = s.id
      and s.medico_id = auth.uid()
      and oe.estado = 'borrador'
  returning oe.* into v_orden;

  if not found then
    raise exception 'Orden no encontrada, no pertenece al médico actual, o no está lista para emitir (borrador, sin bloqueo)';
  end if;

  return v_orden;
end;
$$;

-- cargar_resultado_orden: emitida → resultado_cargado. Sin OCR real — el
-- campo de "valores extraídos" es entrada manual del médico.
-- TODO: OCR real — P-EI-005.
create or replace function cargar_resultado_orden(
  p_orden_id uuid,
  p_resultado_archivo_url text,
  p_valores_manuales jsonb,
  p_interpretacion text
)
returns ordenes_externas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden ordenes_externas%rowtype;
begin
  update ordenes_externas oe
    set resultado_archivo_url = p_resultado_archivo_url,
        valores_manuales = p_valores_manuales,
        interpretacion = p_interpretacion,
        estado = 'resultado_cargado',
        resultado_cargado_at = now()
    from servicios s
    where oe.id = p_orden_id
      and oe.servicio_id = s.id
      and s.medico_id = auth.uid()
      and oe.estado = 'emitida'
  returning oe.* into v_orden;

  if not found then
    raise exception 'Orden no encontrada, no pertenece al médico actual, o no está emitida';
  end if;

  return v_orden;
end;
$$;

-- guardar_recomendaciones: upsert de las 4 secciones editables (N-18). No
-- usa IA para generar el borrador (fuera de esta fase); el médico escribe.
-- No retrocede un estado 'aprobado' a 'en_edicion' automáticamente.
create or replace function guardar_recomendaciones(
  p_servicio_id uuid,
  p_cuidados_casa text,
  p_signos_alarma text,
  p_proxima_cita text,
  p_seccion_personalizada text
)
returns recomendaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec recomendaciones%rowtype;
begin
  if not exists (select 1 from servicios where id = p_servicio_id and medico_id = auth.uid()) then
    raise exception 'Servicio no encontrado o no pertenece al médico actual';
  end if;

  insert into recomendaciones (servicio_id, cuidados_casa, signos_alarma, proxima_cita, seccion_personalizada, estado, editado_por, editado_at)
  values (p_servicio_id, p_cuidados_casa, p_signos_alarma, p_proxima_cita, p_seccion_personalizada, 'en_edicion', auth.uid(), now())
  on conflict (servicio_id) do update
    set cuidados_casa = excluded.cuidados_casa,
        signos_alarma = excluded.signos_alarma,
        proxima_cita = excluded.proxima_cita,
        seccion_personalizada = excluded.seccion_personalizada,
        estado = case when recomendaciones.estado = 'aprobado' then recomendaciones.estado else 'en_edicion' end,
        editado_por = excluded.editado_por,
        editado_at = excluded.editado_at
  returning * into v_rec;

  return v_rec;
end;
$$;

-- aprobar_recomendaciones: exige al menos "Cuidados en casa" redactado (P3 —
-- nada se aprueba vacío).
create or replace function aprobar_recomendaciones(p_servicio_id uuid)
returns recomendaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec recomendaciones%rowtype;
begin
  update recomendaciones r
    set estado = 'aprobado',
        aprobado_at = now()
    from servicios s
    where r.servicio_id = s.id
      and s.medico_id = auth.uid()
      and r.servicio_id = p_servicio_id
      and coalesce(r.cuidados_casa, '') <> ''
  returning r.* into v_rec;

  if not found then
    raise exception 'Recomendaciones no encontradas, no pertenecen al médico actual, o falta redactar "Cuidados en casa"';
  end if;

  return v_rec;
end;
$$;

-- cerrar_servicio: transaccional (D-506 bloqueantes), D-507 (inmutabilidad
-- vía el trigger de arriba), pago simulado (Siigo Pay real fuera del MVP —
-- TODO: integración Siigo Pay real — pendiente ECO), notificaciones_pendientes
-- (push real fuera del MVP, Fase 7). Revalida en servidor lo mismo que el
-- checklist ya calculó en el cliente (mismo criterio defensivo que
-- abrir_constelacion en 0006).
create or replace function cerrar_servicio(p_servicio_id uuid)
returns servicios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servicio servicios%rowtype;
  v_dx_principal text;
  v_formula_estado text;
begin
  select * into v_servicio from servicios
    where id = p_servicio_id and medico_id = auth.uid()
    for update;

  if not found then
    raise exception 'Servicio no encontrado o no pertenece al médico actual';
  end if;

  if v_servicio.estado <> 'activa' then
    raise exception 'El servicio no está activo (estado actual: %)', v_servicio.estado;
  end if;

  select a_assessment->>'dx_principal' into v_dx_principal
    from soap_notas where servicio_id = p_servicio_id;

  if coalesce(v_dx_principal, '') = '' then
    raise exception 'No se puede cerrar: falta el diagnóstico principal en SOAP·A (D-506)';
  end if;

  select estado into v_formula_estado from formulas where servicio_id = p_servicio_id;
  if v_formula_estado = 'borrador' then
    raise exception 'No se puede cerrar: hay una fórmula en estado BORRADOR (D-506)';
  end if;

  update servicios
    set estado = 'cerrada',
        cerrado_at = now(),
        pago_simulado = true
    where id = p_servicio_id
  returning * into v_servicio;

  insert into notificaciones_pendientes (servicio_id, tipo, payload)
  values (p_servicio_id, 'cierre_recomendaciones_formula', jsonb_build_object('servicio_id', p_servicio_id));

  return v_servicio;
end;
$$;

-- simular_calificacion_tutor -- MOCK: la App Tutor no existe todavía (mismo
-- patrón/caveat que registrar_respuesta_tutor en 0006 — cuando exista la App
-- Tutor real, este chequeo debe cambiar a validar la identidad del tutor, no
-- la del médico). Solo el médico dueño del servicio cerrado puede
-- dispararla, desde el panel de desarrollo de N-9.
create or replace function simular_calificacion_tutor(
  p_servicio_id uuid,
  p_rating int,
  p_comentario text
)
returns calificaciones_servicio
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cal calificaciones_servicio%rowtype;
  v_medico_id uuid;
begin
  select medico_id into v_medico_id from servicios
    where id = p_servicio_id and medico_id = auth.uid() and estado = 'cerrada';

  if v_medico_id is null then
    raise exception 'Servicio no encontrado, no pertenece al médico actual, o no está cerrado';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Calificación inválida: %', p_rating;
  end if;

  insert into calificaciones_servicio (servicio_id, medico_id, rating, comentario)
  values (p_servicio_id, v_medico_id, p_rating, p_comentario)
  on conflict (servicio_id) do update
    set rating = excluded.rating,
        comentario = excluded.comentario
  returning * into v_cal;

  return v_cal;
end;
$$;

-- solicitar_correccion_soap: D-507 — nunca edita soap_notas. Registra la
-- solicitud como anexo con quién/cuándo/qué campo cambió.
create or replace function solicitar_correccion_soap(
  p_servicio_id uuid,
  p_campo text,
  p_valor_corregido text,
  p_motivo text
)
returns correcciones_soap_post_cierre
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correccion correcciones_soap_post_cierre%rowtype;
  v_soap soap_notas%rowtype;
  v_valor_anterior text;
begin
  if not exists (
    select 1 from servicios where id = p_servicio_id and medico_id = auth.uid() and estado = 'cerrada'
  ) then
    raise exception 'Servicio no encontrado, no pertenece al médico actual, o no está cerrado';
  end if;

  if p_campo not in ('s', 'o', 'a', 'p') then
    raise exception 'Campo inválido: %', p_campo;
  end if;

  select * into v_soap from soap_notas where servicio_id = p_servicio_id;
  if not found then
    raise exception 'No existe SOAP para este servicio';
  end if;

  v_valor_anterior := case p_campo
    when 's' then v_soap.s_subjetivo
    when 'o' then v_soap.o_objetivo::text
    when 'a' then v_soap.a_assessment::text
    when 'p' then v_soap.p_plan
  end;

  insert into correcciones_soap_post_cierre (servicio_id, soap_id, campo, valor_anterior, valor_corregido, motivo, autor_id)
  values (p_servicio_id, v_soap.id, p_campo, v_valor_anterior, p_valor_corregido, p_motivo, auth.uid())
  returning * into v_correccion;

  return v_correccion;
end;
$$;

-- No se relajan policies existentes: ordenes_externas / recomendaciones ya
-- estaban restringidas al médico dueño desde 0001. Este archivo solo agrega
-- columnas, tres tablas nuevas (con RLS propia, médico dueño only), un
-- trigger de inmutabilidad, y los RPC de escritura de arriba.
