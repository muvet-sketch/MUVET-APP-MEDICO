import { supabase } from './supabase';

// MUVET Relevo (N-30) — médico↔médico. El módulo y sus tablas conservan el
// nombre viejo, `cobertura`; el que se llama `relevo` en el código es MUVET
// Turnos (N-26). Ver el bloque de lib/nombresModulos.js.
// Un médico que no puede atender un servicio ya agendado publica una solicitud
// con los detalles; otro médico puede ofrecerse a relevarlo. Al ofrecerse, ambos
// acceden a un chat en tiempo real (con archivos/imágenes). Esquema y RLS
// originales en supabase/migrations/0023_cobertura_servicio.sql; el ciclo de
// vida vigente lo fija 0034 (ver el bloque de abajo).
//
// EXCEPCIÓN EXPLÍCITA A D-540 / "no incluir chat en tiempo real" (CLAUDE.md):
// confirmada con el fundador, acotada a este módulo — ver el encabezado de
// 0023 para el detalle. D-540 sigue intacto para Relevo (lib/relevo.js).
//
// ----------------------------------------------------------------------------
// Migración 0034 — tres cambios que reescriben el ciclo de vida del módulo
// ----------------------------------------------------------------------------
//   1. ACUERDO MUTUO. Ofrecerse ya no cierra el trato: abre una negociación
//      ('propuesta') y el servicio queda tomado ('cubierta') solo cuando LAS
//      DOS partes marcan su acuerdo. Igual que Turnos (0027) y Auxiliar (0028).
//      Descartar la propuesta NO es terminal acá: la solicitud vuelve al
//      tablón, porque tiene un solo cupo y no hay tabla de conversaciones.
//   2. CHAT 24 h DESPUÉS DE FINALIZAR. Antes se borraba en el acto; ahora sigue
//      abierto —lectura y escritura— 24 horas, y recién entonces se cierra y se
//      purga. La frontera es la RLS (`cobertura_chat_abierto`); `chatAbierto`
//      de acá abajo es solo su espejo para la UI.
//   3. SIN CONTROL DE PAGOS. En este módulo el médico que releva le cobra
//      directo al tutor, así que no hay pago entre las partes: los RPC
//      `cobertura_pago_*` se retiraron y `lib/pagos.js` ya no conoce 'cobertura'.
//
// Todas las transiciones pasan por RPC: 0034 le quitó al cliente la policy de
// update sobre `cobertura_solicitudes`.
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

// Lo que sigue vivo y por tanto no es historial. 'propuesta' entra con 0034.
export const ESTADOS_ACTIVOS_COBERTURA = ['abierta', 'propuesta', 'cubierta'];

// ¿Sigo pudiendo escribir en el chat? Espejo EXACTO de la función
// `cobertura_chat_abierto` de 0034 §5, que es la que manda: acá solo evita
// pintar un composer que el backend va a rechazar.
export function chatAbierto(solicitud) {
  if (!solicitud) return false;
  if (solicitud.estado === 'propuesta' || solicitud.estado === 'cubierta') return true;
  if (solicitud.estado !== 'finalizada' || !solicitud.chat_cierra_at) return false;
  return Date.now() < new Date(solicitud.chat_cierra_at).getTime();
}

// Minutos que le quedan a la ventana de 24 h, para el aviso del chat. Negativo
// o cero = vencida.
export function minutosRestantesChat(solicitud) {
  if (solicitud?.estado !== 'finalizada' || !solicitud.chat_cierra_at) return null;
  return Math.ceil((new Date(solicitud.chat_cierra_at).getTime() - Date.now()) / 60000);
}

export function textoVentanaChat(solicitud) {
  const minutos = minutosRestantesChat(solicitud);
  if (minutos == null) return '';
  if (minutos <= 0) return 'El chat de este servicio ya se cerró.';
  if (minutos < 60) return `El chat se cierra en ${minutos} min.`;
  return `El chat se cierra en ${Math.floor(minutos / 60)} h.`;
}

// Mi bandera de acuerdo y la de la otra parte, según de qué lado estoy.
export function acuerdosCobertura(solicitud, perfilId) {
  const soyAutor = solicitud?.autor_id === perfilId;
  return {
    soyAutor,
    miAcuerdo: Boolean(soyAutor ? solicitud?.acuerdo_autor : solicitud?.acuerdo_cobertura),
    suAcuerdo: Boolean(soyAutor ? solicitud?.acuerdo_cobertura : solicitud?.acuerdo_autor),
  };
}

// Mismo criterio de zona que filtrarPublicacionesPorZona (lib/relevo.js) y
// filtrarPorZona (lib/apoyo.js): `zona_cobertura` del perfil es texto con zonas
// separadas por coma y basta con que la solicitud mencione cualquiera de las
// mías. Sin zona configurada no se filtra nada.
export function filtrarSolicitudesPorZona(solicitudes, zonaCobertura) {
  const zonas = (zonaCobertura ?? '')
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);
  if (zonas.length === 0) return solicitudes;
  return solicitudes.filter((s) => {
    const zona = (s.zona ?? '').toLowerCase();
    return zonas.some((z) => zona.includes(z.toLowerCase()));
  });
}

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
// sigan activas (abierta/propuesta/cubierta) — las terminales van al historial.
export async function fetchMisSolicitudesActivas(perfilId) {
  const { data, error } = await supabase
    .from('cobertura_solicitudes')
    .select('*')
    .in('estado', ESTADOS_ACTIVOS_COBERTURA)
    .or(`autor_id.eq.${perfilId},medico_cobertura_id.eq.${perfilId}`)
    .order('fecha_servicio', { ascending: true });
  if (error) throw error;

  const conAutor = await adjuntarPerfil(data ?? [], 'autor_id', 'autor');
  return adjuntarPerfil(conAutor, 'medico_cobertura_id', 'cobertura');
}

