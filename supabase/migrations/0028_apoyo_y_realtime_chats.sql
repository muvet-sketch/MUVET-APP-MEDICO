-- ============================================================================
-- MUVET · App Médico — Migración 0028: MUVET Auxiliar (médico↔auxiliar) +
--                       chat en tiempo real y persistente en MUVET Turnos
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0027.
--
-- ----------------------------------------------------------------------------
-- ⚠️ NOMBRES: tercer módulo, tercer identificador que NO coincide con la UI
-- ----------------------------------------------------------------------------
--   UI "MUVET Turnos"    → ruta /relevo              → tablas relevo_*
--   UI "MUVET Relevo"    → ruta /cobertura-servicio  → tablas cobertura_*
--   UI "MUVET Auxiliar"  → ruta /apoyo               → tablas apoyo_*     ← NUEVO
--
-- El identificador interno del módulo nuevo es `apoyo` y NO `auxiliar`, a
-- propósito: `auxiliar` ya es un valor de `perfiles.rol`, y tener una tabla
-- `auxiliar_conversaciones` conviviendo con `rol = 'auxiliar'` haría ilegible
-- cada policy. Ver el bloque de src/lib/nombresModulos.js.
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- El matching médico↔auxiliar vivía dentro de MUVET Turnos como dos
-- combinaciones de (tipo, rol_objetivo): `busco:auxiliar` y `ofrezco:medico`.
-- Eso obligaba a modelar un encuentro entre dos personas con las mismas
-- columnas que una vacante de clínica, y no daba lugar a lo que de verdad
-- distingue este caso: el médico puede necesitar al auxiliar para que lo
-- ACOMPAÑE toda la jornada, o para que vaya solo a un domicilio a hacer una
-- TAREA sin que el médico esté presente. Son dos servicios distintos y el
-- segundo necesita una dirección de encuentro.
--
-- Este módulo se lleva ese matching completo. MUVET Turnos queda para lo que
-- involucra a una clínica (clinica↔medico, clinica↔auxiliar).
--
-- ----------------------------------------------------------------------------
-- MODIFICACIÓN A D-540 — confirmada con el fundador
-- ----------------------------------------------------------------------------
-- 0027 dejó D-540 así: hilo 1:1 privado que vive SOLO mientras dura la
-- negociación; al aceptarse o descartarse se cierra a mensajes nuevos. Y dejó
-- anotado el SUPUESTO de que eso deja a las partes sin canal justo cuando
-- empiezan a coordinar, compensado por revelar el teléfono.
--
-- El fundador resuelve ese supuesto al revés: **el canal se queda y el
-- teléfono se va**. A partir de aquí, en MUVET Turnos:
--
--   · El hilo sigue ADMITIENDO MENSAJES después del acuerdo. Se cierra cuando
--     una de las partes da el servicio por finalizado — nuevo estado terminal
--     `finalizada` en relevo_conversaciones + RPC relevo_finalizar_servicio.
--   · `relevo_ficha_contacto` DEJA DE DEVOLVER `telefono`. Ningún número de
--     teléfono de ninguna de las partes se muestra en ningún momento: toda la
--     comunicación se canaliza por el chat. `direccion_sede` de la clínica
--     sigue revelándose tras el acuerdo (criterio D-064 intacto).
--   · El hilo pasa a ser EN TIEMPO REAL. `relevo_mensajes` (0013) y
--     `relevo_conversaciones` (0027) ya estaban en la publicación
--     `supabase_realtime` "sin consumidor"; ahora lo tienen.
--
-- Esto extiende la excepción a "sin chat en tiempo real" (CLAUDE.md · No
-- incluir en el MVP) que 0023 ya había concedido a Cobertura de Servicio: pasa
-- a cubrir los tres módulos gremiales. La edición de CLAUDE.md (D-540 y
-- glosario) la hace el fundador aparte.
--
-- ----------------------------------------------------------------------------
-- Modelo del módulo nuevo
-- ----------------------------------------------------------------------------
--   apoyo_publicaciones          ← auxiliar ofrece disponibilidad (tipo='ofrezco')
--        │                         médico publica lo que necesita (tipo='busco')
--        └─ apoyo_conversaciones  ← la negociación · UNIQUE(publicacion, interesado)
--              ├─ apoyo_mensajes  ← el hilo, en tiempo real y CON ADJUNTOS
--              └─ apoyo_direccion ← la dirección de encuentro (tabla lateral, D-064)
--
--   Contactar → abierta ──ambos "De acuerdo"──→ aceptada ──finalizar──→ finalizada
--                  └────cualquiera "Descartar"──→ descartada
--
-- Diferencias deliberadas respecto a los otros dos módulos:
--   · vs relevo (0027): el chat sigue abierto en `aceptada` (misma regla que
--     el retrofit de más abajo) y hay adjuntos.
--   · vs cobertura (0023): al finalizar NO se borran los mensajes. El fundador
--     pide conservar el historial del chat y poder consultarlo desde el Home.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES que esta migración NO puede hacer
-- ----------------------------------------------------------------------------
--   1. Crear el bucket privado `apoyo-chat` en el Dashboard
--      (Storage → New bucket → nombre exacto "apoyo-chat", "Public bucket"
--      DESACTIVADO) — mismo procedimiento que `cobertura-chat` (0023) y
--      `documents` (0003). Sin el bucket, las policies de más abajo no tienen
--      efecto y los adjuntos fallan; el chat de texto funciona igual.
--   2. Borrar a mano los archivos que queden en el bucket `cobertura-chat`:
--      el bloque A de abajo vacía `cobertura_mensajes`, pero SQL no puede
--      borrar objetos de Storage (ver la nota de 0023 sobre por qué
--      finalizarServicio borra los adjuntos desde el cliente).
-- ============================================================================


-- ============================================================================
-- BLOQUE A · Limpieza de los datos de prueba de los módulos gremiales
-- ============================================================================
-- ⚠️ DESTRUCTIVO — autorizado explícitamente por el fundador: todas las
-- publicaciones, conversaciones, mensajes y notificaciones existentes son
-- pruebas hechas por él mismo con sus propias cuentas. Se quiere arrancar en
-- blanco porque el matching médico↔auxiliar cambia de tabla y no tiene sentido
-- arrastrar filas con la forma vieja.
--
-- Se CONSERVAN: `perfiles` (los usuarios siguen existiendo, con su matrícula y
-- su estado de validación) y TODO el flujo clínico (solicitudes, servicios,
-- soap_notas, formulas, mascotas, tutores, vacunas, …).
truncate table relevo_mensajes, relevo_conversaciones, relevo_publicaciones cascade;
truncate table cobertura_mensajes, cobertura_solicitudes cascade;
truncate table notificaciones cascade;


