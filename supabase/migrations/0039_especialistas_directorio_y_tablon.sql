-- ============================================================================
-- MUVET · App Médico — Migración 0039: MUVET Especialistas
--                       (directorio de especialistas + tablón de ofertas)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0038.
--
-- ----------------------------------------------------------------------------
-- ⚠️ NOMBRES: este módulo SÍ coincide con su nombre visible
-- ----------------------------------------------------------------------------
--   UI "MUVET Turnos"        → ruta /relevo              → tablas relevo_*
--   UI "MUVET Relevo"        → ruta /cobertura-servicio  → tablas cobertura_*
--   UI "MUVET Auxiliar"      → ruta /apoyo               → tablas apoyo_*
--   UI "MUVET Especialistas" → ruta /especialistas       → tablas especialista_*  ← NUEVO
--
-- Los tres primeros arrastran identificadores que no coinciden con su nombre
-- (ver el bloque de src/lib/nombresModulos.js). Este es el primero que se
-- nombra igual por dentro y por fuera, porque nace ya con su nombre definitivo.
--
-- ----------------------------------------------------------------------------
-- Contexto
-- ----------------------------------------------------------------------------
-- Los tres módulos gremiales existentes son TABLONES: publicaciones con fecha
-- que caducan. No hay forma de que un médico con una especialidad clínica sea
-- ENCONTRABLE de forma permanente por otro médico o por una clínica que
-- necesita, por ejemplo, un cardiólogo. La única noción de especialidad era
-- `perfiles.especialidad`: texto libre, sin catálogo, imposible de filtrar y
-- visible solo dentro de una ficha de contacto ya establecida.
--
-- Este módulo agrega las dos mitades que faltaban, integradas:
--
--   A · DIRECTORIO — todo médico con matrícula `validado` y al menos una
--       especialidad marcada aparece AUTOMÁTICAMENTE en un directorio que
--       médicos y clínicas pueden buscar y filtrar. Sin opt-in, sin cola de
--       moderación: la matrícula validada (D-541) ya es el filtro de calidad.
--
--   B · TABLÓN — auxiliares y médicos-especialistas PUBLICAN ofertas
--       (ofrezco/busco, con zona y fecha) y solo los médicos-especialistas
--       navegan ese tablón y RESPONDEN. Es el lado inverso del directorio: el
--       especialista también busca trabajo, no solo lo recibe.
--
-- ----------------------------------------------------------------------------
-- Modelo
-- ----------------------------------------------------------------------------
--   perfiles.especialidades text[]     ← catálogo cerrado (espejo de 0015)
--   especialistas_directorio (vista)   ← la mitad A, derivada de `perfiles`
--   especialista_ofertas               ← la mitad B
--        └─ especialista_conversaciones   ← LAS DOS mitades, discriminadas por
--              └─ especialista_mensajes      `origen` · en tiempo real, con adjuntos
--
--   Contactar → abierta ──ambos "De acuerdo"──→ aceptada ──finalizar──→ finalizada
--                  └────cualquiera "Descartar"──→ descartada
--
-- Una SOLA tabla de conversaciones para las dos mitades. La negociación es
-- idéntica en ambas (hilo 1:1 privado + acuerdo mutuo + cierre), lo único que
-- cambia es de dónde salió el contacto. Separarlas habría duplicado nueve
-- triggers, dos RPC, la RLS entera y la rama de bandeja/historial por una
-- diferencia que se expresa con una columna.
--
-- ----------------------------------------------------------------------------
-- Por qué tabla propia y no `relevo_publicaciones`
-- ----------------------------------------------------------------------------
-- Mismo criterio que 0028, que sacó el matching médico↔auxiliar de MUVET
-- Turnos en vez de recargarlo: `relevo_publicaciones` arrastra `cupos`,
-- `sede_id` (→ clinica_sedes), `tipo_jornada`, `turnos`, `procedimientos`,
-- `duracion_horas` y `habilidades_*`, y su policy de insert cablea la matriz
-- `p.rol_objetivo = yo.rol`. Meter una audiencia nueva ahí obligaría a alterar
-- esa policy, `PUBLICACIONES_PERMITIDAS_POR_ROL` y todas las pantallas de
-- Turnos, para expresar algo que acá son seis columnas.
--
-- ----------------------------------------------------------------------------
-- Reglas de negocio que aplican
-- ----------------------------------------------------------------------------
--   D-541 · Sin matrícula validada no se entra al directorio. Es la condición
--           de la vista, no una decisión de la UI.
--   D-064 · Ningún dato de contacto directo antes del compromiso. Acá se lleva
--           al extremo: NO SE REVELA TELÉFONO NUNCA, ni siquiera tras el
--           acuerdo (decisión del fundador). Toda la comunicación va por el
--           chat del módulo — mismo criterio que 0028 impuso en Turnos.
--   D-540 · Extiende la excepción de chat en tiempo real ya concedida a los
--           otros tres módulos (0023, 0027, 0028).
--   D-550 · NO aplica: la visibilidad en el directorio es independiente de
--           `perfiles.disponible`, que rige domicilios. Un especialista con
--           `disponible = false` igual aparece — son dos servicios distintos.
--   Sin pagos: el especialista le cobra directo a quien lo contrata. No hay
--           `pago_*` en este módulo (mismo caso que MUVET Relevo tras 0034).
--
-- ----------------------------------------------------------------------------
-- SUPUESTOS (reportados al fundador)
-- ----------------------------------------------------------------------------
--   · Las CLÍNICAS no publican ni responden en el tablón (mitad B): solo
--     buscan y contactan en el directorio.
--   · Los AUXILIARES no ven el directorio (mitad A): publican en el tablón y
--     responden a quien los contacte desde ahí.
--   · El directorio NO expone `foto_url` de médicos: ese archivo vive en el
--     bucket privado `documents`, cuya policy de select solo deja leer la
--     carpeta propia (y las de clínica, vía `es_logo_clinica` de 0037).
--     Mostrar la foto exigiría una policy de storage análoga; el MVP usa
--     iniciales, que es lo que ya hace toda tarjeta de médico en la app.
--
-- ----------------------------------------------------------------------------
-- PASOS MANUALES que esta migración NO puede hacer
-- ----------------------------------------------------------------------------
--   1. Crear el bucket privado `especialista-chat` en el Dashboard
--      (Storage → New bucket → nombre exacto "especialista-chat", "Public
--      bucket" DESACTIVADO) — mismo procedimiento que `apoyo-chat` (0028),
--      `cobertura-chat` (0023) y `documents` (0003). Sin el bucket, las
--      policies de §8 no tienen efecto y los adjuntos fallan; el chat de texto
--      funciona igual.
--   2. Confirmar con el fundador el catálogo `ESPECIALIDADES_VETERINARIAS` de
--      src/lib/especialidades.js antes de congelarlo (igual que los catálogos
--      de habilidades de 0015).
-- ============================================================================


-- ============================================================================
-- 1. Columnas nuevas en tablas existentes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 perfiles.especialidades — el catálogo cerrado, multi-selección
-- ----------------------------------------------------------------------------
-- Espejo exacto de `habilidades_profesionales` (0015): `text[]` con default
-- vacío, catálogo en el cliente (src/lib/especialidades.js), sin FK ni tabla
-- de catálogo en BD. La diferencia con las habilidades es que acá NO se
-- admiten valores fuera del catálogo (`allowCustom={false}` en la UI): el
-- directorio se filtra por especialidad y un valor libre lo volvería inbuscable.
--
-- `perfiles.especialidad` (singular, texto libre, 0001) se CONSERVA tal cual:
-- lo siguen leyendo relevo_ficha_contacto y apoyo_ficha_contacto, y no hay
-- migración de datos porque los valores existentes son frases libres que no
-- pertenecen al catálogo — mismo criterio con el que 0015 dejó `habilidades`
-- en paz.
--
-- NO entra en fn_proteger_estado_validacion (0025/0025b): la escribe su dueño
-- con la policy `perfiles_update_own` de siempre. Lo que el usuario no puede
-- falsear es `estado_validacion`, que es la otra mitad del filtro del
-- directorio y sigue protegida por ese trigger.
alter table perfiles
  add column if not exists especialidades text[] not null default '{}';

-- Índice GIN: la consulta del directorio filtra con `especialidades @> [x]`
-- (`.contains()` en PostgREST).
create index if not exists perfiles_especialidades_idx
  on perfiles using gin (especialidades);

-- ----------------------------------------------------------------------------
-- 1.2 catalogo_servicios_medico.especialidad — etiqueta opcional
-- ----------------------------------------------------------------------------
-- Aditiva y nullable: permite agrupar los servicios del especialista por
-- especialidad en su ficha del directorio. Sin FK, valor del mismo catálogo —
-- misma convención que `apoyo_publicaciones.servicio_subtipo` (0028). El
-- directorio funciona sin ella (lista plana de servicios).
alter table catalogo_servicios_medico
  add column if not exists especialidad text;


-- ============================================================================
-- 2. Vista `especialistas_directorio` (la mitad A)
-- ============================================================================
-- `security_invoker = false` — corre con los permisos del dueño de la vista, no
-- del que consulta, así que atraviesa la RLS de `perfiles` (select solo la fila
-- propia, 0001) y la de `catalogo_servicios_medico` (select solo lo propio,
-- 0001/0025). Es exactamente el mecanismo de `perfiles_publico` (0014/0035), y
-- por eso lo que se expone se elige a mano, columna por columna.
--
-- Lo que NO sale acá, a propósito:
--   · telefono          → no se revela nunca en este módulo (ni tras acuerdo).
--   · matricula_comvezcol → el NÚMERO no; solo si la tiene y su estado. Es lo
--                         que necesita quien contrata para confiar, sin
--                         publicar el identificador gremial en un listado
--                         abierto a cualquier autenticado.
--   · direccion_sede, nit, carne_url, foto_url → ver SUPUESTOS de la cabecera.
--
-- Las tres condiciones del WHERE son el ingreso automático al banco:
--   rol='medico' + estado_validacion='validado' (D-541) + ≥1 especialidad.
--
-- La cuarta condición (el `exists` sobre quién consulta) es defensa en
-- profundidad sobre el `allowedRoles` del router: un auxiliar que llame a
-- PostgREST a mano recibe cero filas, no el directorio completo.
create or replace view especialistas_directorio
with (security_invoker = false)
as
select
  p.id,
  p.nombre_completo,
  p.especialidades,
  p.zona_cobertura,
  p.bio,
  p.estado_validacion,
  (p.matricula_comvezcol is not null) as tiene_matricula,
  coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', s.id,
               'nombre', s.nombre_servicio,
               'descripcion', s.descripcion,
               'precio', s.precio,
               'especialidad', s.especialidad
             )
             order by s.created_at
           )
    from catalogo_servicios_medico s
    where s.medico_id = p.id
      and s.activo
  ), '[]'::jsonb) as servicios
