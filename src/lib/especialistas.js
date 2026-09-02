import { supabase } from './supabase';
import { subscribeInserts, subscribeRow } from './chatRealtime';
import { filtrarPorZonaCobertura, zonaCoincide } from './municipios';
import { esVisibleEnDirectorio } from './especialidades';

// N-35 · MUVET Especialistas — capa de acceso a datos.
// Esquema, RLS, triggers y RPC en
// supabase/migrations/0039_especialistas_directorio_y_tablon.sql.
//
// ⚠️ NOMBRES: este es el ÚNICO de los cuatro módulos gremiales cuyo
// identificador interno coincide con su nombre visible. Ruta /especialistas,
// tablas especialista_*, notificaciones especialista_*, y en la UI "MUVET
// Especialistas". Los otros tres no coinciden — ver lib/nombresModulos.js
// antes de tocar cualquier cosa de ellos.
//
// Dos mitades, una sola negociación:
//
//   DIRECTORIO (mitad A) — todo médico con matrícula validada y al menos una
//     especialidad aparece solo, sin activar nada. Lo consultan médicos y
//     clínicas contra la vista `especialistas_directorio`, que atraviesa la RLS
//     de `perfiles` exponiendo a mano lo que se puede mostrar.
//
//   TABLÓN (mitad B) — auxiliares y médicos-especialistas publican ofertas;
//     solo los médicos-especialistas responden. Es el lado inverso: el
//     especialista también busca trabajo.
//
// Las dos desembocan en `especialista_conversaciones`, discriminadas por
// `origen`. De ahí que casi todas las funciones de conversación sirvan a las
// dos sin ramificar.
//
// Diferencias deliberadas con los otros módulos:
//   · NUNCA se muestra un teléfono, ni siquiera tras el acuerdo. Toda la
//     comunicación va por el chat, que por eso sobrevive al acuerdo y se cierra
//     al finalizar (igual que Turnos post-0028 y Auxiliar).
//   · El chat lleva ADJUNTOS (bucket privado `especialista-chat`) y el
//     historial NO se borra nunca.
//   · Sin control de pagos: el especialista le cobra directo a quien lo
//     contrata, así que no hay pago entre las partes que marcar (mismo caso que
//     MUVET Relevo desde 0034).

// ============================================================================
// Perfiles públicos
// ============================================================================

// `perfiles` solo deja leer la fila propia (0001), así que el embed automático
// de PostgREST devuelve null para cualquier otro usuario. Se resuelve en dos
// pasos contra `perfiles_publico` (0014/0035) y se mezcla en cliente — mismo
// patrón que adjuntarAutores en lib/relevo.js.
async function adjuntarPerfiles(filas, campoId, campoSalida) {
  const ids = Array.from(new Set(filas.map((f) => f[campoId]).filter(Boolean)));
  if (ids.length === 0) return filas.map((f) => ({ ...f, [campoSalida]: null }));

  const { data, error } = await supabase
    .from('perfiles_publico')
    .select('id, rol, nombre_completo, razon_social, foto_url')
    .in('id', ids);
  if (error) throw error;

  const porId = new Map((data ?? []).map((p) => [p.id, p]));
  return filas.map((f) => ({ ...f, [campoSalida]: porId.get(f[campoId]) ?? null }));
}

// ============================================================================
// Quién puede qué
// ============================================================================
// Espejos EN CLIENTE de las policies de 0039 §6. Sirven para decidir qué
// pestañas y botones mostrar; autorizar lo hace la RLS.

// El directorio lo consultan médicos y clínicas. El auxiliar no: participa solo
// en el tablón. (Lo cierra además el WHERE de la propia vista.)
export function puedeVerDirectorio(rol) {
  return rol === 'medico' || rol === 'clinica';
}

// Publican en el tablón: auxiliares y médicos-especialistas.
export function puedePublicarTablon(perfil) {
  return perfil?.rol === 'auxiliar' || esVisibleEnDirectorio(perfil);
}