-- ============================================================================
-- BLOQUE B · CHECK de `notificaciones` (amplía 0026 → 0027 → 0028)
-- ============================================================================
-- Va antes que los triggers que insertan estos tipos. Los valores históricos
-- se conservan aunque el TRUNCATE de arriba ya no deje filas que los usen: el
-- CHECK documenta el vocabulario del sistema, no solo lo que hay hoy.
alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check
  check (tipo in (
    -- MUVET Turnos (tablas relevo_*)
    'relevo_contacto',         -- alguien abrió una conversación sobre mi oferta
    'relevo_mensaje',          -- mensaje nuevo dentro de una conversación
    'relevo_acuerdo',          -- la otra parte marcó "estoy de acuerdo"
    'relevo_confirmada',       -- ambos de acuerdo: turno cerrado
    'relevo_descartada',       -- la otra parte se retiró
    'relevo_finalizada',       -- 0028: la otra parte dio el servicio por terminado
    'relevo_postulacion',      -- (histórico, previo a 0027)
    'relevo_decision',         -- (histórico, previo a 0027)
    'relevo_respuesta',        -- (histórico, previo a 0027)
    -- MUVET Relevo (tablas cobertura_*)
    'cobertura_ofrecimiento',
    'cobertura_mensaje',
    'cobertura_finalizada',
    -- MUVET Auxiliar (tablas apoyo_*) — 0028
    'apoyo_contacto',
    'apoyo_mensaje',
    'apoyo_acuerdo',
    'apoyo_confirmada',
    'apoyo_descartada',
    'apoyo_finalizada'
  ));


-- ============================================================================
-- BLOQUE C · Módulo nuevo `apoyo_*` (UI: "MUVET Auxiliar")
-- ============================================================================

-- ----------------------------------------------------------------------------
-- C.1 apoyo_publicaciones
-- ----------------------------------------------------------------------------
-- Una sola tabla para los dos lados, distinguidos por `tipo`:
--   'ofrezco' → la publica un AUXILIAR: "estoy disponible".
--   'busco'   → la publica un MÉDICO: "necesito apoyo para esto".
--
-- `servicio_subtipo` es lo que este módulo agrega y Turnos no podía expresar:
--   'acompanamiento'  → el auxiliar acompaña al médico durante su jornada.
--   'tarea_domicilio' → el auxiliar va solo a un domicilio a hacer una tarea;
--                       el médico NO está presente.
-- Solo tiene sentido cuando el médico describe lo que necesita, de ahí el
-- CHECK de coherencia. Cuando es el auxiliar quien publica disponibilidad, el
-- subtipo lo elige el médico al contactarlo (ver el trigger C.5).
--
-- Sin acento en 'acompanamiento' a propósito: es un valor de enumeración que
-- viaja en URLs y en payloads jsonb; la tilde vive en la etiqueta de la UI
-- (SUBTIPOS_SERVICIO en src/lib/apoyo.js).
create table if not exists apoyo_publicaciones (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references perfiles (id) on delete cascade,

  tipo text not null check (tipo in ('ofrezco', 'busco')),
  servicio_subtipo text check (servicio_subtipo in ('acompanamiento', 'tarea_domicilio')),

  descripcion text,
  zona text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  tarifa numeric(12, 2),

  activa boolean not null default true,
  estado text not null default 'abierta'
    check (estado in ('abierta', 'cancelada', 'finalizada')),

  created_at timestamptz not null default now(),

  constraint apoyo_publicaciones_subtipo_coherente
    check ((tipo = 'busco') = (servicio_subtipo is not null))
);

create index if not exists apoyo_publicaciones_autor_idx on apoyo_publicaciones (autor_id);
create index if not exists apoyo_publicaciones_tablon_idx on apoyo_publicaciones (tipo, activa, created_at desc);

alter table apoyo_publicaciones enable row level security;


-- ----------------------------------------------------------------------------
-- C.2 apoyo_conversaciones
-- ----------------------------------------------------------------------------
-- Espejo de relevo_conversaciones (0027) con dos columnas más:
--   · `servicio_subtipo` denormalizado — para que la UI y la policy de
--     apoyo_direccion no tengan que subconsultar la publicación, y porque
--     cuando la publicación es 'ofrezco' el subtipo NO existe allá: lo aporta
--     el médico al contactar.
--   · `finalizada_at` — el servicio cumplido, distinto de `cerrada_at`
--     (que sella el orden en el historial en los tres desenlaces).
--
-- `autor_id` va denormalizado por la misma razón que en 0027: evitar la
-- recursión entre policies. Lo escribe el trigger C.5 desde la publicación.
create table if not exists apoyo_conversaciones (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references apoyo_publicaciones (id) on delete cascade,
  interesado_id uuid not null references perfiles (id) on delete cascade,
  autor_id uuid not null references perfiles (id) on delete cascade,

  servicio_subtipo text not null check (servicio_subtipo in ('acompanamiento', 'tarea_domicilio')),

  estado text not null default 'abierta'
    check (estado in ('abierta', 'aceptada', 'finalizada', 'descartada')),
  acuerdo_autor boolean not null default false,
  acuerdo_interesado boolean not null default false,
  descartada_por uuid references perfiles (id) on delete set null,

  created_at timestamptz not null default now(),
  aceptada_at timestamptz,
  finalizada_at timestamptz,
  cerrada_at timestamptz,
  ultimo_mensaje_at timestamptz not null default now(),
  leido_autor_at timestamptz,
  leido_interesado_at timestamptz,

  constraint apoyo_conversaciones_unica unique (publicacion_id, interesado_id),
  constraint apoyo_conversaciones_partes_distintas check (autor_id <> interesado_id)
);

create index if not exists apoyo_conversaciones_interesado_idx
  on apoyo_conversaciones (interesado_id, ultimo_mensaje_at desc);
create index if not exists apoyo_conversaciones_autor_idx
  on apoyo_conversaciones (autor_id, ultimo_mensaje_at desc);
create index if not exists apoyo_conversaciones_publicacion_idx
  on apoyo_conversaciones (publicacion_id);

alter table apoyo_conversaciones enable row level security;