// Historial: solicitudes terminales (finalizada/cancelada) donde participé,
// como autor o como quien relevó. No trae mensajes: el chat de una finalizada
// vive 24 h más en su propia pantalla y después se purga (0034).
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

// Ofrecerse a cubrir: vía RPC (security definer, ver 0023/0034) para que el
// chequeo "estado='abierta' y no soy el autor" quede resuelto en un único
// UPDATE atómico en el servidor — evita la condición de carrera de dos
// médicos ofreciéndose al mismo tiempo (gana quien primero llega; el
// segundo recibe null y debe refrescar el listado).
//
// 0034: esto ya NO cierra el trato. Deja la solicitud en 'propuesta', abre el
// chat y espera el acuerdo de las dos partes (`acordarCobertura`).
export async function ofrecerCobertura(solicitudId) {
  const { data, error } = await supabase.rpc('cobertura_ofrecerse', { p_solicitud_id: solicitudId });
  if (error) throw error;
  if (!data) {
    throw new Error('Otro médico se te adelantó con esta solicitud. Actualiza el listado.');
  }
  return data;
}

// "Estoy de acuerdo" (0034). Cada lado marca solo SU bandera; el paso a
// 'cubierta' lo deriva el RPC de las dos. Un acuerdo dado no se retira: si
// cambiaste de idea, `descartarPropuesta`.
export async function acordarCobertura(solicitudId) {
  const { data, error } = await supabase.rpc('cobertura_acordar', { p_solicitud_id: solicitudId });
  if (error) throw error;
  return data;
}

// Deshacer la propuesta (0034). La puede tomar cualquiera de los dos y NO es
// terminal: la solicitud vuelve al tablón para que otro médico se ofrezca.
//
// El RPC borra los mensajes de esa negociación y devuelve los paths de sus
// adjuntos; los archivos hay que quitarlos acá porque Supabase no admite
// DELETE por SQL sobre storage.objects (ver la cabecera de 0023). Que falle el
// borrado en Storage no revierte nada: las filas ya no existen y los objetos
// quedan huérfanos e ilegibles, así que no se propaga el error.
export async function descartarPropuesta(solicitudId) {
  const { data, error } = await supabase.rpc('cobertura_descartar_propuesta', {
    p_solicitud_id: solicitudId,
  });
  if (error) throw error;
  await borrarAdjuntos(data);
}

export async function cancelarSolicitud(id) {
  const { error } = await supabase.rpc('cobertura_cancelar', { p_solicitud_id: id });
  if (error) throw error;
}

// Finalizar el servicio (0034). Ya no borra nada: sella el cierre y abre la
// ventana de 24 h durante la cual el chat sigue admitiendo mensajes. El
// borrado ocurre después, en `purgarChatsVencidos`.
export async function finalizarServicio(solicitudId) {
  const { error } = await supabase.rpc('cobertura_finalizar_servicio', { p_solicitud_id: solicitudId });
  if (error) throw error;
}

// Purga perezosa de los chats cuya ventana de 24 h ya venció (0034 §4.6).
// Best-effort, igual que `expirarSolicitudesVencidas` en lib/solicitudes.js: la
// llaman las pantallas del módulo al abrirse, y que nadie la llame NO reabre
// ningún chat — la ventana la cierra la RLS.
export async function purgarChatsVencidos() {
  const { data, error } = await supabase.rpc('cobertura_purgar_chats_vencidos');
  if (error) throw error;
  await borrarAdjuntos(data);
}

// El RPC devuelve `setof text`, que llega como array de strings o como array de
// objetos de una sola columna según la versión de PostgREST; se aceptan las dos.
async function borrarAdjuntos(filas) {
  const paths = (filas ?? [])
    .map((f) => (typeof f === 'string' ? f : f?.cobertura_purgar_chats_vencidos ?? f?.cobertura_descartar_propuesta))
    .filter(Boolean);
  if (paths.length === 0) return;
  await supabase.storage.from('cobertura-chat').remove(paths);
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

// ============================================================================
// Punto de encuentro (tabla lateral, D-064) — migración 0032
// ============================================================================
// Lo escribe el AUTOR de la solicitud (el médico que pasa el servicio: es quien
// sabe dónde es) y el que cubre solo lo lee una vez tomó el servicio. El
// control es de backend: la policy de select de `cobertura_direccion` devuelve
// cero filas antes de 'cubierta', así que acá no hay ningún chequeo de estado —
// si no se puede ver, llega null. Mismo criterio que `apoyo_direccion` (0028).
//
// A diferencia del chat, esto SOBREVIVE a la finalización: el servicio se
// prestó en algún lado y ese dato sigue en el historial (N-9) cuando los
// mensajes ya se borraron.

export async function fetchDireccionCobertura(solicitudId) {
  const { data, error } = await supabase
    .from('cobertura_direccion')
    .select('*')
    .eq('solicitud_id', solicitudId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function guardarDireccionCobertura({ solicitudId, direccion, referencia, linkMaps }) {
  const texto = (direccion ?? '').trim();
  if (!texto) throw new Error('Escribe la dirección del punto de encuentro.');

  const { data, error } = await supabase
    .from('cobertura_direccion')
    .upsert(
      {
        solicitud_id: solicitudId,
        direccion_encuentro: texto,
        referencia: referencia?.trim() || null,
        link_maps: linkMaps?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'solicitud_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
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