from perfiles p
where p.rol = 'medico'
  and p.estado_validacion = 'validado'
  and coalesce(array_length(p.especialidades, 1), 0) >= 1
  and exists (
    select 1 from perfiles me
    where me.id = auth.uid()
      and me.rol in ('medico', 'clinica')
  );

revoke all on especialistas_directorio from anon;
grant select on especialistas_directorio to authenticated;


-- ============================================================================
-- 3. Tablas del módulo
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 especialista_ofertas (la mitad B) — espejo de apoyo_publicaciones (0028)
-- ----------------------------------------------------------------------------
-- Una sola tabla para los dos sentidos, distinguidos por `tipo`:
--   'ofrezco' → "tengo disponibilidad para esto"
--   'busco'   → "necesito a alguien para esto"
-- La publican auxiliares y médicos-especialistas; el rol del autor queda
-- denormalizado en `autor_rol` (lo fija el trigger 4.1) para poder etiquetar la
-- tarjeta sin resolver `perfiles`, que es ilegible entre usuarios.
create table if not exists especialista_ofertas (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references perfiles (id) on delete cascade,
  autor_rol text not null check (autor_rol in ('medico', 'auxiliar')),

  tipo text not null check (tipo in ('ofrezco', 'busco')),
  especialidad text,

  descripcion text,
  zona text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  tarifa numeric(12, 2),

  activa boolean not null default true,
  estado text not null default 'abierta'
    check (estado in ('abierta', 'cancelada', 'finalizada')),

  created_at timestamptz not null default now()
);

