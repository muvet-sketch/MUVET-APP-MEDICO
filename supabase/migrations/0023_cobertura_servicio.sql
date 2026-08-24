-- ============================================================================
-- MUVET · App Médico — Migración 0023: Cobertura de Servicio (médico↔médico)
-- ============================================================================
-- Este archivo NO se aplica automáticamente. Ejecutar manualmente en el
-- SQL Editor de Supabase (Dashboard → SQL Editor → New query → pegar y correr),
-- o vía MCP contra el proyecto real, igual que 0010–0022.
--
-- Contexto: función nueva, fuera del listado de 18 pantallas del MVP y
-- distinta de MUVET Relevo (N-26). Un médico que no puede atender un
-- servicio ya agendado publica una "solicitud de cobertura" con los detalles
-- (tipo de servicio, zona/perímetro, especie, raza, temperamento); otro
-- médico puede ofrecerse a cubrirlo. Al ofrecerse, ambos acceden a un chat en
-- tiempo real (con archivos/imágenes) que queda activo solo mientras dura el
-- servicio; cualquiera de los dos puede finalizarlo. Los apoyos quedan en un
-- historial con el detalle del servicio y el otro médico, pero SIN el
-- historial del chat.
--
-- EXCEPCIÓN EXPLÍCITA A D-540 / "no incluir chat en tiempo real" (CLAUDE.md):
-- confirmada con el fundador para este módulo únicamente. D-540 sigue
-- intacto para MUVET Relevo (relevo_mensajes no cambia acá). El nombre de la
-- función es "Cobertura de Servicio", no "Apoyo Médico" — ese nombre ya está
-- en uso en la UI real (pestaña del auxiliar en Relevo, TabMiOferta.jsx,
-- auxiliar→médico) y reusarlo hubiera creado dos funciones con el mismo
-- nombre en la app.
--
-- "Sin historial del chat" se implementa como borrado real de los mensajes y
-- sus archivos adjuntos al finalizar (no solo ocultamiento en UI) — ver
-- función cobertura_finalizar_servicio más abajo.
-- ============================================================================

-- ============================================================================
-- cobertura_solicitudes
-- ============================================================================
create table if not exists cobertura_solicitudes (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references perfiles (id) on delete cascade,
  medico_cobertura_id uuid references perfiles (id) on delete set null,

  tipo_servicio text not null,
  zona text,
  especie text,
  raza text,
  temperamento text,
  descripcion text,
  fecha_servicio date not null,
  hora_servicio time,

  estado text not null default 'abierta'
    check (estado in ('abierta', 'cubierta', 'finalizada', 'cancelada')),

  created_at timestamptz not null default now(),
  cubierta_at timestamptz,
  finalizada_at timestamptz
);

create index if not exists cobertura_solicitudes_autor_idx on cobertura_solicitudes (autor_id);
create index if not exists cobertura_solicitudes_cobertura_idx on cobertura_solicitudes (medico_cobertura_id);
create index if not exists cobertura_solicitudes_estado_idx on cobertura_solicitudes (estado);

alter table cobertura_solicitudes enable row level security;

-- Select: el tablón de "Disponibles" (abierta, cualquier médico autenticado)
-- + mis propias solicitudes (como autor o como quien cubre) para "Mis
-- Solicitudes" e "Historial".
create policy "cobertura_solicitudes_select" on cobertura_solicitudes
  for select using (
    estado = 'abierta' or autor_id = auth.uid() or medico_cobertura_id = auth.uid()
  );

-- Insert: exige autor_id = auth.uid() y, como defensa en profundidad (mismo
-- espíritu que D-541/D-537 — el backend no depende solo de que la ruta ya
-- esté restringida a médicos), que el perfil que inserta sea rol='medico'.
create policy "cobertura_solicitudes_insert_medico" on cobertura_solicitudes
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'medico')
  );

-- Update: permite tanto "ofrecerse a cubrir" (cualquier médico sobre una fila
-- 'abierta', ver ofrecerCobertura en lib/coberturaServicio.js — el cliente
-- manda UPDATE ... WHERE estado='abierta', atómico: gana quien primero
-- llega) como que el autor cancele su propia solicitud. El with check evita
-- que alguien se asigne medico_cobertura_id a nombre de otra persona.
create policy "cobertura_solicitudes_update" on cobertura_solicitudes
  for update using (
    estado = 'abierta' or autor_id = auth.uid() or medico_cobertura_id = auth.uid()
  )
  with check (
    autor_id = auth.uid() or medico_cobertura_id = auth.uid()
  );

-- ============================================================================
-- cobertura_mensajes (el chat — excepción documentada arriba)
-- ============================================================================
create table if not exists cobertura_mensajes (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references cobertura_solicitudes (id) on delete cascade,
  remitente_id uuid not null references perfiles (id) on delete cascade,
  mensaje text,
  archivo_path text,
  archivo_tipo text,
  archivo_nombre text,
  created_at timestamptz not null default now(),
  constraint cobertura_mensajes_contenido check (mensaje is not null or archivo_path is not null)
);

create index if not exists cobertura_mensajes_solicitud_idx on cobertura_mensajes (solicitud_id);

alter table cobertura_mensajes enable row level security;