// Responden ofertas del tablón: SOLO médicos-especialistas. El tablón existe
// para que el especialista ENCUENTRE trabajo, no para que los auxiliares se
// contraten entre sí (eso ya es MUVET Auxiliar).
export function puedeResponderTablon(perfil) {
  return esVisibleEnDirectorio(perfil);
}

export function participaEnEspecialistas(perfil) {
  return puedeVerDirectorio(perfil?.rol) || puedePublicarTablon(perfil);
}

// ============================================================================
// Directorio (mitad A)
// ============================================================================

// La vista ya filtra por matrícula validada + ≥1 especialidad + rol de quien
// consulta. Acá solo se agregan los filtros de búsqueda.
//
// `zona` se filtra en cliente, como en los otros tres módulos: el criterio real
// (áreas metropolitanas, acentos, ciudades sin declarar) vive en
// lib/municipios.js y no se puede expresar en un `.eq()`.
//
// No se usa `filtrarPorZonaCobertura` porque esa función mira la columna
// `zona` de cada fila, y acá la que hay es `zona_cobertura` (es un PERFIL, no
// una publicación). El criterio de coincidencia sí es el mismo.
export async function fetchDirectorioEspecialistas({ especialidad, zona, q, excluirId } = {}) {
  let query = supabase
    .from('especialistas_directorio')
    .select('*')
    .order('nombre_completo', { ascending: true });

  if (especialidad) query = query.contains('especialidades', [especialidad]);
  if (q?.trim()) query = query.ilike('nombre_completo', `%${q.trim()}%`);
  if (excluirId) query = query.neq('id', excluirId);

  const { data, error } = await query;
  if (error) throw error;

  const filas = data ?? [];
  if (!zona) return filas;
  return filas.filter((f) => zonaCoincide(f.zona_cobertura, [zona]));
}

