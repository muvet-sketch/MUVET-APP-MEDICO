-- ============================================================================
-- MUVET · App Médico — Migración 0029: Control de pagos de los módulos gremiales
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0028.
--
-- ----------------------------------------------------------------------------
-- ⚠️ NOMBRES (ver src/lib/nombresModulos.js — los ids NO coinciden con la UI)
-- ----------------------------------------------------------------------------
--   UI "MUVET Turnos"    → tablas relevo_*    → fila de servicio: relevo_conversaciones
--   UI "MUVET Relevo"    → tablas cobertura_* → fila de servicio: cobertura_solicitudes
--   UI "MUVET Auxiliar"  → tablas apoyo_*     → fila de servicio: apoyo_conversaciones
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- Cuando se cierra un servicio en cualquiera de los tres módulos gremiales, la
-- app no registraba nada sobre su PAGO. Esta migración agrega, transversal a
-- los tres:
--
--   1. Datos de pago en el perfil (perfiles.pago_*): titular, banco, tipo y
--      número de cuenta, llave BreB, link de pago. Todos opcionales. NO se
--      exponen por PostgREST — perfiles sigue con perfiles_select_own (0001)
--      como única policy de lectura; la contraparte solo los ve vía el RPC
--      <pfx>_datos_pago, y solo si el dueño hizo opt-in en ese servicio.
--
--   2. Estado de pago en la fila del servicio (pago_estado 'pendiente'|'pagado',
--      + quién/cuándo lo marcó + nota libre). Marca ÚNICA que cualquiera de las
--      dos partes puede poner o quitar.
--
--   3. Opt-in por parte para compartir los datos de pago dentro de un matching
--      (pago_datos_autor / pago_datos_<contraparte>). Mismo criterio de
--      consentimiento que D-064: la contraparte no ve nada hasta que se marca.
--      Vive en la fila del servicio + se lee del perfil, así que SOBREVIVE al
--      borrado del chat de MUVET Relevo (cobertura_finalizar_servicio, 0023).
--
-- Todo cambio de columnas pago_* pasa EXCLUSIVAMENTE por los RPC security
-- definer de abajo (entran por el bypass service_role/postgres que los triggers
-- de acuerdo de relevo_/apoyo_ ya tienen al inicio). Por eso NO se tocan esos
-- triggers: la lógica de acuerdo/estado de 0027/0028 queda intacta.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES: ninguno. No hay buckets ni secrets nuevos.
-- ============================================================================


-- ============================================================================
-- BLOQUE A · Datos de pago en el perfil
-- ============================================================================
-- Los llena el propio usuario desde su perfil (N-8 médico, N-28 inline
-- auxiliar). La clínica no lleva esta sección (decisión de producto), pero las
-- columnas existen para los tres roles por simetría.
alter table perfiles
  add column if not exists pago_titular text,
  add column if not exists pago_banco text,
  add column if not exists pago_tipo_cuenta text,   -- 'Ahorros' | 'Corriente' | 'Depósito de Bajo Monto' (texto libre; TIPOS_CUENTA en src/lib/pagos.js)
  add column if not exists pago_numero_cuenta text,
  add column if not exists pago_llave_breb text,
  add column if not exists pago_link text;

-- perfiles_update_own (0001) + fn_proteger_estado_validacion (0025) siguen
-- vigentes: el usuario puede escribir estas columnas de su propia fila y ese
-- trigger solo protege estado_validacion/fecha_validacion, no estas.


-- ============================================================================
-- BLOQUE B · Estado de pago en cada fila de servicio
-- ============================================================================
-- Mismo juego de columnas en las tres tablas. La segunda bandera de opt-in
-- cambia de nombre según la columna de contraparte de cada tabla:
--   relevo_conversaciones / apoyo_conversaciones → interesado_id  → pago_datos_interesado
--   cobertura_solicitudes                        → medico_cobertura_id → pago_datos_cobertura

alter table relevo_conversaciones
  add column if not exists pago_estado text not null default 'pendiente'
    check (pago_estado in ('pendiente', 'pagado')),
  add column if not exists pago_marcado_por uuid references perfiles (id) on delete set null,
  add column if not exists pago_marcado_at timestamptz,
  add column if not exists pago_nota text,
  add column if not exists pago_datos_autor boolean not null default false,
  add column if not exists pago_datos_interesado boolean not null default false;

alter table apoyo_conversaciones
  add column if not exists pago_estado text not null default 'pendiente'
    check (pago_estado in ('pendiente', 'pagado')),
  add column if not exists pago_marcado_por uuid references perfiles (id) on delete set null,
  add column if not exists pago_marcado_at timestamptz,
  add column if not exists pago_nota text,
  add column if not exists pago_datos_autor boolean not null default false,
  add column if not exists pago_datos_interesado boolean not null default false;