-- ----------------------------------------------------------------------------
-- C.3 apoyo_mensajes
-- ----------------------------------------------------------------------------
-- Como cobertura_mensajes (0023): texto y/o adjunto. A diferencia de aquel,
-- estos mensajes NO se borran nunca — el historial del chat se conserva y se
-- consulta desde el Home y desde el historial único.
create table if not exists apoyo_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references apoyo_conversaciones (id) on delete cascade,
  remitente_id uuid not null references perfiles (id) on delete cascade,

  mensaje text,
  archivo_path text,
  archivo_tipo text,
  archivo_nombre text,

  created_at timestamptz not null default now(),

  constraint apoyo_mensajes_contenido check (mensaje is not null or archivo_path is not null)
);

create index if not exists apoyo_mensajes_conversacion_idx
  on apoyo_mensajes (conversacion_id, created_at);

alter table apoyo_mensajes enable row level security;


-- ----------------------------------------------------------------------------
-- C.4 apoyo_direccion — la dirección de encuentro (patrón D-064 de 0004)
-- ----------------------------------------------------------------------------
-- Mismo razonamiento que `solicitudes_direccion`: el dato sensible vive en una
-- tabla APARTE, no como columna de apoyo_conversaciones. Dos motivos:
--
--   1. Realtime manda la fila ENTERA de cualquier tabla publicada y no sabe
--      enmascarar columnas. apoyo_conversaciones sí está en la publicación
--      (la UI necesita ver el acuerdo del otro en vivo), así que una columna
--      `direccion` allí se le filtraría al auxiliar por websocket ANTES del
--      acuerdo. Esta tabla queda deliberadamente FUERA de la publicación.
--   2. Deja expresar en RLS "solo después del acuerdo" sin tocar el resto.
--
-- La escribe siempre el MÉDICO (sea autor o interesado de la conversación,
-- depende de quién publicó) y la puede ir redactando durante la negociación:
-- lo que está prohibido es que el auxiliar la LEA antes del acuerdo mutuo.
create table if not exists apoyo_direccion (
  conversacion_id uuid primary key references apoyo_conversaciones (id) on delete cascade,
  direccion_encuentro text not null,
  referencia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table apoyo_direccion enable row level security;


-- ----------------------------------------------------------------------------
-- C.5 Triggers de negocio
-- ----------------------------------------------------------------------------

-- Alta: autor y subtipo los fija el backend.
-- Si la publicación ya trae subtipo (la publicó el médico: 'busco'), manda ese
-- y el cliente no lo puede contradecir. Si no lo trae (la publicó el auxiliar:
-- 'ofrezco'), el subtipo es justamente lo que el médico está eligiendo al
-- contactarlo, así que se acepta el que mandó — pero es obligatorio.
create or replace function apoyo_conversaciones_guardar_alta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_autor_id uuid;
  v_subtipo text;
begin
  select p.autor_id, p.servicio_subtipo into v_autor_id, v_subtipo
  from apoyo_publicaciones p
  where p.id = new.publicacion_id;

  if v_autor_id is null then
    raise exception 'La publicación no existe.';
  end if;

  new.autor_id := v_autor_id;

  if v_subtipo is not null then
    new.servicio_subtipo := v_subtipo;
  elsif new.servicio_subtipo is null then
    raise exception 'Indica qué tipo de servicio necesitas (acompañamiento o tarea en domicilio).';
  end if;

  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  new.estado := 'abierta';
  new.acuerdo_autor := false;
  new.acuerdo_interesado := false;
  new.descartada_por := null;
  new.aceptada_at := null;
  new.finalizada_at := null;
  new.cerrada_at := null;

  return new;
end;
$$;

drop trigger if exists trg_apoyo_conversaciones_guardar_alta on apoyo_conversaciones;
create trigger trg_apoyo_conversaciones_guardar_alta
  before insert on apoyo_conversaciones
  for each row execute function apoyo_conversaciones_guardar_alta();


-- Acuerdo mutuo. Espejo de relevo_conversaciones_guardar_acuerdo (0027 §2.2),
-- con un estado terminal más: `finalizada`, al que solo se llega por el RPC
-- apoyo_finalizar_servicio (security definer → entra por el bypass de arriba).
-- El cliente nunca escribe `estado`: lo deriva este trigger de las dos
-- banderas, o lo pone en 'descartada'.
create or replace function apoyo_conversaciones_guardar_acuerdo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_soy_autor boolean;
  v_soy_interesado boolean;
  v_ocupadas integer;
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  v_soy_autor := auth.uid() = old.autor_id;
  v_soy_interesado := auth.uid() = old.interesado_id;

  if not (v_soy_autor or v_soy_interesado) then
    raise exception 'Solo los participantes de la conversación pueden modificarla.';
  end if;

  -- Datos que el cliente nunca cambia.
  new.publicacion_id := old.publicacion_id;
  new.interesado_id := old.interesado_id;
  new.autor_id := old.autor_id;
  new.servicio_subtipo := old.servicio_subtipo;
  new.created_at := old.created_at;
  new.aceptada_at := old.aceptada_at;
  new.finalizada_at := old.finalizada_at;
  new.cerrada_at := old.cerrada_at;
  new.descartada_por := old.descartada_por;

  -- Terminales de verdad: no admiten nada salvo marcar leído.
  if old.estado in ('finalizada', 'descartada') then
    if new.estado is distinct from old.estado
       or new.acuerdo_autor is distinct from old.acuerdo_autor
       or new.acuerdo_interesado is distinct from old.acuerdo_interesado then
      raise exception 'Esta conversación ya está % y no se puede cambiar.', old.estado;
    end if;
    return new;
  end if;

  -- 'aceptada' no es terminal: de ahí se sale finalizando el servicio, pero
  -- eso pasa por el RPC (que entra por el bypass), nunca por un UPDATE suelto
  -- del cliente. Acá lo único que queda permitido es marcar leído.
  if old.estado = 'aceptada' then
    if new.estado is distinct from old.estado
       or new.acuerdo_autor is distinct from old.acuerdo_autor
       or new.acuerdo_interesado is distinct from old.acuerdo_interesado then
      raise exception 'Este servicio ya está confirmado. Para cerrarlo, usa "Finalizar servicio".';
    end if;
    return new;
  end if;

  if new.acuerdo_autor is distinct from old.acuerdo_autor and not v_soy_autor then
    raise exception 'Solo quien publicó puede marcar su acuerdo.';
  end if;

  if new.acuerdo_interesado is distinct from old.acuerdo_interesado and not v_soy_interesado then
    raise exception 'Solo quien contactó la publicación puede marcar su acuerdo.';
  end if;

  if (old.acuerdo_autor and not new.acuerdo_autor)
     or (old.acuerdo_interesado and not new.acuerdo_interesado) then
    raise exception 'Un acuerdo ya dado no se puede retirar. Descarta la conversación si cambiaste de idea.';
  end if;

  if new.estado = 'descartada' then
    new.acuerdo_autor := false;
    new.acuerdo_interesado := false;
    new.descartada_por := auth.uid();
    new.cerrada_at := now();
    return new;
  end if;

  if new.acuerdo_autor and new.acuerdo_interesado then
    -- Este módulo no tiene `cupos`: es un encuentro entre dos personas, así que
    -- una publicación se compromete con UNA sola contraparte. La guarda evita
    -- la carrera de dos interesados cerrando el acuerdo a la vez.
    select count(*) into v_ocupadas
    from apoyo_conversaciones c
    where c.publicacion_id = old.publicacion_id
      and c.estado in ('aceptada', 'finalizada')
      and c.id <> old.id;

    if v_ocupadas > 0 then
      raise exception 'Esta publicación ya se cerró con otra persona.';
    end if;

    new.estado := 'aceptada';
    new.aceptada_at := now();
    new.cerrada_at := now();
  else
    new.estado := 'abierta';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apoyo_conversaciones_guardar_acuerdo on apoyo_conversaciones;
create trigger trg_apoyo_conversaciones_guardar_acuerdo
  before update on apoyo_conversaciones
  for each row execute function apoyo_conversaciones_guardar_acuerdo();


-- Cierre de la publicación al comprometerse. `security definer` por la misma
-- razón que en 0016/0027: el último acuerdo puede venir del interesado, que
-- por RLS no puede escribir en la publicación ajena.
create or replace function apoyo_cerrar_publicacion_al_aceptar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado in ('aceptada', 'finalizada') then
    update apoyo_publicaciones
      set activa = false
      where id = new.publicacion_id and activa;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_apoyo_cerrar_publicacion_al_aceptar on apoyo_conversaciones;
create trigger trg_apoyo_cerrar_publicacion_al_aceptar
  after insert or update on apoyo_conversaciones
  for each row execute function apoyo_cerrar_publicacion_al_aceptar();


-- `ultimo_mensaje_at`: lo que ordena la bandeja.
create or replace function apoyo_conversaciones_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update apoyo_conversaciones
    set ultimo_mensaje_at = new.created_at
    where id = new.conversacion_id;
  return null;
end;
$$;

drop trigger if exists trg_apoyo_conversaciones_touch on apoyo_mensajes;
create trigger trg_apoyo_conversaciones_touch
  after insert on apoyo_mensajes
  for each row execute function apoyo_conversaciones_touch();


-- Cascada al cancelar la publicación: solo se descartan las conversaciones
-- ABIERTAS (mismo criterio corregido en 0027 §2.5 — un servicio ya acordado o
-- ya cumplido no se toca).
create or replace function apoyo_cancelar_descarta_abiertas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    update apoyo_conversaciones
      set estado = 'descartada',
          acuerdo_autor = false,
          acuerdo_interesado = false,
          cerrada_at = now()
      where publicacion_id = new.id
        and estado = 'abierta';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_apoyo_cancelar_descarta_abiertas on apoyo_publicaciones;
create trigger trg_apoyo_cancelar_descarta_abiertas
  after update on apoyo_publicaciones
  for each row execute function apoyo_cancelar_descarta_abiertas();


-- Estado terminal de la publicación (espejo de 0018 para relevo_publicaciones).
create or replace function apoyo_publicaciones_guardar_estado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado in ('cancelada', 'finalizada') and new.estado is distinct from old.estado then
    raise exception 'Esta publicación ya está % y no se puede reabrir.', old.estado;
  end if;

  if new.estado <> 'abierta' then
    new.activa := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apoyo_publicaciones_guardar_estado on apoyo_publicaciones;
create trigger trg_apoyo_publicaciones_guardar_estado
  before update on apoyo_publicaciones
  for each row execute function apoyo_publicaciones_guardar_estado();


-- ----------------------------------------------------------------------------
-- C.6 Funciones de apoyo a las policies (SECURITY DEFINER para cortar la
--     recursión entre policies — misma razón que relevo_soy_postulante, 0017)
-- ----------------------------------------------------------------------------
create or replace function apoyo_soy_interesado(p_publicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from apoyo_conversaciones c
    where c.publicacion_id = p_publicacion_id
      and c.interesado_id = auth.uid()
  );
$$;

-- ¿Soy el médico de esta conversación? Da igual de qué lado esté: si la
-- publicación era 'ofrezco' el médico es el interesado, y si era 'busco' es el
-- autor. Lo que decide es el rol del perfil, no la posición en la fila.
create or replace function apoyo_soy_medico_de(p_conversacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from apoyo_conversaciones c
    join perfiles yo on yo.id = auth.uid()
    where c.id = p_conversacion_id
      and auth.uid() in (c.autor_id, c.interesado_id)
      and yo.rol = 'medico'
  );
$$;


-- ----------------------------------------------------------------------------
-- C.7 RLS
-- ----------------------------------------------------------------------------

-- apoyo_publicaciones ........................................................
drop policy if exists "apoyo_publicaciones_select" on apoyo_publicaciones;
create policy "apoyo_publicaciones_select" on apoyo_publicaciones
  for select using (
    activa
    or autor_id = auth.uid()
    or apoyo_soy_interesado(id)
  );

-- El emparejamiento médico↔auxiliar se cierra acá, en backend: un auxiliar
-- solo puede OFRECER y un médico solo puede BUSCAR. Ningún otro rol publica en
-- este módulo (la clínica tiene MUVET Turnos).
drop policy if exists "apoyo_publicaciones_insert_autor" on apoyo_publicaciones;
create policy "apoyo_publicaciones_insert_autor" on apoyo_publicaciones
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from perfiles yo
      where yo.id = auth.uid()
        and ((tipo = 'ofrezco' and yo.rol = 'auxiliar')
          or (tipo = 'busco' and yo.rol = 'medico'))
    )
  );