export async function fetchEspecialistaDirectorio(perfilId) {
  const { data, error } = await supabase
    .from('especialistas_directorio')
    .select('*')
    .eq('id', perfilId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ============================================================================
// Tablón de ofertas (mitad B)
// ============================================================================

export const TIPOS_OFERTA = [
  { value: 'ofrezco', label: 'Ofrezco', ayuda: 'Tengo disponibilidad para prestar este servicio.' },
  { value: 'busco', label: 'Busco', ayuda: 'Necesito a alguien que preste este servicio.' },
];

export function labelTipoOferta(value) {
  return TIPOS_OFERTA.find((t) => t.value === value)?.label ?? '';
}

// `autor_rol` lo escribe el trigger de alta desde `perfiles.rol`; se manda
// igual para que el insert no dependa del default de una columna NOT NULL.
export async function crearOfertaEspecialista({
  autorId,
  autorRol,
  tipo,
  especialidad,
  descripcion,
  zona,
  fecha,
  horaInicio,
  horaFin,
  tarifa,
}) {
  if (!TIPOS_OFERTA.some((t) => t.value === tipo)) {
    throw new Error('Indica si ofreces o buscas el servicio.');
  }

  const { data, error } = await supabase
    .from('especialista_ofertas')
    .insert({
      autor_id: autorId,
      autor_rol: autorRol,
      tipo,
      especialidad: especialidad || null,
      descripcion: descripcion || null,
      zona: zona || null,
      fecha: fecha || null,
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      tarifa: tarifa || tarifa === 0 ? tarifa : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// `tipo` no se edita: define de qué lado está la oferta y ya hay
// conversaciones colgando de ella.
export async function actualizarOfertaEspecialista(
  id,
  autorId,
  { especialidad, descripcion, zona, fecha, horaInicio, horaFin, tarifa },
) {
  const { data, error } = await supabase
    .from('especialista_ofertas')
    .update({
      especialidad: especialidad || null,
      descripcion: descripcion || null,
      zona: zona || null,
      fecha: fecha || null,
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      tarifa: tarifa || tarifa === 0 ? tarifa : null,
    })
    .eq('id', id)
    .eq('autor_id', autorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function activarOfertaEspecialista(id, autorId) {
  const { error } = await supabase
    .from('especialista_ofertas')
    .update({ activa: true })
    .eq('id', id)
    .eq('autor_id', autorId)
    .eq('estado', 'abierta');
  if (error) throw error;
}

export async function desactivarOfertaEspecialista(id, autorId) {
  const { error } = await supabase
    .from('especialista_ofertas')
    .update({ activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Terminal: el trigger de 0039 §4.2 impide reabrirla, y el de §4.7 descarta las
// conversaciones que sigan abiertas (las ya acordadas quedan intactas).
export async function cancelarOfertaEspecialista(id, autorId) {
  const { error } = await supabase
    .from('especialista_ofertas')
    .update({ estado: 'cancelada', activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// El tablón. A diferencia de los otros módulos NO se filtra por `tipo` según el
// rol de quien mira: acá los dos tipos le sirven al especialista (una oferta
// 'busco' de un auxiliar es trabajo para él, y una 'ofrezco' de otro
// especialista es un colega con quien colaborar). El filtro por tipo es una
// preferencia de la UI, no una regla.
export async function fetchOfertasEspecialista({ tipo, zona, excluirAutorId } = {}) {
  let query = supabase
    .from('especialista_ofertas')
    .select('*')
    .eq('activa', true)
    .eq('estado', 'abierta')
    .order('created_at', { ascending: false });

  if (tipo) query = query.eq('tipo', tipo);
  if (excluirAutorId) query = query.neq('autor_id', excluirAutorId);

  const { data, error } = await query;
  if (error) throw error;

  const conAutor = await adjuntarPerfiles(data ?? [], 'autor_id', 'autor');
  return zona ? filtrarPorZonaCobertura(conAutor, zona) : conAutor;
}

export async function fetchMisOfertasEspecialista(autorId) {
  const { data, error } = await supabase
    .from('especialista_ofertas')
    .select('*')
    .eq('autor_id', autorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Conversaciones (las dos mitades)
// ============================================================================

export function esParteAutora(conversacion, perfilId) {
  return conversacion?.autor_id === perfilId;
}

export const ESTADOS_ABIERTOS_ESPECIALISTA = ['abierta', 'aceptada'];

export function chatAbierto(conversacion) {
  return ESTADOS_ABIERTOS_ESPECIALISTA.includes(conversacion?.estado);
}

// Insert + primer mensaje, idempotente contra los dos índices únicos parciales
// de 0039 §3.2: se puede llegar acá desde dos pestañas o desde una tarjeta
// desactualizada. Mismo patrón que iniciarConversacion en lib/relevo.js.
async function iniciarConversacion({ fila, filtroExistente, interesadoId, mensaje }) {
  const texto = (mensaje ?? '').trim();
  if (!texto) throw new Error('Escribe un mensaje para iniciar la conversación.');

  const { data: creada, error } = await supabase
    .from('especialista_conversaciones')
    .insert(fila)
    .select()
    .single();

  let conversacion = creada;
  if (error) {
    // 23505 = unique_violation: ya existe esta conversación.
    if (error.code !== '23505') throw error;
    let query = supabase.from('especialista_conversaciones').select('*').eq('interesado_id', interesadoId);
    Object.entries(filtroExistente).forEach(([col, val]) => {
      query = query.eq(col, val);
    });
    const { data: existente, error: errorExistente } = await query.single();
    if (errorExistente) throw errorExistente;
    conversacion = existente;
  }

  await enviarMensajeEspecialista({ conversacionId: conversacion.id, remitenteId: interesadoId, mensaje: texto });
  return conversacion;
}

// "Contactar" desde la ficha del directorio. El especialista contactado queda
// del lado `autor` (lo resuelve el trigger de alta) aunque no haya publicado
// nada: es quien ofrece el servicio.
export async function iniciarConversacionDirectorio({ especialistaId, interesadoId, mensaje }) {
  return iniciarConversacion({
    fila: {
      origen: 'directorio',
      especialista_id: especialistaId,
      interesado_id: interesadoId,
    },
    filtroExistente: { origen: 'directorio', especialista_id: especialistaId },
    interesadoId,
    mensaje,
  });
}

// "Responder" una oferta del tablón.
export async function iniciarConversacionOferta({ ofertaId, interesadoId, mensaje }) {
  return iniciarConversacion({
    fila: {
      origen: 'tablon',
      oferta_id: ofertaId,
      interesado_id: interesadoId,
    },
    filtroExistente: { origen: 'tablon', oferta_id: ofertaId },
    interesadoId,
    mensaje,
  });
}

const SELECT_CONVERSACION =
  '*, oferta:oferta_id(id, tipo, autor_rol, especialidad, descripcion, zona, fecha, hora_inicio, hora_fin, tarifa, autor_id, activa, estado)';

// La bandeja: mis conversaciones de los DOS lados y de las DOS mitades en una
// sola consulta.
export async function fetchMisConversacionesEspecialista(perfilId) {
  const { data, error } = await supabase
    .from('especialista_conversaciones')
    .select(SELECT_CONVERSACION)
    .or(`autor_id.eq.${perfilId},interesado_id.eq.${perfilId}`)
    .order('ultimo_mensaje_at', { ascending: false });
  if (error) throw error;

  const filas = (data ?? []).map((c) => ({
    ...c,
    _otroId: c.autor_id === perfilId ? c.interesado_id : c.autor_id,
  }));
  const conOtro = await adjuntarPerfiles(filas, '_otroId', 'otro');
  return conOtro.map(({ _otroId, ...c }) => c);
}

export async function fetchConversacionEspecialista(conversacionId, perfilId) {
  const { data, error } = await supabase
    .from('especialista_conversaciones')
    .select(SELECT_CONVERSACION)
    .eq('id', conversacionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const otroId = data.autor_id === perfilId ? data.interesado_id : data.autor_id;
  const [conOtro] = await adjuntarPerfiles([{ ...data, _otroId: otroId }], '_otroId', 'otro');
  const { _otroId, ...conversacion } = conOtro;
  return conversacion;
}

// "Estoy de acuerdo". Cada lado solo puede mover su propia bandera y `estado`
// lo deriva el trigger de 0039 §4.4 — acá nunca se escribe.
export async function acordarConversacionEspecialista(conversacion, perfilId) {
  const campo = esParteAutora(conversacion, perfilId) ? 'acuerdo_autor' : 'acuerdo_interesado';
  const { data, error } = await supabase
    .from('especialista_conversaciones')
    .update({ [campo]: true })
    .eq('id', conversacion.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Terminal, y la puede tomar cualquiera de los dos, solo mientras esté abierta.
export async function descartarConversacionEspecialista(conversacionId) {
  const { data, error } = await supabase
    .from('especialista_conversaciones')
    .update({ estado: 'descartada' })
    .eq('id', conversacionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cierra el servicio. Vía RPC porque el trigger bloquea que el cliente saque la
// conversación de 'aceptada' con un update suelto. NO borra los mensajes: el
// historial se conserva.
export async function finalizarServicioEspecialista(conversacionId) {
  const { error } = await supabase.rpc('especialista_finalizar_servicio', {
    p_conversacion_id: conversacionId,
  });
  if (error) throw error;
}

export async function marcarConversacionEspecialistaLeida(conversacion, perfilId) {
  const campo = esParteAutora(conversacion, perfilId) ? 'leido_autor_at' : 'leido_interesado_at';
  const { error } = await supabase
    .from('especialista_conversaciones')
    .update({ [campo]: new Date().toISOString() })
    .eq('id', conversacion.id);
  if (error) throw error;
}

export function tieneNoLeidosEspecialista(conversacion, perfilId) {
  if (!conversacion) return false;
  const visto = esParteAutora(conversacion, perfilId)
    ? conversacion.leido_autor_at
    : conversacion.leido_interesado_at;
  if (!visto) return true;
  return new Date(conversacion.ultimo_mensaje_at) > new Date(visto);
}

// Ficha del otro participante. Sin teléfono, sin dirección y sin el número de
// matrícula (0039 §7.2). Hace falta sobre todo cuando el otro NO sale en el
// directorio: un auxiliar del tablón, o un especialista que dejó de estar
// listado después de que empezó la conversación.
export async function fetchFichaContactoEspecialista(perfilId) {
  if (!perfilId) return null;
  const { data, error } = await supabase.rpc('especialista_ficha_contacto', { p_perfil_id: perfilId });
  if (error) throw error;
  return data?.[0] ?? null;
}

// ============================================================================
// Mensajes y adjuntos
// ============================================================================

const BUCKET_CHAT = 'especialista-chat';

export async function fetchMensajesEspecialista(conversacionId) {
  const { data, error } = await supabase
    .from('especialista_mensajes')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Sube al bucket privado `especialista-chat` (el fundador debe crearlo a mano
// en el Dashboard — ver la cabecera de 0039) bajo
// `${conversacionId}/${uid}-${timestamp}.${ext}`. Se guarda el path, nunca una
// URL: el bucket es privado y se firma al mostrarlo.
async function subirArchivo(conversacionId, remitenteId, file) {
  const ext = file.name.split('.').pop();
  const path = `${conversacionId}/${remitenteId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_CHAT).upload(path, file);
  if (error) throw error;
  return path;
}

export async function getSignedEspecialistaChatFileUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET_CHAT).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// La policy de insert de 0039 exige que la conversación esté 'abierta' o
// 'aceptada': el hilo sigue vivo mientras dura el servicio y se cierra al
// finalizarlo. Es backend, no una condición de la UI.
export async function enviarMensajeEspecialista({ conversacionId, remitenteId, mensaje, archivo }) {
  const texto = (mensaje ?? '').trim();
  if (!texto && !archivo) throw new Error('Escribe un mensaje o adjunta un archivo.');

  let archivoPath = null;
  if (archivo) {
    archivoPath = await subirArchivo(conversacionId, remitenteId, archivo);
  }

  const { data, error } = await supabase
    .from('especialista_mensajes')
    .insert({
      conversacion_id: conversacionId,
      remitente_id: remitenteId,
      mensaje: texto || null,
      archivo_path: archivoPath,
      archivo_tipo: archivo?.type || null,
      archivo_nombre: archivo?.name || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function subscribeMensajesEspecialista(conversacionId, onNuevoMensaje) {
  return subscribeInserts('especialista_mensajes', 'conversacion_id', conversacionId, onNuevoMensaje);
}

export function subscribeConversacionEspecialista(conversacionId, onCambio) {
  return subscribeRow('especialista_conversaciones', conversacionId, onCambio);
}

// ============================================================================
// Formato
// ============================================================================

export function formatFechaOferta(oferta) {
  if (!oferta?.fecha) return '';
  const fecha = new Date(`${oferta.fecha}T00:00:00`);
  return Number.isNaN(fecha.getTime())
    ? oferta.fecha
    : fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatFranjaOferta(oferta) {
  const inicio = oferta?.hora_inicio ? oferta.hora_inicio.slice(0, 5) : '';
  const fin = oferta?.hora_fin ? oferta.hora_fin.slice(0, 5) : '';
  if (!inicio) return '';
  return fin ? `${inicio}–${fin}` : inicio;
}

// El asunto de una conversación, sea de la mitad que sea. Lo usan la bandeja,
// el historial y N-34, que no quieren ramificar por `origen`.
export function asuntoConversacion(conversacion) {
  if (conversacion?.origen === 'tablon') {
    return conversacion.oferta?.descripcion || '(sin descripción)';
  }
  return 'Consulta con especialista';
}