alter table cobertura_solicitudes
  add column if not exists pago_estado text not null default 'pendiente'
    check (pago_estado in ('pendiente', 'pagado')),
  add column if not exists pago_marcado_por uuid references perfiles (id) on delete set null,
  add column if not exists pago_marcado_at timestamptz,
  add column if not exists pago_nota text,
  add column if not exists pago_datos_autor boolean not null default false,
  add column if not exists pago_datos_cobertura boolean not null default false;

-- Realtime: las tres tablas ya están en la publicación supabase_realtime
-- (0023 / 0027 / 0028). Los cambios de pago_* se propagan solos a las pantallas
-- que ya están suscritas a la fila; no hace falta `alter publication`.


-- ============================================================================
-- BLOQUE C · CHECK de `notificaciones` (amplía 0028 → 0029)
-- ============================================================================
-- Se reproduce el vocabulario completo de 0028 y se añaden los tres tipos de
-- pago. Un solo tipo por módulo: el titulo/cuerpo distingue "marcó como pagado"
-- de "compartió sus datos de pago".
alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    -- MUVET Turnos (tablas relevo_*)
    'relevo_contacto',
    'relevo_mensaje',
    'relevo_acuerdo',
    'relevo_confirmada',
    'relevo_descartada',
    'relevo_finalizada',
    'relevo_pago',              -- 0029: pago marcado o datos de pago compartidos
    'relevo_postulacion',       -- (histórico, previo a 0027)
    'relevo_decision',          -- (histórico, previo a 0027)
    'relevo_respuesta',         -- (histórico, previo a 0027)
    -- MUVET Relevo (tablas cobertura_*)
    'cobertura_ofrecimiento',
    'cobertura_mensaje',
    'cobertura_finalizada',
    'cobertura_pago',           -- 0029
    -- MUVET Auxiliar (tablas apoyo_*)
    'apoyo_contacto',
    'apoyo_mensaje',
    'apoyo_acuerdo',
    'apoyo_confirmada',
    'apoyo_descartada',
    'apoyo_finalizada',
    'apoyo_pago'                -- 0029
  ));


-- ============================================================================
-- BLOQUE D · RPCs — MUVET Turnos (relevo_conversaciones)
-- ============================================================================
-- Patrón calcado de relevo_finalizar_servicio (0028 §D.4): security definer,
-- valida participante + estado, y entra por el bypass de los triggers.

-- D.1 Marcar / desmarcar el pago -------------------------------------------------
create or replace function relevo_pago_marcar(p_id uuid, p_pagado boolean, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_autor uuid;
  v_interesado uuid;
  v_ya_pagado boolean;
  v_destinatario uuid;
  v_nota text;
begin
  select estado, autor_id, interesado_id, (pago_estado = 'pagado')
    into v_estado, v_autor, v_interesado, v_ya_pagado
  from relevo_conversaciones
  where id = p_id;

  if v_estado is null then
    raise exception 'La conversación no existe.';
  end if;
  if auth.uid() not in (v_autor, v_interesado) then
    raise exception 'No participas en este servicio.';
  end if;
  if v_estado not in ('aceptada', 'finalizada') then
    raise exception 'Solo se puede registrar el pago de un servicio confirmado o finalizado.';
  end if;

  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

  update relevo_conversaciones
    set pago_estado      = case when p_pagado then 'pagado' else 'pendiente' end,
        pago_marcado_por = case when p_pagado then auth.uid() end,
        pago_marcado_at  = case when p_pagado then now() end,
        pago_nota        = v_nota
  where id = p_id;

  if p_pagado and not coalesce(v_ya_pagado, false) then
    v_destinatario := case when auth.uid() = v_autor then v_interesado else v_autor end;
    if v_destinatario is not null and v_destinatario <> auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_destinatario, 'relevo_pago',
        notificaciones_nombre_actor(auth.uid()) || ' marcó el servicio como pagado',
        v_nota,
        '/relevo/conversacion/' || p_id,
        'relevo_conversaciones', p_id, auth.uid(),
        jsonb_build_object('evento', 'pago_marcado', 'pago_estado', 'pagado')
      );
    end if;
  end if;
end;
$$;

-- D.2 Compartir / dejar de compartir mis datos de pago ------------------------
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