create index if not exists especialista_ofertas_autor_idx
  on especialista_ofertas (autor_id);
create index if not exists especialista_ofertas_tablon_idx
  on especialista_ofertas (tipo, activa, created_at desc);

alter table especialista_ofertas enable row level security;


-- ----------------------------------------------------------------------------
-- 3.2 especialista_conversaciones — LAS DOS mitades
-- ----------------------------------------------------------------------------
-- `origen` es el discriminador:
--
--   'directorio' → oferta_id NULL, especialista_id = el médico contactado.
--                  Nace de la ficha del directorio: no hay publicación detrás,
--                  el "objeto" de la negociación es el especialista mismo.
--   'tablon'     → especialista_id NULL, oferta_id = la oferta respondida.
--                  Nace de una publicación, como en los otros tres módulos.
--
-- `autor_id` va denormalizado por la misma razón que en 0027/0028: si las
-- policies tuvieran que resolverlo con un subselect contra otra tabla con RLS
-- se repetiría la recursión entre policies. Lo escribe el trigger 4.3, así que
-- el cliente no lo puede falsear.
--
-- La unicidad va en DOS índices parciales en vez de un UNIQUE de tabla, porque
-- la columna que identifica el objeto cambia según el origen. Es lo que hace
-- idempotente a "Contactar" en las dos mitades.
create table if not exists especialista_conversaciones (
  id uuid primary key default gen_random_uuid(),

  origen text not null check (origen in ('directorio', 'tablon')),
  oferta_id uuid references especialista_ofertas (id) on delete cascade,
  especialista_id uuid references perfiles (id) on delete cascade,

  interesado_id uuid not null references perfiles (id) on delete cascade,
  autor_id uuid not null references perfiles (id) on delete cascade,

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

  constraint especialista_conv_partes_distintas check (autor_id <> interesado_id),
  constraint especialista_conv_origen_coherente check (
    (origen = 'directorio' and oferta_id is null and especialista_id is not null)
    or
    (origen = 'tablon' and oferta_id is not null and especialista_id is null)
  )
);

create unique index if not exists especialista_conv_unica_directorio
  on especialista_conversaciones (especialista_id, interesado_id)
  where origen = 'directorio';

create unique index if not exists especialista_conv_unica_tablon
  on especialista_conversaciones (oferta_id, interesado_id)
  where origen = 'tablon';

create index if not exists especialista_conv_interesado_idx
  on especialista_conversaciones (interesado_id, ultimo_mensaje_at desc);
create index if not exists especialista_conv_autor_idx
  on especialista_conversaciones (autor_id, ultimo_mensaje_at desc);
create index if not exists especialista_conv_oferta_idx
  on especialista_conversaciones (oferta_id);

alter table especialista_conversaciones enable row level security;


-- ----------------------------------------------------------------------------
-- 3.3 especialista_mensajes — texto y/o adjunto
-- ----------------------------------------------------------------------------
-- Como apoyo_mensajes (0028): el hilo admite adjuntos y NO se borra nunca. Un
-- especialista y quien lo contrata intercambian exámenes, radiografías,
-- cotizaciones — el adjunto no es un extra acá, es el contenido.
--
-- A diferencia de cobertura_mensajes (0023), que se purga al finalizar: acá el
-- historial se conserva y se consulta desde N-9 y N-34.
create table if not exists especialista_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references especialista_conversaciones (id) on delete cascade,
  remitente_id uuid not null references perfiles (id) on delete cascade,

  mensaje text,
  archivo_path text,
  archivo_tipo text,
  archivo_nombre text,

  created_at timestamptz not null default now(),

  constraint especialista_mensajes_contenido
    check (mensaje is not null or archivo_path is not null)
);

create index if not exists especialista_mensajes_conversacion_idx
  on especialista_mensajes (conversacion_id, created_at);

alter table especialista_mensajes enable row level security;


