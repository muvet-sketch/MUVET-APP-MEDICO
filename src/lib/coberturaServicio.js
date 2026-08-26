import { supabase } from './supabase';

// MUVET Relevo (N-30) — médico↔médico. El módulo y sus tablas conservan el
// nombre viejo, `cobertura`; el que se llama `relevo` en el código es MUVET
// Turnos (N-26). Ver el bloque de lib/nombresModulos.js.
// Un médico que no puede atender un servicio ya agendado
// publica una solicitud con los detalles; otro médico puede ofrecerse a
// cubrirlo. Al ofrecerse, ambos acceden a un chat en tiempo real (con
// archivos/imágenes) activo solo mientras dura el servicio. Esquema, RLS y
// los dos RPC (cobertura_ofrecerse, cobertura_finalizar_servicio) viven en
// supabase/migrations/0023_cobertura_servicio.sql.
//
// EXCEPCIÓN EXPLÍCITA A D-540 / "no incluir chat en tiempo real" (CLAUDE.md):
// confirmada con el fundador, acotada a este módulo — ver el encabezado de
// 0023 para el detalle. D-540 sigue intacto para Relevo (lib/relevo.js).
//
// SUPUESTO: no se exige perfiles.estado_validacion = 'validado' para publicar
// u ofrecerse (no fue especificado en el pedido). Si el fundador quiere
// restringirlo a médicos ya validados, agregar el chequeo acá y en la policy
// de insert de 0023.

export const TIPOS_SERVICIO_COBERTURA = [
  'Consulta general',
  'Vacunación',
  'Desparasitación',
  'Curación / procedimiento menor',
  'Control post-quirúrgico',
  'Toma de muestras',
  'Aplicación de medicamentos',
  'Eutanasia',
  'Otro',
];

export const ESPECIES_COBERTURA = ['Canino', 'Felino', 'Otro'];

export const TEMPERAMENTOS_COBERTURA = ['Tranquilo', 'Nervioso', 'Agresivo', 'Desconocido'];

async function adjuntarPerfil(filas, campoId, campoSalida) {
  const ids = Array.from(new Set(filas.map((f) => f[campoId]).filter(Boolean)));
  if (ids.length === 0) return filas.map((f) => ({ ...f, [campoSalida]: null }));

  // `perfiles_publico` (0014): única vista legible por cualquier autenticado
  // sin exponer datos sensibles (teléfono, matrícula) — mismo patrón que
  // adjuntarAutores en lib/relevo.js.
  const { data, error } = await supabase.from('perfiles_publico').select('id, nombre_completo').in('id', ids);
  if (error) throw error;

  const porId = new Map((data ?? []).map((p) => [p.id, p]));
  return filas.map((f) => ({ ...f, [campoSalida]: porId.get(f[campoId]) ?? null }));
}