-- Select/insert solo para los dos participantes de la solicitud. Insert
-- además exige que el servicio esté 'cubierta' (chat activo solo mientras
-- dura el servicio, tal como se pidió) — una vez 'finalizada' ya no admite
-- mensajes nuevos, y de todas formas cobertura_finalizar_servicio borra los
-- existentes.
create policy "cobertura_mensajes_select_participantes" on cobertura_mensajes
  for select using (
    exists (
      select 1 from cobertura_solicitudes s
      where s.id = cobertura_mensajes.solicitud_id
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );

create policy "cobertura_mensajes_insert_participantes" on cobertura_mensajes
  for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and exists (
      select 1 from cobertura_solicitudes s
      where s.id = solicitud_id
        and s.estado = 'cubierta'
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );

-- Sin policy de update/delete para el cliente: el borrado del chat al
-- finalizar es responsabilidad exclusiva del RPC de abajo (security
-- definer), no algo que el cliente pueda hacer por su cuenta.

-- ============================================================================
-- RPC: ofrecerse a cubrir (evita condición de carrera de forma explícita
-- además del UPDATE...WHERE atómico del cliente — devuelve la fila si ganó,
-- null si ya estaba cubierta)
-- ============================================================================
create or replace function cobertura_ofrecerse(p_solicitud_id uuid)
returns cobertura_solicitudes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila cobertura_solicitudes;
begin
  update cobertura_solicitudes
  set medico_cobertura_id = auth.uid(), estado = 'cubierta', cubierta_at = now()
  where id = p_solicitud_id and estado = 'abierta' and autor_id != auth.uid()
  returning * into v_fila;

  return v_fila;
end;
$$;

-- ============================================================================
-- RPC: finalizar servicio — cierra la solicitud y borra los mensajes del
-- chat. "Sin historial del chat" es retención real, no solo un filtro de UI.
--
-- Los ARCHIVOS adjuntos en Storage NO se borran acá: Supabase bloquea el
-- DELETE directo sobre storage.objects vía SQL, incluso desde una función
-- security definer ("Direct deletion from storage tables is not allowed. Use
-- the Storage API instead." — confirmado contra el proyecto real). Por eso
-- finalizarServicio en lib/coberturaServicio.js borra primero los archivos
-- vía supabase.storage.from('cobertura-chat').remove(...) (Storage API real,
-- la única forma soportada) MIENTRAS estado sigue en 'cubierta', y solo
-- después llama a este RPC para borrar las filas de cobertura_mensajes y
-- cerrar la solicitud. Ver la policy de delete de storage.objects más abajo.
-- ============================================================================
create or replace function cobertura_finalizar_servicio(p_solicitud_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_participante boolean;
begin
  select exists (
    select 1 from cobertura_solicitudes
    where id = p_solicitud_id
      and (autor_id = auth.uid() or medico_cobertura_id = auth.uid())
      and estado = 'cubierta'
  ) into v_es_participante;

  if not v_es_participante then
    raise exception 'No autorizado o el servicio no está en curso.';
  end if;

  delete from cobertura_mensajes where solicitud_id = p_solicitud_id;

  update cobertura_solicitudes
  set estado = 'finalizada', finalizada_at = now()
  where id = p_solicitud_id;
end;
$$;

-- ============================================================================
-- Storage: bucket 'cobertura-chat' (privado). El fundador debe crearlo
-- manualmente en el Dashboard de Supabase (Storage → New bucket → nombre
-- exacto "cobertura-chat", "Public bucket" DESACTIVADO) — mismo
-- procedimiento que el bucket 'documents' (ver 0003_storage_documents.sql).
-- Esta migración solo agrega las policies; sin el bucket creado, las
-- policies no tienen efecto.
--
-- Convención de ruta: `${solicitud_id}/${uid}-${timestamp}.${ext}` — el
-- primer segmento es la solicitud (no el usuario, a diferencia de
-- 'documents'), porque el archivo lo deben poder leer los DOS participantes
-- del chat, no solo quien lo subió.
-- ============================================================================
create policy "cobertura_chat_select_participantes" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cobertura-chat'
    and exists (
      select 1 from cobertura_solicitudes s
      where s.id::text = (storage.foldername(name))[1]
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );

create policy "cobertura_chat_insert_participantes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cobertura-chat'
    and exists (
      select 1 from cobertura_solicitudes s
      where s.id::text = (storage.foldername(name))[1]
        and s.estado = 'cubierta'
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );

-- Delete: usada por finalizarServicio (lib/coberturaServicio.js) para borrar
-- los adjuntos vía la Storage API real ANTES de llamar al RPC que cierra la
-- solicitud — por eso exige estado='cubierta', igual que el insert.
create policy "cobertura_chat_delete_participantes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cobertura-chat'
    and exists (
      select 1 from cobertura_solicitudes s
      where s.id::text = (storage.foldername(name))[1]
        and s.estado = 'cubierta'
        and (s.autor_id = auth.uid() or s.medico_cobertura_id = auth.uid())
    )
  );

-- ============================================================================
-- Realtime: crear la tabla NO la agrega sola a la publicación de Supabase
-- (a diferencia de lo que uno esperaría) — sin esto, subscribeMensajesChat y
-- subscribeSolicitud (lib/coberturaServicio.js) nunca reciben eventos, ni
-- siquiera el propio emisor del mensaje. Mismo patrón que ya usan
-- relevo_mensajes/solicitudes (ver pg_publication_tables).
-- ============================================================================
alter publication supabase_realtime add table cobertura_solicitudes;
alter publication supabase_realtime add table cobertura_mensajes;