drop policy if exists "apoyo_publicaciones_update_autor" on apoyo_publicaciones;
create policy "apoyo_publicaciones_update_autor" on apoyo_publicaciones
  for update using (autor_id = auth.uid()) with check (autor_id = auth.uid());

-- Sin delete: una publicación no se borra, se cancela.


-- apoyo_conversaciones .......................................................
drop policy if exists "apoyo_conversaciones_select_participantes" on apoyo_conversaciones;
create policy "apoyo_conversaciones_select_participantes" on apoyo_conversaciones
  for select using (auth.uid() in (autor_id, interesado_id));

-- Contactar exige publicación viva, ajena, y el rol complementario: al
-- auxiliar que ofrece lo contacta un médico, y al médico que busca lo contacta
-- un auxiliar. Es la otra mitad del emparejamiento.
drop policy if exists "apoyo_conversaciones_insert_interesado" on apoyo_conversaciones;
create policy "apoyo_conversaciones_insert_interesado" on apoyo_conversaciones
  for insert to authenticated
  with check (
    interesado_id = auth.uid()
    and exists (
      select 1
      from apoyo_publicaciones p
      join perfiles yo on yo.id = auth.uid()
      where p.id = publicacion_id
        and p.activa
        and p.estado = 'abierta'
        and p.autor_id <> auth.uid()
        and ((p.tipo = 'ofrezco' and yo.rol = 'medico')
          or (p.tipo = 'busco' and yo.rol = 'auxiliar'))
    )
  );