export async function crearSolicitud({
  autorId,
  tipoServicio,
  zona,
  especie,
  raza,
  temperamento,
  descripcion,
  fechaServicio,
  horaServicio,
}) {
  const { data, error } = await supabase
    .from('cobertura_solicitudes')
    .insert({
      autor_id: autorId,
      tipo_servicio: tipoServicio,
      zona: zona || null,
      especie: especie || null,
      raza: raza || null,
      temperamento: temperamento || null,
      descripcion: descripcion || null,
      fecha_servicio: fechaServicio,
      hora_servicio: horaServicio || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// "Disponibles": solicitudes abiertas de OTROS médicos (RLS ya limita select
// a estado='abierta' o participante propio; el filtro de autor_id acá evita
// que un médico se vea a sí mismo en su propio tablón de disponibles).
export async function fetchSolicitudesAbiertas(autorId) {
  const { data, error } = await supabase
    .from('cobertura_solicitudes')
    .select('*')
    .eq('estado', 'abierta')
    .neq('autor_id', autorId)
    .order('fecha_servicio', { ascending: true });
  if (error) throw error;
  return adjuntarPerfil(data ?? [], 'autor_id', 'autor');
}

// "Mis Solicitudes": las que publiqué o las que estoy cubriendo, mientras
// sigan activas (abierta/cubierta) — las terminales van al historial.
export async function fetchMisSolicitudesActivas(perfilId) {
  const { data, error } = await supabase
    .from('cobertura_solicitudes')
    .select('*')
    .in('estado', ['abierta', 'cubierta'])
    .or(`autor_id.eq.${perfilId},medico_cobertura_id.eq.${perfilId}`)
    .order('fecha_servicio', { ascending: true });
  if (error) throw error;

  const conAutor = await adjuntarPerfil(data ?? [], 'autor_id', 'autor');
  return adjuntarPerfil(conAutor, 'medico_cobertura_id', 'cobertura');
}

// Historial: solicitudes terminales (finalizada/cancelada) donde participé,
// como autor o como cobertura. Sin ningún dato del chat (ya se borró en
// cobertura_finalizar_servicio).
export async function fetchHistorial(perfilId) {
  const { data, error } = await supabase
    .from('cobertura_solicitudes')
    .select('*')
    .in('estado', ['finalizada', 'cancelada'])
    .or(`autor_id.eq.${perfilId},medico_cobertura_id.eq.${perfilId}`)
    .order('finalizada_at', { ascending: false, nullsFirst: false });
  if (error) throw error;

  const conAutor = await adjuntarPerfil(data ?? [], 'autor_id', 'autor');
  return adjuntarPerfil(conAutor, 'medico_cobertura_id', 'cobertura');
}

// Ofrecerse a cubrir: vía RPC (security definer, ver 0023) para que el
// chequeo "estado='abierta' y no soy el autor" quede resuelto en un único
// UPDATE atómico en el servidor — evita la condición de carrera de dos
// médicos ofreciéndose al mismo tiempo (gana quien primero llega; el
// segundo recibe null y debe refrescar el listado).
export async function ofrecerCobertura(solicitudId) {
  const { data, error } = await supabase.rpc('cobertura_ofrecerse', { p_solicitud_id: solicitudId });
  if (error) throw error;
  if (!data) {
    throw new Error('Esta solicitud ya fue cubierta por otro médico. Actualiza el listado.');
  }
  return data;
}

export async function cancelarSolicitud(id, autorId) {
  const { error } = await supabase
    .from('cobertura_solicitudes')
    .update({ estado: 'cancelada' })
    .eq('id', id)
    .eq('autor_id', autorId)
    .eq('estado', 'abierta');
  if (error) throw error;
}

// Finalizar el servicio: borra primero los archivos adjuntos vía la Storage
// API real (Supabase no permite DELETE directo por SQL sobre storage.objects,
// ni siquiera desde una función security definer — ver 0023) mientras la
// solicitud sigue 'cubierta', y luego llama al RPC que borra los mensajes y
// cierra la solicitud. "Sin historial del chat" es un borrado real, no un
// filtro de UI.
export async function finalizarServicio(solicitudId) {
  const mensajes = await fetchMensajesChat(solicitudId);
  const paths = mensajes.map((m) => m.archivo_path).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('cobertura-chat').remove(paths);
    if (storageError) throw storageError;
  }

  const { error } = await supabase.rpc('cobertura_finalizar_servicio', { p_solicitud_id: solicitudId });
  if (error) throw error;
}

export async function fetchSolicitud(id) {
  const { data, error } = await supabase.from('cobertura_solicitudes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [conAutor] = await adjuntarPerfil([data], 'autor_id', 'autor');
  const [conAmbos] = await adjuntarPerfil([conAutor], 'medico_cobertura_id', 'cobertura');
  return conAmbos;
}

export async function fetchMensajesChat(solicitudId) {
  const { data, error } = await supabase
    .from('cobertura_mensajes')
    .select('*')
    .eq('solicitud_id', solicitudId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Sube el adjunto al bucket privado 'cobertura-chat' (el fundador debe
// crearlo manualmente en el Dashboard — ver 0023) bajo
// `${solicitudId}/${uid}-${timestamp}.${ext}`, y devuelve el path para
// guardarlo en la fila del mensaje (nunca la URL pública: el bucket es
// privado, se resuelve a signed URL en el momento de mostrarlo).
async function subirArchivoChat(solicitudId, remitenteId, file) {
  const ext = file.name.split('.').pop();
  const path = `${solicitudId}/${remitenteId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('cobertura-chat').upload(path, file);
  if (error) throw error;
  return path;
}

export async function getSignedChatFileUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('cobertura-chat').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function enviarMensajeChat({ solicitudId, remitenteId, mensaje, archivo }) {
  let archivoPath = null;
  if (archivo) {
    archivoPath = await subirArchivoChat(solicitudId, remitenteId, archivo);
  }

  const { data, error } = await supabase
    .from('cobertura_mensajes')
    .insert({
      solicitud_id: solicitudId,
      remitente_id: remitenteId,
      mensaje: mensaje || null,
      archivo_path: archivoPath,
      archivo_tipo: archivo?.type || null,
      archivo_nombre: archivo?.name || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Realtime del chat mientras la pantalla está abierta — mismo patrón que
// subscribeNotificaciones en lib/notificaciones.js, filtrando por
// solicitud_id (columna simple, sí se puede filtrar directo en
// postgres_changes).
export function subscribeMensajesChat(solicitudId, onNuevoMensaje) {
  const channel = supabase
    .channel(`cobertura-chat-${solicitudId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'cobertura_mensajes', filter: `solicitud_id=eq.${solicitudId}` },
      (payload) => onNuevoMensaje(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Realtime de la propia solicitud (para que quien espera vea en vivo cuando
// alguien se ofrece, o para que ambos vean si el otro finaliza estando en el
// chat).
export function subscribeSolicitud(solicitudId, onCambio) {
  const channel = supabase
    .channel(`cobertura-solicitud-${solicitudId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'cobertura_solicitudes', filter: `id=eq.${solicitudId}` },
      (payload) => onCambio(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function formatFechaHoraServicio(solicitud) {
  if (!solicitud?.fecha_servicio) return '';
  const fecha = new Date(`${solicitud.fecha_servicio}T00:00:00`);
  const fechaFmt = Number.isNaN(fecha.getTime())
    ? solicitud.fecha_servicio
    : fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  const hora = solicitud.hora_servicio ? solicitud.hora_servicio.slice(0, 5) : '';
  return hora ? `${fechaFmt} · ${hora}` : fechaFmt;
}