-- D.3 Leer los datos de pago de la contraparte (solo si hizo opt-in) ----------
create or replace function relevo_datos_pago(p_id uuid)
returns table (
  titular text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  llave_breb text,
  link text
)
language sql
security definer
stable
set search_path = public
as $$
  select pf.pago_titular, pf.pago_banco, pf.pago_tipo_cuenta,
         pf.pago_numero_cuenta, pf.pago_llave_breb, pf.pago_link
  from relevo_conversaciones c
  join perfiles pf
    on pf.id = case when auth.uid() = c.autor_id then c.interesado_id else c.autor_id end
  where c.id = p_id
    and auth.uid() in (c.autor_id, c.interesado_id)
    and case when auth.uid() = c.autor_id then c.pago_datos_interesado else c.pago_datos_autor end;
$$;


-- ============================================================================
-- BLOQUE E · RPCs — MUVET Auxiliar (apoyo_conversaciones)
-- ============================================================================

create or replace function apoyo_pago_marcar(p_id uuid, p_pagado boolean, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_autor uuid;
  v_interesado uuid;
  v_ya_pagado boolean;
  v_destinatario uuid;
  v_nota text;
begin
  select estado, autor_id, interesado_id, (pago_estado = 'pagado')
    into v_estado, v_autor, v_interesado, v_ya_pagado
  from apoyo_conversaciones
  where id = p_id;

  if v_estado is null then
    raise exception 'La conversación no existe.';
  end if;
  if auth.uid() not in (v_autor, v_interesado) then
    raise exception 'No participas en este servicio.';
  end if;
  if v_estado not in ('aceptada', 'finalizada') then
    raise exception 'Solo se puede registrar el pago de un servicio confirmado o finalizado.';
  end if;

  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

  update apoyo_conversaciones
    set pago_estado      = case when p_pagado then 'pagado' else 'pendiente' end,
        pago_marcado_por = case when p_pagado then auth.uid() end,
        pago_marcado_at  = case when p_pagado then now() end,
        pago_nota        = v_nota
  where id = p_id;

  if p_pagado and not coalesce(v_ya_pagado, false) then
    v_destinatario := case when auth.uid() = v_autor then v_interesado else v_autor end;
    if v_destinatario is not null and v_destinatario <> auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_destinatario, 'apoyo_pago',
        notificaciones_nombre_actor(auth.uid()) || ' marcó el servicio como pagado',
        v_nota,
        '/apoyo/conversacion/' || p_id,
        'apoyo_conversaciones', p_id, auth.uid(),
        jsonb_build_object('evento', 'pago_marcado', 'pago_estado', 'pagado')
      );
    end if;
  end if;
end;
$$;

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

create or replace function apoyo_datos_pago(p_id uuid)
returns table (
  titular text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  llave_breb text,
  link text
)
language sql
security definer
stable
set search_path = public
as $$
  select pf.pago_titular, pf.pago_banco, pf.pago_tipo_cuenta,
         pf.pago_numero_cuenta, pf.pago_llave_breb, pf.pago_link
  from apoyo_conversaciones c
  join perfiles pf
    on pf.id = case when auth.uid() = c.autor_id then c.interesado_id else c.autor_id end
  where c.id = p_id
    and auth.uid() in (c.autor_id, c.interesado_id)
    and case when auth.uid() = c.autor_id then c.pago_datos_interesado else c.pago_datos_autor end;
$$;


-- ============================================================================
-- BLOQUE F · RPCs — MUVET Relevo (cobertura_solicitudes)
-- ============================================================================
-- Contraparte = medico_cobertura_id; estados con pago = 'cubierta'/'finalizada'.
-- El chat se borra al finalizar (0023) pero estas columnas y el RPC de lectura
-- viven en cobertura_solicitudes / perfiles, así que el pago se sigue pudiendo
-- registrar y consultar después.

create or replace function cobertura_pago_marcar(p_id uuid, p_pagado boolean, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_autor uuid;
  v_cobertura uuid;
  v_ya_pagado boolean;
  v_tipo_servicio text;
  v_destinatario uuid;
  v_nota text;
begin
  select estado, autor_id, medico_cobertura_id, (pago_estado = 'pagado'), tipo_servicio
    into v_estado, v_autor, v_cobertura, v_ya_pagado, v_tipo_servicio
  from cobertura_solicitudes
  where id = p_id;

  if v_estado is null then
    raise exception 'La solicitud no existe.';
  end if;
  if auth.uid() not in (v_autor, v_cobertura) then
    raise exception 'No participas en este servicio.';
  end if;
  if v_estado not in ('cubierta', 'finalizada') then
    raise exception 'Solo se puede registrar el pago de un servicio en curso o finalizado.';
  end if;

  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

  update cobertura_solicitudes
    set pago_estado      = case when p_pagado then 'pagado' else 'pendiente' end,
        pago_marcado_por = case when p_pagado then auth.uid() end,
        pago_marcado_at  = case when p_pagado then now() end,
        pago_nota        = v_nota
  where id = p_id;

  if p_pagado and not coalesce(v_ya_pagado, false) then
    v_destinatario := case when auth.uid() = v_autor then v_cobertura else v_autor end;
    if v_destinatario is not null and v_destinatario <> auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_destinatario, 'cobertura_pago',
        notificaciones_nombre_actor(auth.uid()) || ' marcó el servicio como pagado',
        coalesce(v_nota, v_tipo_servicio),
        '/cobertura-servicio/chat/' || p_id,
        'cobertura_solicitudes', p_id, auth.uid(),
        jsonb_build_object('evento', 'pago_marcado', 'pago_estado', 'pagado')
      );
    end if;
  end if;