-- No restringe columnas a propósito: quien las restringe es el trigger C.5.
drop policy if exists "apoyo_conversaciones_update_participantes" on apoyo_conversaciones;
create policy "apoyo_conversaciones_update_participantes" on apoyo_conversaciones
  for update using (auth.uid() in (autor_id, interesado_id))
  with check (auth.uid() in (autor_id, interesado_id));

-- Sin delete: una negociación no se borra, se descarta.


-- apoyo_mensajes .............................................................
-- El select NO filtra por estado: el historial del chat se conserva y se
-- consulta después de finalizado (es justamente lo que 0023 no hace).
drop policy if exists "apoyo_mensajes_select_conversacion" on apoyo_mensajes;
create policy "apoyo_mensajes_select_conversacion" on apoyo_mensajes
  for select using (
    exists (
      select 1 from apoyo_conversaciones c
      where c.id = apoyo_mensajes.conversacion_id
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

-- `c.estado in ('abierta','aceptada')` es la regla nueva: el chat SIGUE ABIERTO
-- después del acuerdo y se cierra al finalizar el servicio. Es backend, no una
-- condición de la UI.
drop policy if exists "apoyo_mensajes_insert_participante" on apoyo_mensajes;
create policy "apoyo_mensajes_insert_participante" on apoyo_mensajes
  for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and exists (
      select 1 from apoyo_conversaciones c
      where c.id = conversacion_id
        and c.estado in ('abierta', 'aceptada')
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

-- Sin update ni delete: un mensaje enviado no se edita ni se borra.


-- apoyo_direccion ............................................................
-- La escribe el médico, y puede irla redactando desde antes del acuerdo.
drop policy if exists "apoyo_direccion_insert_medico" on apoyo_direccion;
create policy "apoyo_direccion_insert_medico" on apoyo_direccion
  for insert to authenticated
  with check (
    apoyo_soy_medico_de(conversacion_id)
    and exists (
      select 1 from apoyo_conversaciones c
      where c.id = conversacion_id and c.estado in ('abierta', 'aceptada')
    )
  );

drop policy if exists "apoyo_direccion_update_medico" on apoyo_direccion;
create policy "apoyo_direccion_update_medico" on apoyo_direccion
  for update using (
    apoyo_soy_medico_de(conversacion_id)
    and exists (
      select 1 from apoyo_conversaciones c
      where c.id = apoyo_direccion.conversacion_id and c.estado in ('abierta', 'aceptada')
    )
  ) with check (apoyo_soy_medico_de(conversacion_id));

-- ⚠️ ESTA es la policy que implementa "la dirección se comparte cuando las dos
-- partes están de acuerdo". El auxiliar no la lee hasta que la conversación
-- llega a 'aceptada'; el médico lee siempre la suya (es quien la escribió).
-- Mismo criterio que solicitudes_direccion_select_post_aceptacion (D-064).
drop policy if exists "apoyo_direccion_select_post_acuerdo" on apoyo_direccion;
create policy "apoyo_direccion_select_post_acuerdo" on apoyo_direccion
  for select using (
    apoyo_soy_medico_de(conversacion_id)
    or exists (
      select 1 from apoyo_conversaciones c
      where c.id = apoyo_direccion.conversacion_id
        and auth.uid() in (c.autor_id, c.interesado_id)
        and c.estado in ('aceptada', 'finalizada')
    )
  );

-- Sin delete.


-- ----------------------------------------------------------------------------
-- C.8 RPC: finalizar el servicio
-- ----------------------------------------------------------------------------
-- Espejo de cobertura_finalizar_servicio (0023) MENOS el `delete from
-- ..._mensajes`: acá el historial se conserva. Es la única vía para salir de
-- 'aceptada' — el trigger C.5 bloquea ese cambio desde el cliente y esta
-- función entra por el bypass de service_role/postgres.
create or replace function apoyo_finalizar_servicio(p_conversacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_publicacion_id uuid;
begin
  select c.estado, c.publicacion_id into v_estado, v_publicacion_id
  from apoyo_conversaciones c
  where c.id = p_conversacion_id
    and auth.uid() in (c.autor_id, c.interesado_id);

  if v_estado is null then
    raise exception 'No participas en este servicio o no existe.';
  end if;

  if v_estado <> 'aceptada' then
    raise exception 'Solo se puede finalizar un servicio confirmado (estado actual: %).', v_estado;
  end if;

  update apoyo_conversaciones
    set estado = 'finalizada',
        finalizada_at = now(),
        cerrada_at = now()
    where id = p_conversacion_id;

  -- La publicación muere con el servicio: ya estaba inactiva desde el acuerdo,
  -- acá pasa a terminal para que no reaparezca en "Mi publicación" como algo
  -- reactivable.
  update apoyo_publicaciones
    set estado = 'finalizada', activa = false
    where id = v_publicacion_id and estado = 'abierta';
end;
$$;

revoke execute on function apoyo_finalizar_servicio(uuid) from public, anon;
grant execute on function apoyo_finalizar_servicio(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- C.9 RPC: ficha del otro participante
-- ----------------------------------------------------------------------------
-- Espejo recortado de relevo_ficha_contacto: `perfiles` solo deja leer la fila
-- propia (0001), así que hace falta una función definer para saber con quién
-- estás hablando. SIN `telefono` y SIN `direccion_sede` — en este módulo el
-- único dato de ubicación es la dirección de encuentro (apoyo_direccion) y el
-- único canal es el chat.
create or replace function apoyo_ficha_contacto(p_perfil_id uuid)
returns table (
  id uuid,
  rol text,
  nombre_completo text,
  bio text,
  zona_cobertura text,
  especialidad text,
  matricula_comvezcol text,
  estado_validacion text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.rol, p.nombre_completo, p.bio, p.zona_cobertura,
         p.especialidad, p.matricula_comvezcol, p.estado_validacion
  from perfiles p
  where p.id = p_perfil_id
    and exists (
      select 1 from apoyo_conversaciones c
      where (c.autor_id = auth.uid() and c.interesado_id = p_perfil_id)
         or (c.interesado_id = auth.uid() and c.autor_id = p_perfil_id)
    );
$$;

revoke execute on function apoyo_ficha_contacto(uuid) from public, anon;
grant execute on function apoyo_ficha_contacto(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- C.10 Notificaciones del módulo
-- ----------------------------------------------------------------------------
create or replace function apoyo_mensajes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor_id uuid;
  v_interesado_id uuid;
  v_publicacion_id uuid;
  v_destinatario uuid;
  v_actor text;
  v_tipo text;
  v_titulo text;
  v_primero boolean;
begin
  select c.autor_id, c.interesado_id, c.publicacion_id
    into v_autor_id, v_interesado_id, v_publicacion_id
  from apoyo_conversaciones c
  where c.id = new.conversacion_id;

  if v_autor_id is null then
    return null;
  end if;

  if new.remitente_id = v_autor_id then
    v_destinatario := v_interesado_id;
  else
    v_destinatario := v_autor_id;
  end if;

  if v_destinatario is null or v_destinatario = new.remitente_id then
    return null;
  end if;

  v_actor := notificaciones_nombre_actor(new.remitente_id);

  v_primero := not exists (
    select 1 from apoyo_mensajes m
    where m.conversacion_id = new.conversacion_id and m.id <> new.id
  );

  if v_primero then
    v_tipo := 'apoyo_contacto';
    v_titulo := v_actor || ' te contactó por una publicación';
  else
    v_tipo := 'apoyo_mensaje';
    v_titulo := v_actor || ' te escribió en MUVET Auxiliar';
  end if;

  insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
  values (
    v_destinatario,
    v_tipo,
    v_titulo,
    coalesce(nullif(new.mensaje, ''), new.archivo_nombre, 'Archivo adjunto'),
    '/apoyo/conversacion/' || new.conversacion_id,
    'apoyo_mensajes',
    new.id,
    new.remitente_id,
    jsonb_build_object('conversacion_id', new.conversacion_id, 'publicacion_id', v_publicacion_id)
  );

  return null;
end;
$$;

drop trigger if exists trg_apoyo_mensajes_notificar on apoyo_mensajes;
create trigger trg_apoyo_mensajes_notificar
  after insert on apoyo_mensajes
  for each row execute function apoyo_mensajes_notificar();


-- `auth.uid()` dentro de un trigger security definer sigue devolviendo a quien
-- llamó (lee el JWT, no el rol de ejecución) — mismo criterio que 0026/0027.
create or replace function apoyo_conversaciones_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid;
  v_destinatario uuid;
  v_descripcion text;
  v_url text;
begin
  v_quien := auth.uid();
  if v_quien = new.autor_id then
    v_destinatario := new.interesado_id;
  elsif v_quien = new.interesado_id then
    v_destinatario := new.autor_id;
  else
    return null;
  end if;

  select p.descripcion into v_descripcion
  from apoyo_publicaciones p where p.id = new.publicacion_id;
  v_descripcion := coalesce(nullif(v_descripcion, ''), '(sin descripción)');
  v_url := '/apoyo/conversacion/' || new.id;

  if new.estado = 'aceptada' and old.estado is distinct from 'aceptada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'apoyo_confirmada',
      'Servicio confirmado: ' || notificaciones_nombre_actor(v_quien) || ' también aceptó',
      v_descripcion, v_url, 'apoyo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  if new.estado = 'finalizada' and old.estado is distinct from 'finalizada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'apoyo_finalizada',
      notificaciones_nombre_actor(v_quien) || ' dio el servicio por finalizado',
      v_descripcion, v_url, 'apoyo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  if new.estado = 'descartada' and old.estado is distinct from 'descartada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'apoyo_descartada',
      notificaciones_nombre_actor(v_quien) || ' descartó la conversación',
      v_descripcion, v_url, 'apoyo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  if new.estado = 'abierta'
     and ((new.acuerdo_autor and not old.acuerdo_autor)
       or (new.acuerdo_interesado and not old.acuerdo_interesado)) then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'apoyo_acuerdo',
      notificaciones_nombre_actor(v_quien) || ' está de acuerdo · falta tu confirmación',
      v_descripcion, v_url, 'apoyo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_apoyo_conversaciones_notificar on apoyo_conversaciones;
create trigger trg_apoyo_conversaciones_notificar
  after update on apoyo_conversaciones
  for each row execute function apoyo_conversaciones_notificar();


revoke execute on function apoyo_conversaciones_guardar_alta() from public, anon, authenticated;
revoke execute on function apoyo_conversaciones_guardar_acuerdo() from public, anon, authenticated;
revoke execute on function apoyo_cerrar_publicacion_al_aceptar() from public, anon, authenticated;
revoke execute on function apoyo_conversaciones_touch() from public, anon, authenticated;
revoke execute on function apoyo_cancelar_descarta_abiertas() from public, anon, authenticated;
revoke execute on function apoyo_publicaciones_guardar_estado() from public, anon, authenticated;
revoke execute on function apoyo_mensajes_notificar() from public, anon, authenticated;
revoke execute on function apoyo_conversaciones_notificar() from public, anon, authenticated;
revoke execute on function apoyo_soy_interesado(uuid) from public, anon;
grant execute on function apoyo_soy_interesado(uuid) to authenticated;
revoke execute on function apoyo_soy_medico_de(uuid) from public, anon;
grant execute on function apoyo_soy_medico_de(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- C.11 Storage: bucket 'apoyo-chat' (privado, creado a mano — ver cabecera)
-- ----------------------------------------------------------------------------
-- Convención de ruta: `${conversacion_id}/${uid}-${timestamp}.${ext}` — el
-- primer segmento es la conversación (no el usuario), porque el archivo lo
-- deben poder leer los DOS participantes. Igual que 'cobertura-chat' (0023).
--
-- A diferencia de aquel, acá NO hay policy de delete: los adjuntos se
-- conservan junto con el historial del chat.
drop policy if exists "apoyo_chat_select_participantes" on storage.objects;
create policy "apoyo_chat_select_participantes" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'apoyo-chat'
    and exists (
      select 1 from apoyo_conversaciones c
      where c.id::text = (storage.foldername(name))[1]
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

drop policy if exists "apoyo_chat_insert_participantes" on storage.objects;
create policy "apoyo_chat_insert_participantes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'apoyo-chat'
    and exists (
      select 1 from apoyo_conversaciones c
      where c.id::text = (storage.foldername(name))[1]
        and c.estado in ('abierta', 'aceptada')
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );


-- ----------------------------------------------------------------------------
-- C.12 Realtime
-- ----------------------------------------------------------------------------
-- Crear la tabla NO la agrega sola a la publicación (ver la nota de 0023).
-- Bloque condicional como en 0026/0027 para que la migración sea re-ejecutable.
--
-- `apoyo_direccion` queda deliberadamente FUERA: Realtime manda la fila entera
-- y no sabe enmascarar columnas — ver la nota de C.4.
do $$
declare
  t text;
begin
  foreach t in array array['apoyo_publicaciones', 'apoyo_conversaciones', 'apoyo_mensajes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end
$$;


-- ============================================================================
-- BLOQUE D · Retrofit de MUVET Turnos (tablas relevo_*)
-- ============================================================================
-- Ver "MODIFICACIÓN A D-540" en la cabecera. Tres cambios: estado terminal
-- nuevo `finalizada`, el hilo admite mensajes mientras esté `aceptada`, y la
-- ficha de contacto deja de devolver el teléfono.

-- ----------------------------------------------------------------------------
-- D.1 Nuevo estado terminal
-- ----------------------------------------------------------------------------
alter table relevo_conversaciones
  add column if not exists servicio_finalizado_at timestamptz;

alter table relevo_conversaciones drop constraint if exists relevo_conversaciones_estado_check;
alter table relevo_conversaciones add constraint relevo_conversaciones_estado_check
  check (estado in ('abierta', 'aceptada', 'descartada', 'finalizada'));


-- ----------------------------------------------------------------------------
-- D.2 El trigger de acuerdo entiende `finalizada`
-- ----------------------------------------------------------------------------
-- Reemplaza la versión de 0027 §2.2. Cambios respecto a aquella:
--   · 'aceptada' deja de ser terminal: es el estado en que se presta el
--     servicio. Se sale de ahí SOLO por relevo_finalizar_servicio (D.4), que
--     entra por el bypass de service_role/postgres.
--   · La guarda de cupos cuenta también las conversaciones ya finalizadas: un
--     turno cumplido siguió consumiendo su cupo.
--   · Congela `servicio_finalizado_at` como una columna más del backend.
create or replace function relevo_conversaciones_guardar_acuerdo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_soy_autor boolean;
  v_soy_interesado boolean;
  v_cupos integer;
  v_aceptadas integer;
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  v_soy_autor := auth.uid() = old.autor_id;
  v_soy_interesado := auth.uid() = old.interesado_id;

  if not (v_soy_autor or v_soy_interesado) then
    raise exception 'Solo los participantes de la conversación pueden modificarla.';
  end if;

  new.publicacion_id := old.publicacion_id;
  new.interesado_id := old.interesado_id;
  new.autor_id := old.autor_id;
  new.created_at := old.created_at;
  new.aceptada_at := old.aceptada_at;
  new.cerrada_at := old.cerrada_at;
  new.descartada_por := old.descartada_por;
  new.servicio_finalizado_at := old.servicio_finalizado_at;

  -- Terminales de verdad.
  if old.estado in ('descartada', 'finalizada') then
    if new.estado is distinct from old.estado
       or new.acuerdo_autor is distinct from old.acuerdo_autor
       or new.acuerdo_interesado is distinct from old.acuerdo_interesado then
      raise exception 'Esta conversación ya está % y no se puede cambiar.', old.estado;
    end if;
    return new;
  end if;

  -- 'aceptada' ya no cierra el hilo (D-540 modificado en 0028): es el estado
  -- en que las partes coordinan por chat. Lo único que no se puede es
  -- deshacerlo con un UPDATE suelto; para cerrarlo está el RPC.
  if old.estado = 'aceptada' then
    if new.estado is distinct from old.estado
       or new.acuerdo_autor is distinct from old.acuerdo_autor
       or new.acuerdo_interesado is distinct from old.acuerdo_interesado then
      raise exception 'Este turno ya está confirmado. Para cerrarlo, usa "Finalizar servicio".';
    end if;
    return new;
  end if;

  if new.acuerdo_autor is distinct from old.acuerdo_autor and not v_soy_autor then
    raise exception 'Solo quien publicó la oferta puede marcar su acuerdo.';
  end if;

  if new.acuerdo_interesado is distinct from old.acuerdo_interesado and not v_soy_interesado then
    raise exception 'Solo quien contactó la oferta puede marcar su acuerdo.';
  end if;

  if (old.acuerdo_autor and not new.acuerdo_autor)
     or (old.acuerdo_interesado and not new.acuerdo_interesado) then
    raise exception 'Un acuerdo ya dado no se puede retirar. Descarta la conversación si cambiaste de idea.';
  end if;

  if new.estado = 'descartada' then
    new.acuerdo_autor := false;
    new.acuerdo_interesado := false;
    new.descartada_por := auth.uid();
    new.cerrada_at := now();
    return new;
  end if;

  if new.acuerdo_autor and new.acuerdo_interesado then
    select p.cupos into v_cupos from relevo_publicaciones p where p.id = old.publicacion_id;

    select count(*) into v_aceptadas
    from relevo_conversaciones c
    where c.publicacion_id = old.publicacion_id
      and c.estado in ('aceptada', 'finalizada')
      and c.id <> old.id;

    if v_aceptadas >= coalesce(v_cupos, 1) then
      raise exception 'Esta oferta ya no tiene cupos disponibles.';
    end if;

    new.estado := 'aceptada';
    new.aceptada_at := now();
    new.cerrada_at := now();
  else
    new.estado := 'abierta';
  end if;

  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- D.3 El cierre por cupos cuenta también las finalizadas
-- ----------------------------------------------------------------------------
-- Si no, un turno cumplido dejaría de contar y la oferta se republicaría sola.
create or replace function relevo_cerrar_publicacion_por_cupos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupos integer;
  v_aceptadas integer;
begin
  select p.cupos into v_cupos from relevo_publicaciones p where p.id = new.publicacion_id;
  if v_cupos is null then
    return null;
  end if;

  select count(*) into v_aceptadas
  from relevo_conversaciones c
  where c.publicacion_id = new.publicacion_id
    and c.estado in ('aceptada', 'finalizada');

  if v_aceptadas >= v_cupos then
    update relevo_publicaciones set activa = false where id = new.publicacion_id and activa;
  end if;

  return null;
end;
$$;


-- ----------------------------------------------------------------------------
-- D.4 RPC: finalizar el turno
-- ----------------------------------------------------------------------------
create or replace function relevo_finalizar_servicio(p_conversacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select c.estado into v_estado
  from relevo_conversaciones c
  where c.id = p_conversacion_id
    and auth.uid() in (c.autor_id, c.interesado_id);

  if v_estado is null then
    raise exception 'No participas en esta conversación o no existe.';
  end if;

  if v_estado <> 'aceptada' then
    raise exception 'Solo se puede finalizar un turno confirmado (estado actual: %).', v_estado;
  end if;

  update relevo_conversaciones
    set estado = 'finalizada',
        servicio_finalizado_at = now(),
        cerrada_at = now()
    where id = p_conversacion_id;
end;
$$;

revoke execute on function relevo_finalizar_servicio(uuid) from public, anon;
grant execute on function relevo_finalizar_servicio(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- D.5 El hilo admite mensajes mientras el servicio esté en curso
-- ----------------------------------------------------------------------------
-- Antes: `c.estado = 'abierta'` (0027 §4.2) — el hilo moría con el acuerdo.
-- Ahora: sigue abierto en 'aceptada' y se cierra en 'finalizada'/'descartada'.
drop policy if exists "relevo_mensajes_insert_participante" on relevo_mensajes;
create policy "relevo_mensajes_insert_participante" on relevo_mensajes
  for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and exists (
      select 1 from relevo_conversaciones c
      where c.id = conversacion_id
        and c.estado in ('abierta', 'aceptada')
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );


-- ----------------------------------------------------------------------------
-- D.6 La ficha de contacto deja de devolver el teléfono
-- ----------------------------------------------------------------------------
-- Cambia la firma (se cae una columna del `returns table`), así que hay que
-- dropear primero. Sigue habiendo dos niveles, pero el de arriba se reduce a
-- la dirección de sede de la clínica:
--
--   conversación abierta                → matrícula + estado de validación,
--                                         especialidad, zona, bio, NIT.
--   conversación aceptada o finalizada  → además `direccion_sede`.
--
-- `telefono` ya no sale en ningún nivel: toda la comunicación va por el chat,
-- que a partir de 0028 sigue vivo mientras dure el servicio.
drop function if exists relevo_ficha_contacto(uuid);

create function relevo_ficha_contacto(p_perfil_id uuid)
returns table (
  id uuid,
  rol text,
  nombre_completo text,
  bio text,
  zona_cobertura text,
  especialidad text,
  matricula_comvezcol text,
  estado_validacion text,
  razon_social text,
  nit text,
  direccion_sede text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.rol, p.nombre_completo,
         p.bio, p.zona_cobertura, p.especialidad, p.matricula_comvezcol, p.estado_validacion,
         p.razon_social, p.nit,
         case when v.aceptada then p.direccion_sede end
  from perfiles p
  cross join lateral (
    select count(*) as relaciones,
           coalesce(bool_or(c.estado in ('aceptada', 'finalizada')), false) as aceptada
    from relevo_conversaciones c
    where (c.autor_id = auth.uid() and c.interesado_id = p_perfil_id)
       or (c.interesado_id = auth.uid() and c.autor_id = p_perfil_id)
  ) v
  where p.id = p_perfil_id
    and v.relaciones > 0;
$$;

revoke execute on function relevo_ficha_contacto(uuid) from public, anon;
grant execute on function relevo_ficha_contacto(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- D.7 Notificación de turno finalizado
-- ----------------------------------------------------------------------------
-- Reemplaza la versión de 0027 §5.2 agregando la rama 'finalizada'.
create or replace function relevo_conversaciones_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid;
  v_destinatario uuid;
  v_descripcion text;
  v_url text;
begin
  v_quien := auth.uid();
  if v_quien = new.autor_id then
    v_destinatario := new.interesado_id;
  elsif v_quien = new.interesado_id then
    v_destinatario := new.autor_id;
  else
    return null;
  end if;

  select p.descripcion into v_descripcion
  from relevo_publicaciones p where p.id = new.publicacion_id;
  v_descripcion := coalesce(nullif(v_descripcion, ''), '(sin descripción)');
  v_url := '/relevo/conversacion/' || new.id;

  if new.estado = 'aceptada' and old.estado is distinct from 'aceptada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'relevo_confirmada',
      'Turno confirmado: ' || notificaciones_nombre_actor(v_quien) || ' también aceptó',
      v_descripcion, v_url, 'relevo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  if new.estado = 'finalizada' and old.estado is distinct from 'finalizada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'relevo_finalizada',
      notificaciones_nombre_actor(v_quien) || ' dio el turno por finalizado',
      v_descripcion, v_url, 'relevo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  if new.estado = 'descartada' and old.estado is distinct from 'descartada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'relevo_descartada',
      notificaciones_nombre_actor(v_quien) || ' descartó la conversación',
      v_descripcion, v_url, 'relevo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
    return null;
  end if;

  if new.estado = 'abierta'
     and ((new.acuerdo_autor and not old.acuerdo_autor)
       or (new.acuerdo_interesado and not old.acuerdo_interesado)) then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'relevo_acuerdo',
      notificaciones_nombre_actor(v_quien) || ' está de acuerdo · falta tu confirmación',
      v_descripcion, v_url, 'relevo_conversaciones', new.id, v_quien,
      jsonb_build_object('publicacion_id', new.publicacion_id)
    );
  end if;

  return null;
end;
$$;

revoke execute on function relevo_conversaciones_guardar_acuerdo() from public, anon, authenticated;
revoke execute on function relevo_cerrar_publicacion_por_cupos() from public, anon, authenticated;
revoke execute on function relevo_conversaciones_notificar() from public, anon, authenticated;