-- ============================================================================
-- 4. Triggers de negocio
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 Alta de oferta: el rol del autor lo fija el backend
-- ----------------------------------------------------------------------------
create or replace function especialista_ofertas_guardar_alta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rol text;
begin
  select p.rol into v_rol from perfiles p where p.id = new.autor_id;

  if v_rol is null then
    raise exception 'El perfil del autor no existe.';
  end if;

  new.autor_rol := v_rol;

  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  new.estado := 'abierta';
  new.activa := true;

  return new;
end;
$$;

drop trigger if exists trg_especialista_ofertas_guardar_alta on especialista_ofertas;
create trigger trg_especialista_ofertas_guardar_alta
  before insert on especialista_ofertas
  for each row execute function especialista_ofertas_guardar_alta();


-- ----------------------------------------------------------------------------
-- 4.2 Estado terminal de la oferta (espejo de apoyo_publicaciones, 0028)
-- ----------------------------------------------------------------------------
create or replace function especialista_ofertas_guardar_estado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado in ('cancelada', 'finalizada') and new.estado is distinct from old.estado then
    raise exception 'Esta oferta ya está % y no se puede reabrir.', old.estado;
  end if;

  -- `autor_rol` es del backend: se deriva del perfil, no se edita.
  new.autor_rol := old.autor_rol;
  new.autor_id := old.autor_id;
  new.tipo := old.tipo;

  if new.estado <> 'abierta' then
    new.activa := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_especialista_ofertas_guardar_estado on especialista_ofertas;
create trigger trg_especialista_ofertas_guardar_estado
  before update on especialista_ofertas
  for each row execute function especialista_ofertas_guardar_estado();


-- ----------------------------------------------------------------------------
-- 4.3 Alta de conversación: autor y estado inicial los fija el backend
-- ----------------------------------------------------------------------------
-- Acá es donde el discriminador `origen` se traduce a un `autor_id` concreto:
--
--   'tablon'     → el autor es quien publicó la oferta (como en los otros
--                  módulos).
--   'directorio' → el autor es el ESPECIALISTA contactado. Es deliberado que
--                  quede del lado "autor" aunque no haya publicado nada: es
--                  quien ofrece el servicio, así que las dos banderas de
--                  acuerdo quedan con la misma semántica que en el resto de la
--                  app (`acuerdo_autor` = quien presta, `acuerdo_interesado` =
--                  quien contrata) y la bandeja unificada no necesita un caso
--                  especial.
create or replace function especialista_conversaciones_guardar_alta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_autor_id uuid;
begin
  if new.origen = 'tablon' then
    select o.autor_id into v_autor_id
    from especialista_ofertas o
    where o.id = new.oferta_id;

    if v_autor_id is null then
      raise exception 'La oferta no existe.';
    end if;
  else
    v_autor_id := new.especialista_id;

    if v_autor_id is null then
      raise exception 'No se indicó a qué especialista contactas.';
    end if;
  end if;

  new.autor_id := v_autor_id;

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

drop trigger if exists trg_especialista_conversaciones_guardar_alta on especialista_conversaciones;
create trigger trg_especialista_conversaciones_guardar_alta
  before insert on especialista_conversaciones
  for each row execute function especialista_conversaciones_guardar_alta();


-- ----------------------------------------------------------------------------
-- 4.4 Acuerdo mutuo — el guardián
-- ----------------------------------------------------------------------------
-- Espejo de apoyo_conversaciones_guardar_acuerdo (0028 C.5). La policy de
-- update (6.2) deja escribir a los dos participantes SIN restringir columnas;
-- este trigger es lo que impide abusarla. `estado` nunca lo escribe el cliente:
-- se deriva de las dos banderas, o se pone en 'descartada'.
--
-- Diferencia propia de este módulo: la guarda de exclusividad SOLO aplica al
-- tablón. Una oferta se cierra con una sola contraparte (es un turno concreto),
-- pero un especialista del DIRECTORIO atiende a cuantos clientes quiera — sus
-- conversaciones son independientes entre sí. El índice único parcial ya
-- garantiza una sola por par (especialista, interesado).
create or replace function especialista_conversaciones_guardar_acuerdo()
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
  new.origen := old.origen;
  new.oferta_id := old.oferta_id;
  new.especialista_id := old.especialista_id;
  new.interesado_id := old.interesado_id;
  new.autor_id := old.autor_id;
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

  -- 'aceptada' no es terminal: es el estado en que se presta el servicio y el
  -- chat sigue vivo. Se sale de ahí SOLO por especialista_finalizar_servicio,
  -- que entra por el bypass de service_role.
  if old.estado = 'aceptada' then
    if new.estado is distinct from old.estado
       or new.acuerdo_autor is distinct from old.acuerdo_autor
       or new.acuerdo_interesado is distinct from old.acuerdo_interesado then
      raise exception 'Este servicio ya está confirmado. Para cerrarlo, usa "Finalizar servicio".';
    end if;
    return new;
  end if;

  if new.acuerdo_autor is distinct from old.acuerdo_autor and not v_soy_autor then
    raise exception 'Solo quien ofrece el servicio puede marcar su acuerdo.';
  end if;

  if new.acuerdo_interesado is distinct from old.acuerdo_interesado and not v_soy_interesado then
    raise exception 'Solo quien inició el contacto puede marcar su acuerdo.';
  end if;

  -- Un acuerdo ya dado no se retira: si cambiaste de idea, se descarta.
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
    -- Exclusividad solo en el tablón (ver cabecera del trigger).
    if old.origen = 'tablon' then
      select count(*) into v_ocupadas
      from especialista_conversaciones c
      where c.oferta_id = old.oferta_id
        and c.estado in ('aceptada', 'finalizada')
        and c.id <> old.id;

      if v_ocupadas > 0 then
        raise exception 'Esta oferta ya se cerró con otra persona.';
      end if;
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

