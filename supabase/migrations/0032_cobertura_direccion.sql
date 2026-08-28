-- ============================================================================
-- MUVET · App Médico — Migración 0032: punto de encuentro en MUVET Relevo (N-30)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0031.
--
-- ----------------------------------------------------------------------------
-- ⚠️ NOMBRES (ver src/lib/nombresModulos.js)
-- ----------------------------------------------------------------------------
-- Las tablas `cobertura_*` son el identificador interno de lo que la UI llama
-- **MUVET Relevo** (N-30, médico↔médico, ruta /cobertura-servicio). Lo que se
-- llama `relevo_*` en el código es MUVET Turnos. No es un error de nombres.
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- MUVET Relevo era el único de los tres módulos gremiales sin punto de
-- encuentro estructurado: solo tenía `zona` (un texto de perímetro), así que la
-- dirección real acababa suelta dentro del chat — que además se BORRA al
-- finalizar (cobertura_finalizar_servicio, 0023). El médico que cubría el
-- servicio se quedaba sin el dato justo cuando iba a necesitarlo.
--
-- Se replica el patrón de `apoyo_direccion` (0028 §C.4), que a su vez viene de
-- `solicitudes_direccion` (0004, D-064): tabla lateral + gate de lectura por
-- estado. Con dos diferencias propias de este módulo:
--
--   · La escribe el AUTOR de la solicitud (el médico que pasa el servicio: es
--     quien sabe dónde es), no "el médico" — acá los dos lados lo son.
--   · SOBREVIVE a la finalización. `cobertura_finalizar_servicio` solo borra
--     `cobertura_mensajes`; esta tabla no se toca, así que la dirección sigue
--     disponible en el historial (N-9) cuando el chat ya no existe. Es
--     deliberado: "sin historial del chat" era sobre los mensajes, no sobre
--     dónde se prestó el servicio.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES: ninguno.
-- ============================================================================


-- ============================================================================
-- §1 · Tabla cobertura_direccion
-- ============================================================================
create table if not exists cobertura_direccion (
  solicitud_id uuid primary key references cobertura_solicitudes (id) on delete cascade,
  direccion_encuentro text not null,
  referencia text,
  link_maps text,             -- opcional, lo pega el autor (D-536: deep link, sin mapa interno)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cobertura_direccion enable row level security;


-- ============================================================================
-- §2 · RLS
-- ============================================================================
-- Escribe solo el autor, y solo mientras el servicio sigue vivo. Puede irla
-- redactando desde antes de que alguien se ofrezca: lo que está prohibido es
-- que la LEA el otro médico antes de tomar el servicio.
drop policy if exists "cobertura_direccion_insert_autor" on cobertura_direccion;
create policy "cobertura_direccion_insert_autor" on cobertura_direccion
  for insert to authenticated
  with check (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = solicitud_id
        and s.autor_id = auth.uid()
        and s.estado in ('abierta', 'cubierta')
    )
  );

drop policy if exists "cobertura_direccion_update_autor" on cobertura_direccion;
create policy "cobertura_direccion_update_autor" on cobertura_direccion
  for update to authenticated
  using (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = cobertura_direccion.solicitud_id
        and s.autor_id = auth.uid()
        and s.estado in ('abierta', 'cubierta')
    )
  )
  with check (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = solicitud_id and s.autor_id = auth.uid()
    )
  );

-- ⚠️ ESTA es la policy que implementa "la dirección se comparte cuando el
-- servicio queda tomado". El médico que cubre no la lee hasta 'cubierta'; el
-- autor lee siempre la suya (es quien la escribió). Se mantiene en
-- 'finalizada' a propósito — ver la cabecera. Mismo criterio que D-064.
drop policy if exists "cobertura_direccion_select_post_cobertura" on cobertura_direccion;
create policy "cobertura_direccion_select_post_cobertura" on cobertura_direccion
  for select to authenticated
  using (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = cobertura_direccion.solicitud_id
        and (
          s.autor_id = auth.uid()
          or (s.medico_cobertura_id = auth.uid() and s.estado in ('cubierta', 'finalizada'))
        )
    )
  );

-- Sin delete: la dirección de un servicio prestado no se borra.


-- ============================================================================
-- §3 · Latido en vivo (mismo mecanismo que 0031)
-- ============================================================================
-- `cobertura_solicitudes` ya está en la publicación supabase_realtime (0023) y
-- ambas partes ya la leen y ya tienen suscripción viva (subscribeSolicitud).
-- El dato sensible no viaja por websocket: viaja la marca de tiempo, y el
-- cliente vuelve a pedir la dirección por PostgREST, donde decide §2.
alter table cobertura_solicitudes
  add column if not exists direccion_actualizada_at timestamptz;

create or replace function cobertura_direccion_touch_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update cobertura_solicitudes
     set direccion_actualizada_at = now()
   where id = new.solicitud_id;
  return new;
end;
$$;

drop trigger if exists trg_cobertura_direccion_touch on cobertura_direccion;
create trigger trg_cobertura_direccion_touch
  after insert or update on cobertura_direccion
  for each row
  execute function cobertura_direccion_touch_solicitud();

-- Misma razón que en 0031 §4: es una función de trigger, no un RPC.
revoke execute on function cobertura_direccion_touch_solicitud() from public, anon, authenticated;