end;
$$;

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
  v_destinatario uuid;
begin
  select autor_id, medico_cobertura_id,
         case when auth.uid() = autor_id then pago_datos_autor else pago_datos_cobertura end
    into v_autor, v_cobertura, v_antes
  from cobertura_solicitudes
  where id = p_id;

  if v_autor is null then
    raise exception 'La solicitud no existe.';
  end if;
  if auth.uid() not in (v_autor, v_cobertura) then
    raise exception 'No participas en este servicio.';
  end if;

  if auth.uid() = v_autor then
    update cobertura_solicitudes set pago_datos_autor = p_compartir where id = p_id;
  else
    update cobertura_solicitudes set pago_datos_cobertura = p_compartir where id = p_id;
  end if;

  if p_compartir and not coalesce(v_antes, false) then
    v_destinatario := case when auth.uid() = v_autor then v_cobertura else v_autor end;
    if v_destinatario is not null and v_destinatario <> auth.uid() then
      insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
      values (
        v_destinatario, 'cobertura_pago',
        notificaciones_nombre_actor(auth.uid()) || ' compartió sus datos de pago',
        null,
        '/cobertura-servicio/chat/' || p_id,
        'cobertura_solicitudes', p_id, auth.uid(),
        jsonb_build_object('evento', 'datos_pago_compartidos')
      );
    end if;
  end if;
end;
$$;

create or replace function cobertura_datos_pago(p_id uuid)
returns table (
  titular text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  llave_breb text,
  link text
)
language sql
security definer
stable
set search_path = public
as $$
  select pf.pago_titular, pf.pago_banco, pf.pago_tipo_cuenta,
         pf.pago_numero_cuenta, pf.pago_llave_breb, pf.pago_link
  from cobertura_solicitudes s
  join perfiles pf
    on pf.id = case when auth.uid() = s.autor_id then s.medico_cobertura_id else s.autor_id end
  where s.id = p_id
    and auth.uid() in (s.autor_id, s.medico_cobertura_id)
    and case when auth.uid() = s.autor_id then s.pago_datos_cobertura else s.pago_datos_autor end;
$$;


-- ============================================================================
-- BLOQUE G · Permisos de ejecución
-- ============================================================================
-- Supabase concede EXECUTE a anon+authenticated por defecto sobre lo creado en
-- `public`; se revoca a public/anon y se deja solo authenticated (mismo cierre
-- que relevo_finalizar_servicio en 0028).
revoke execute on function relevo_pago_marcar(uuid, boolean, text) from public, anon;
grant  execute on function relevo_pago_marcar(uuid, boolean, text) to authenticated;
revoke execute on function relevo_pago_compartir(uuid, boolean) from public, anon;
grant  execute on function relevo_pago_compartir(uuid, boolean) to authenticated;
revoke execute on function relevo_datos_pago(uuid) from public, anon;
grant  execute on function relevo_datos_pago(uuid) to authenticated;

revoke execute on function apoyo_pago_marcar(uuid, boolean, text) from public, anon;
grant  execute on function apoyo_pago_marcar(uuid, boolean, text) to authenticated;
revoke execute on function apoyo_pago_compartir(uuid, boolean) from public, anon;
grant  execute on function apoyo_pago_compartir(uuid, boolean) to authenticated;
revoke execute on function apoyo_datos_pago(uuid) from public, anon;
grant  execute on function apoyo_datos_pago(uuid) to authenticated;

revoke execute on function cobertura_pago_marcar(uuid, boolean, text) from public, anon;
grant  execute on function cobertura_pago_marcar(uuid, boolean, text) to authenticated;
revoke execute on function cobertura_pago_compartir(uuid, boolean) from public, anon;
grant  execute on function cobertura_pago_compartir(uuid, boolean) to authenticated;
revoke execute on function cobertura_datos_pago(uuid) from public, anon;
grant  execute on function cobertura_datos_pago(uuid) to authenticated;