drop trigger if exists trg_especialista_conversaciones_guardar_acuerdo on especialista_conversaciones;
create trigger trg_especialista_conversaciones_guardar_acuerdo
  before update on especialista_conversaciones
  for each row execute function especialista_conversaciones_guardar_acuerdo();


-- ----------------------------------------------------------------------------
-- 4.5 Cierre de la oferta al comprometerse (solo tablón)
-- ----------------------------------------------------------------------------
-- `security definer` por la misma razón que en 0016/0027/0028: el último
-- acuerdo puede venir del interesado, que por RLS no escribe en la oferta ajena.
create or replace function especialista_cerrar_oferta_al_aceptar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.origen = 'tablon' and new.estado in ('aceptada', 'finalizada') then
    update especialista_ofertas
      set activa = false
      where id = new.oferta_id and activa;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_especialista_cerrar_oferta_al_aceptar on especialista_conversaciones;
create trigger trg_especialista_cerrar_oferta_al_aceptar
  after insert or update on especialista_conversaciones
  for each row execute function especialista_cerrar_oferta_al_aceptar();


-- ----------------------------------------------------------------------------
-- 4.6 `ultimo_mensaje_at` — lo que ordena la bandeja
-- ----------------------------------------------------------------------------
create or replace function especialista_conversaciones_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update especialista_conversaciones
    set ultimo_mensaje_at = new.created_at
    where id = new.conversacion_id;
  return null;
end;
$$;

drop trigger if exists trg_especialista_conversaciones_touch on especialista_mensajes;
create trigger trg_especialista_conversaciones_touch
  after insert on especialista_mensajes
  for each row execute function especialista_conversaciones_touch();


-- ----------------------------------------------------------------------------
-- 4.7 Cascada al cancelar la oferta
-- ----------------------------------------------------------------------------
-- Solo se descartan las conversaciones ABIERTAS: un servicio ya acordado o ya
-- cumplido no se toca (criterio corregido en 0027 §2.5 y heredado por 0028).
create or replace function especialista_cancelar_descarta_abiertas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    update especialista_conversaciones
      set estado = 'descartada',
          acuerdo_autor = false,
          acuerdo_interesado = false,
          cerrada_at = now()
      where oferta_id = new.id
        and estado = 'abierta';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_especialista_cancelar_descarta_abiertas on especialista_ofertas;
create trigger trg_especialista_cancelar_descarta_abiertas
  after update on especialista_ofertas
  for each row execute function especialista_cancelar_descarta_abiertas();


-- ============================================================================
-- 5. Funciones de apoyo a las policies
-- ============================================================================
-- SECURITY DEFINER para cortar la recursión entre policies — misma razón que
-- relevo_soy_postulante (0017) y apoyo_soy_interesado (0028).

-- ¿Este perfil está en el directorio? Es la definición ÚNICA de "es un médico
-- especialista", y por eso la usan la vista, las dos policies de insert y el
-- espejo de cliente `esVisibleEnDirectorio` (src/lib/especialidades.js).
--
-- Sin argumento (o null) responde por el usuario actual; con argumento, por
-- otro perfil — hace falta en las dos formas: "¿puedo yo publicar/responder?" y
-- "¿a quién estoy contactando está de verdad en el directorio?".
create or replace function es_especialista_directorio(p_perfil_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles p
    where p.id = coalesce(p_perfil_id, auth.uid())
      and p.rol = 'medico'
      and p.estado_validacion = 'validado'
      and coalesce(array_length(p.especialidades, 1), 0) >= 1
  );
$$;

-- Para que quien respondió una oferta la siga viendo después de que se
-- desactive (si no, la tarjeta de su propia conversación se queda sin contexto).
create or replace function especialista_soy_interesado(p_oferta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from especialista_conversaciones c
    where c.oferta_id = p_oferta_id
      and c.interesado_id = auth.uid()
  );
$$;


-- ============================================================================
-- 6. RLS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6.1 especialista_ofertas
-- ----------------------------------------------------------------------------
drop policy if exists "especialista_ofertas_select" on especialista_ofertas;
create policy "especialista_ofertas_select" on especialista_ofertas
  for select using (
    activa
    or autor_id = auth.uid()
    or especialista_soy_interesado(id)
  );

-- Quién PUBLICA en el tablón: auxiliares y médicos-especialistas. La clínica no
-- participa en esta mitad (tiene el directorio y MUVET Turnos). Un médico sin
-- especialidades o sin matrícula validada tampoco: si no está en el directorio,
-- no es un especialista para este módulo.
drop policy if exists "especialista_ofertas_insert_autor" on especialista_ofertas;
create policy "especialista_ofertas_insert_autor" on especialista_ofertas
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and not perfil_en_disputa()
    and exists (
      select 1 from perfiles yo
      where yo.id = auth.uid()
        and (yo.rol = 'auxiliar' or es_especialista_directorio(auth.uid()))
    )
  );

drop policy if exists "especialista_ofertas_update_autor" on especialista_ofertas;
create policy "especialista_ofertas_update_autor" on especialista_ofertas
  for update using (autor_id = auth.uid()) with check (autor_id = auth.uid());

-- Sin delete: una oferta no se borra, se cancela.


-- ----------------------------------------------------------------------------
-- 6.2 especialista_conversaciones
-- ----------------------------------------------------------------------------
drop policy if exists "especialista_conversaciones_select_participantes" on especialista_conversaciones;
create policy "especialista_conversaciones_select_participantes" on especialista_conversaciones
  for select using (auth.uid() in (autor_id, interesado_id));

-- La matriz completa de quién contacta a quién, en backend:
--
--   directorio → contactan MÉDICO y CLÍNICA; el contactado tiene que estar de
--                verdad en el directorio (matrícula validada + especialidades),
--                no basta con mandar un uuid cualquiera.
--   tablón     → responden SOLO médicos-especialistas, sobre una oferta viva y
--                ajena. Un auxiliar publica, pero no responde: el tablón existe
--                para que el especialista ENCUENTRE trabajo.
drop policy if exists "especialista_conversaciones_insert_interesado" on especialista_conversaciones;
create policy "especialista_conversaciones_insert_interesado" on especialista_conversaciones
  for insert to authenticated
  with check (
    interesado_id = auth.uid()
    and not perfil_en_disputa()
    and (
      (
        origen = 'directorio'
        and oferta_id is null
        and especialista_id is not null
        and especialista_id <> auth.uid()
        and es_especialista_directorio(especialista_id)
        and exists (
          select 1 from perfiles yo
          where yo.id = auth.uid() and yo.rol in ('medico', 'clinica')
        )
      )
      or
      (
        origen = 'tablon'
        and especialista_id is null
        and es_especialista_directorio(auth.uid())
        and exists (
          select 1 from especialista_ofertas o
          where o.id = oferta_id
            and o.activa
            and o.estado = 'abierta'
            and o.autor_id <> auth.uid()
        )
      )
    )
  );

-- No restringe columnas a propósito: quien las restringe es el trigger 4.4.
drop policy if exists "especialista_conversaciones_update_participantes" on especialista_conversaciones;
create policy "especialista_conversaciones_update_participantes" on especialista_conversaciones
  for update using (auth.uid() in (autor_id, interesado_id))
  with check (auth.uid() in (autor_id, interesado_id));

-- Sin delete: una negociación no se borra, se descarta.


-- ----------------------------------------------------------------------------
-- 6.3 especialista_mensajes
-- ----------------------------------------------------------------------------
-- El select NO filtra por estado: el historial se conserva y se consulta
-- después de finalizado (igual que apoyo_mensajes, 0028).
drop policy if exists "especialista_mensajes_select_conversacion" on especialista_mensajes;
create policy "especialista_mensajes_select_conversacion" on especialista_mensajes
  for select using (
    exists (
      select 1 from especialista_conversaciones c
      where c.id = especialista_mensajes.conversacion_id
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

-- `c.estado in ('abierta','aceptada')`: el chat sigue abierto durante el
-- servicio y se cierra al finalizarlo o descartarlo. Es backend, no UI.
drop policy if exists "especialista_mensajes_insert_participante" on especialista_mensajes;
create policy "especialista_mensajes_insert_participante" on especialista_mensajes
  for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and not perfil_en_disputa()
    and exists (
      select 1 from especialista_conversaciones c
      where c.id = conversacion_id
        and c.estado in ('abierta', 'aceptada')
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

-- Sin update ni delete: un mensaje enviado no se edita ni se borra.


-- ============================================================================
-- 7. RPCs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 7.1 Finalizar el servicio
-- ----------------------------------------------------------------------------
-- Espejo de apoyo_finalizar_servicio (0028 C.8): única vía para salir de
-- 'aceptada'. NO borra los mensajes.
create or replace function especialista_finalizar_servicio(p_conversacion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_origen text;
  v_oferta_id uuid;
begin
  select c.estado, c.origen, c.oferta_id into v_estado, v_origen, v_oferta_id
  from especialista_conversaciones c
  where c.id = p_conversacion_id
    and auth.uid() in (c.autor_id, c.interesado_id);

  if v_estado is null then
    raise exception 'No participas en este servicio o no existe.';
  end if;

  if v_estado <> 'aceptada' then
    raise exception 'Solo se puede finalizar un servicio confirmado (estado actual: %).', v_estado;
  end if;

  update especialista_conversaciones
    set estado = 'finalizada',
        finalizada_at = now(),
        cerrada_at = now()
    where id = p_conversacion_id;

  -- La oferta muere con el servicio (solo aplica al tablón): ya estaba inactiva
  -- desde el acuerdo, acá pasa a terminal para que no reaparezca en "Mi oferta"
  -- como algo reactivable. En el directorio no hay nada que cerrar: el
  -- especialista sigue listado para el resto del mundo.
  if v_origen = 'tablon' then
    update especialista_ofertas
      set estado = 'finalizada', activa = false
      where id = v_oferta_id and estado = 'abierta';
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 7.2 Ficha del otro participante
-- ----------------------------------------------------------------------------
-- `perfiles` solo deja leer la fila propia (0001), así que hace falta una
-- función definer para saber con quién estás hablando dentro del hilo.
--
-- SIN teléfono, SIN dirección y SIN el número de matrícula — decisión del
-- fundador para este módulo: toda la comunicación va por el chat, que por eso
-- sobrevive al acuerdo. Es más estricto que relevo_ficha_contacto (que sí
-- revela `direccion_sede` tras el acuerdo) y consistente con
-- apoyo_ficha_contacto en no exponer teléfono.
--
-- Sirve sobre todo cuando el otro NO está en la vista del directorio: un
-- auxiliar que publicó en el tablón, o un especialista que dejó de estar
-- listado después de que la conversación empezó.
create or replace function especialista_ficha_contacto(p_perfil_id uuid)
returns table (
  id uuid,
  rol text,
  nombre_completo text,
  bio text,
  zona_cobertura text,
  especialidades text[],
  estado_validacion text,
  tiene_matricula boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.rol, p.nombre_completo, p.bio, p.zona_cobertura,
         p.especialidades, p.estado_validacion,
         (p.matricula_comvezcol is not null)
  from perfiles p
  where p.id = p_perfil_id
    and exists (
      select 1 from especialista_conversaciones c
      where (c.autor_id = auth.uid() and c.interesado_id = p_perfil_id)
         or (c.interesado_id = auth.uid() and c.autor_id = p_perfil_id)
    );
$$;


-- ============================================================================
-- 8. Notificaciones (amplía 0026 → 0027 → 0028 → 0029 → 0034)
-- ============================================================================
-- Los tipos vigentes se re-listan verbatim: el CHECK documenta el vocabulario
-- completo del sistema, no solo lo que agrega esta migración.
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
    'relevo_pago',
    'relevo_postulacion',        -- (histórico, previo a 0027)
    'relevo_decision',           -- (histórico, previo a 0027)
    'relevo_respuesta',          -- (histórico, previo a 0027)
    -- MUVET Relevo (tablas cobertura_*)
    'cobertura_ofrecimiento',
    'cobertura_mensaje',
    'cobertura_acuerdo',
    'cobertura_confirmada',
    'cobertura_descartada',
    'cobertura_finalizada',
    'cobertura_pago',            -- (histórico, retirado en 0034 §3)
    -- MUVET Auxiliar (tablas apoyo_*)
    'apoyo_contacto',
    'apoyo_mensaje',
    'apoyo_acuerdo',
    'apoyo_confirmada',
    'apoyo_descartada',
    'apoyo_finalizada',
    'apoyo_pago',
    -- MUVET Especialistas (tablas especialista_*) — 0039
    'especialista_contacto',     -- alguien abrió una conversación conmigo
    'especialista_mensaje',      -- mensaje nuevo dentro de una conversación
    'especialista_acuerdo',      -- la otra parte marcó "estoy de acuerdo"
    'especialista_confirmada',   -- ambos de acuerdo: servicio cerrado
    'especialista_descartada',   -- la otra parte se retiró
    'especialista_finalizada'    -- la otra parte dio el servicio por terminado
  ));


-- ----------------------------------------------------------------------------
-- 8.1 Mensajes
-- ----------------------------------------------------------------------------
create or replace function especialista_mensajes_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor_id uuid;
  v_interesado_id uuid;
  v_origen text;
  v_oferta_id uuid;
  v_destinatario uuid;
  v_actor text;
  v_tipo text;
  v_titulo text;
  v_primero boolean;
begin
  select c.autor_id, c.interesado_id, c.origen, c.oferta_id
    into v_autor_id, v_interesado_id, v_origen, v_oferta_id
  from especialista_conversaciones c
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

  -- El primer mensaje ES el contacto inicial: un solo aviso por esa acción.
  v_primero := not exists (
    select 1 from especialista_mensajes m
    where m.conversacion_id = new.conversacion_id and m.id <> new.id
  );

  if v_primero then
    v_tipo := 'especialista_contacto';
    v_titulo := case
      when v_origen = 'directorio' then v_actor || ' te contactó desde el directorio'
      else v_actor || ' respondió tu oferta'
    end;
  else
    v_tipo := 'especialista_mensaje';
    v_titulo := v_actor || ' te escribió en MUVET Especialistas';
  end if;

  insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
  values (
    v_destinatario,
    v_tipo,
    v_titulo,
    coalesce(nullif(new.mensaje, ''), new.archivo_nombre, 'Archivo adjunto'),
    '/especialistas/conversacion/' || new.conversacion_id,
    'especialista_mensajes',
    new.id,
    new.remitente_id,
    jsonb_build_object('conversacion_id', new.conversacion_id, 'origen', v_origen, 'oferta_id', v_oferta_id)
  );

  return null;
end;
$$;

drop trigger if exists trg_especialista_mensajes_notificar on especialista_mensajes;
create trigger trg_especialista_mensajes_notificar
  after insert on especialista_mensajes
  for each row execute function especialista_mensajes_notificar();


-- ----------------------------------------------------------------------------
-- 8.2 Acuerdo, cierre y descarte
-- ----------------------------------------------------------------------------
-- `auth.uid()` dentro de un trigger security definer sigue devolviendo a quien
-- llamó (lee el JWT, no el rol de ejecución) — mismo criterio que 0026–0028.
create or replace function especialista_conversaciones_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid;
  v_destinatario uuid;
  v_asunto text;
  v_url text;
begin
  v_quien := auth.uid();
  if v_quien = new.autor_id then
    v_destinatario := new.interesado_id;
  elsif v_quien = new.interesado_id then
    v_destinatario := new.autor_id;
  else
    -- Cambio sin usuario identificable (mantenimiento): no se notifica.
    return null;
  end if;

  if new.origen = 'tablon' then
    select o.descripcion into v_asunto
    from especialista_ofertas o where o.id = new.oferta_id;
    v_asunto := coalesce(nullif(v_asunto, ''), '(sin descripción)');
  else
    v_asunto := 'Consulta con especialista';
  end if;

  v_url := '/especialistas/conversacion/' || new.id;

  if new.estado = 'aceptada' and old.estado is distinct from 'aceptada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'especialista_confirmada',
      'Servicio confirmado: ' || notificaciones_nombre_actor(v_quien) || ' también aceptó',
      v_asunto, v_url, 'especialista_conversaciones', new.id, v_quien,
      jsonb_build_object('origen', new.origen, 'oferta_id', new.oferta_id)
    );
    return null;
  end if;

  if new.estado = 'finalizada' and old.estado is distinct from 'finalizada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'especialista_finalizada',
      notificaciones_nombre_actor(v_quien) || ' dio el servicio por finalizado',
      v_asunto, v_url, 'especialista_conversaciones', new.id, v_quien,
      jsonb_build_object('origen', new.origen, 'oferta_id', new.oferta_id)
    );
    return null;
  end if;

  if new.estado = 'descartada' and old.estado is distinct from 'descartada' then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'especialista_descartada',
      notificaciones_nombre_actor(v_quien) || ' descartó la conversación',
      v_asunto, v_url, 'especialista_conversaciones', new.id, v_quien,
      jsonb_build_object('origen', new.origen, 'oferta_id', new.oferta_id)
    );
    return null;
  end if;

  if new.estado = 'abierta'
     and ((new.acuerdo_autor and not old.acuerdo_autor)
       or (new.acuerdo_interesado and not old.acuerdo_interesado)) then
    insert into notificaciones (perfil_id, tipo, titulo, cuerpo, url, ref_tabla, ref_id, actor_id, payload)
    values (
      v_destinatario, 'especialista_acuerdo',
      notificaciones_nombre_actor(v_quien) || ' está de acuerdo · falta tu confirmación',
      v_asunto, v_url, 'especialista_conversaciones', new.id, v_quien,
      jsonb_build_object('origen', new.origen, 'oferta_id', new.oferta_id)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_especialista_conversaciones_notificar on especialista_conversaciones;
create trigger trg_especialista_conversaciones_notificar
  after update on especialista_conversaciones
  for each row execute function especialista_conversaciones_notificar();


-- ============================================================================
-- 9. Permisos de ejecución
-- ============================================================================
-- Las funciones de trigger no las llama nadie a mano; los helpers de policy y
-- los RPC sí, y solo autenticados.
revoke execute on function especialista_ofertas_guardar_alta() from public, anon, authenticated;
revoke execute on function especialista_ofertas_guardar_estado() from public, anon, authenticated;
revoke execute on function especialista_conversaciones_guardar_alta() from public, anon, authenticated;
revoke execute on function especialista_conversaciones_guardar_acuerdo() from public, anon, authenticated;
revoke execute on function especialista_cerrar_oferta_al_aceptar() from public, anon, authenticated;
revoke execute on function especialista_conversaciones_touch() from public, anon, authenticated;
revoke execute on function especialista_cancelar_descarta_abiertas() from public, anon, authenticated;
revoke execute on function especialista_mensajes_notificar() from public, anon, authenticated;
revoke execute on function especialista_conversaciones_notificar() from public, anon, authenticated;

revoke execute on function es_especialista_directorio(uuid) from public, anon;
grant execute on function es_especialista_directorio(uuid) to authenticated;
revoke execute on function especialista_soy_interesado(uuid) from public, anon;
grant execute on function especialista_soy_interesado(uuid) to authenticated;

revoke execute on function especialista_finalizar_servicio(uuid) from public, anon;
grant execute on function especialista_finalizar_servicio(uuid) to authenticated;
revoke execute on function especialista_ficha_contacto(uuid) from public, anon;
grant execute on function especialista_ficha_contacto(uuid) to authenticated;


-- ============================================================================
-- 10. Storage: bucket 'especialista-chat' (privado, creado a mano — ver cabecera)
-- ============================================================================
-- Convención de ruta: `${conversacion_id}/${uid}-${timestamp}.${ext}` — el
-- primer segmento es la CONVERSACIÓN (no el usuario), porque el archivo lo
-- deben poder leer los dos participantes. Igual que 'apoyo-chat' (0028) y
-- 'cobertura-chat' (0023).
--
-- Sin policy de delete: los adjuntos se conservan junto con el historial del
-- chat, igual que en 'apoyo-chat'.
drop policy if exists "especialista_chat_select_participantes" on storage.objects;
create policy "especialista_chat_select_participantes" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'especialista-chat'
    and exists (
      select 1 from especialista_conversaciones c
      where c.id::text = (storage.foldername(name))[1]
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );

drop policy if exists "especialista_chat_insert_participantes" on storage.objects;
create policy "especialista_chat_insert_participantes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'especialista-chat'
    and exists (
      select 1 from especialista_conversaciones c
      where c.id::text = (storage.foldername(name))[1]
        and c.estado in ('abierta', 'aceptada')
        and auth.uid() in (c.autor_id, c.interesado_id)
    )
  );


-- ============================================================================
-- 11. Realtime
-- ============================================================================
-- Crear la tabla NO la agrega sola a la publicación (ver la nota de 0023).
-- Bloque condicional como en 0026/0027/0028 para que sea re-ejecutable.
do $$
declare
  t text;
begin
  foreach t in array array['especialista_ofertas', 'especialista_conversaciones', 'especialista_mensajes'] loop
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
-- 12. Sin backfill
-- ============================================================================
-- No hay datos que migrar: el directorio se llena solo, en cuanto un médico ya
-- validado marca sus especialidades en N-8. El tablón arranca vacío.
