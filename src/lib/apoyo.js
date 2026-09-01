import { supabase } from './supabase';
import { subscribeInserts, subscribeRow } from './chatRealtime';
import { filtrarPorZonaCobertura } from './municipios';

// N-32 · MUVET Auxiliar — médico↔auxiliar. Capa de acceso a datos.
// Esquema, RLS, triggers y RPC en supabase/migrations/0028_apoyo_y_realtime_chats.sql.
//
// ⚠️ NOMBRES: el identificador interno de este módulo es `apoyo` (ruta /apoyo,
// tablas apoyo_*), NO `auxiliar` — `auxiliar` ya es un valor de `perfiles.rol`
// y tenerlo también como prefijo de tabla haría ilegible cada policy. De cara
// al usuario el módulo se llama "MUVET Auxiliar". Ver lib/nombresModulos.js.
//
// Este matching salió de MUVET Turnos (lib/relevo.js), donde vivía como las
// combinaciones (busco, auxiliar) y (ofrezco, medico) y no podía expresar lo
// que de verdad distingue el caso: si el auxiliar ACOMPAÑA al médico o si va
// SOLO a un domicilio. Turnos queda para lo que involucra a una clínica.
//
// Diferencias con los otros dos módulos, todas deliberadas:
//   · El chat sigue ABIERTO tras el acuerdo y se cierra al finalizar el
//     servicio (lo impone la policy de insert de 0028, no la UI).
//   · Al finalizar NO se borran los mensajes: el historial se conserva y se
//     consulta desde el Home y desde N-9.
//   · Nunca se expone un teléfono. `apoyo_ficha_contacto` no devuelve la
//     columna, y el único dato de ubicación es la dirección de encuentro.

// Los dos servicios que un médico puede necesitar de un auxiliar. El `value`
// va sin tilde a propósito: viaja en la BD, en URLs y en payloads jsonb.
export const SUBTIPOS_SERVICIO = [
  {
    value: 'acompanamiento',
    label: 'Acompañamiento en jornada',
    ayuda: 'El auxiliar te acompaña durante tu jornada de trabajo.',
  },
  {
    value: 'tarea_domicilio',
    label: 'Tarea en domicilio',
    ayuda: 'El auxiliar va solo al domicilio a realizar una tarea puntual. Tú no estás presente.',
  },
];

export function labelSubtipo(value) {
  return SUBTIPOS_SERVICIO.find((s) => s.value === value)?.label ?? '';
}

// Qué publica cada rol. Es la matriz completa del módulo: el auxiliar ofrece
// su disponibilidad y el médico publica lo que necesita. La clínica no
// participa (tiene MUVET Turnos). Se valida acá además de en RLS, para dar un
// mensaje claro en vez de que el insert falle sin explicación.
export const TIPO_PUBLICACION_POR_ROL = {
  auxiliar: 'ofrezco',
  medico: 'busco',
};

// Qué tipo de publicación le interesa ver a cada rol: el complementario.
export const TIPO_QUE_BUSCA_POR_ROL = {
  medico: 'ofrezco', // el médico busca auxiliares disponibles
  auxiliar: 'busco', // el auxiliar busca médicos que necesitan apoyo
};

export function participaEnApoyo(rol) {
  return rol === 'medico' || rol === 'auxiliar';
}

// `perfiles` solo deja leer la fila propia (0001), así que el embed automático
// de PostgREST devuelve null para cualquier otro usuario. Se resuelve en dos
// pasos contra `perfiles_publico` (0014) y se mezcla en cliente — mismo patrón
// que adjuntarAutores en lib/relevo.js.
async function adjuntarPerfiles(filas, campoId, campoSalida) {
  const ids = Array.from(new Set(filas.map((f) => f[campoId]).filter(Boolean)));
  if (ids.length === 0) return filas.map((f) => ({ ...f, [campoSalida]: null }));

  const { data, error } = await supabase
    .from('perfiles_publico')
    .select('id, rol, nombre_completo, razon_social')
    .in('id', ids);
  if (error) throw error;

  const porId = new Map((data ?? []).map((p) => [p.id, p]));
  return filas.map((f) => ({ ...f, [campoSalida]: porId.get(f[campoId]) ?? null }));
}

// ============================================================================
// Publicaciones
// ============================================================================

export async function crearPublicacionApoyo({
  autorId,
  autorRol,
  servicioSubtipo,
  descripcion,
  zona,
  fecha,
  horaInicio,
  horaFin,
  tarifa,
}) {
  const tipo = TIPO_PUBLICACION_POR_ROL[autorRol];
  if (!tipo) {
    throw new Error('Tu rol no participa en MUVET Auxiliar.');
  }
  // El subtipo solo aplica a lo que publica el médico. Cuando publica el
  // auxiliar, lo elige el médico al contactarlo (ver iniciarConversacionApoyo).
  if (tipo === 'busco' && !servicioSubtipo) {
    throw new Error('Indica qué tipo de servicio necesitas.');
  }

  const { data, error } = await supabase
    .from('apoyo_publicaciones')
    .insert({
      autor_id: autorId,
      tipo,
      servicio_subtipo: tipo === 'busco' ? servicioSubtipo : null,
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

export async function actualizarPublicacionApoyo(
  id,
  autorId,
  { servicioSubtipo, descripcion, zona, fecha, horaInicio, horaFin, tarifa },
) {
  const payload = {
    descripcion: descripcion || null,
    zona: zona || null,
    fecha: fecha || null,
    hora_inicio: horaInicio || null,
    hora_fin: horaFin || null,
    tarifa: tarifa || tarifa === 0 ? tarifa : null,
  };
  // `tipo` no se edita (lo fija el rol); el subtipo sí, mientras la publicación
  // siga abierta. Solo se manda si venía definido, para no romper el CHECK de
  // coherencia en las publicaciones 'ofrezco'.
  if (servicioSubtipo) payload.servicio_subtipo = servicioSubtipo;

  const { data, error } = await supabase
    .from('apoyo_publicaciones')
    .update(payload)
    .eq('id', id)
    .eq('autor_id', autorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// El tablón: publicaciones activas del rol complementario. El filtro por
// `tipo` no es la única defensa —la policy de insert de conversaciones ya
// exige el par de roles correcto— pero evita mostrar lo que no se puede
// contactar.
export async function fetchPublicacionesDisponibles({ paraRol, excluirAutorId } = {}) {
  const tipo = TIPO_QUE_BUSCA_POR_ROL[paraRol];
  if (!tipo) return [];

  let query = supabase
    .from('apoyo_publicaciones')
    .select('*')
    .eq('tipo', tipo)
    .eq('activa', true)
    .eq('estado', 'abierta')
    .order('created_at', { ascending: false });

  if (excluirAutorId) query = query.neq('autor_id', excluirAutorId);

  const { data, error } = await query;
  if (error) throw error;
  return adjuntarPerfiles(data ?? [], 'autor_id', 'autor');
}

export async function fetchMisPublicacionesApoyo(autorId) {
  const { data, error } = await supabase
    .from('apoyo_publicaciones')
    .select('*')
    .eq('autor_id', autorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function activarPublicacionApoyo(id, autorId) {
  const { error } = await supabase
    .from('apoyo_publicaciones')
    .update({ activa: true })
    .eq('id', id)
    .eq('autor_id', autorId)
    .eq('estado', 'abierta');
  if (error) throw error;
}

export async function desactivarPublicacionApoyo(id, autorId) {
  const { error } = await supabase
    .from('apoyo_publicaciones')
    .update({ activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Terminal: el trigger de 0028 impide reabrirla y descarta las conversaciones
// que sigan abiertas (las ya acordadas quedan intactas).
export async function cancelarPublicacionApoyo(id, autorId) {
  const { error } = await supabase
    .from('apoyo_publicaciones')
    .update({ estado: 'cancelada', activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Matching por zona. Decía "mismo criterio que filtrarPublicacionesPorZona en
// lib/relevo.js" pero era una copia empobrecida: comparaba substrings a mano,
// sin áreas metropolitanas (un médico en Envigado no veía a un auxiliar en
// Bello), sin tolerar acentos ('medellin' contra 'Medellín') y descartando las
// publicaciones sin zona declarada, que así no las veía nadie.
//
// Ahora es de verdad el mismo criterio: el único, en lib/municipios.js.
export function filtrarPorZona(publicaciones, zonaCobertura) {
  return filtrarPorZonaCobertura(publicaciones, zonaCobertura);
}

// ============================================================================
// Conversaciones
// ============================================================================

export function esParteAutora(conversacion, perfilId) {
  return conversacion?.autor_id === perfilId;
}

export const ESTADOS_ABIERTOS = ['abierta', 'aceptada'];

export function chatAbierto(conversacion) {
  return ESTADOS_ABIERTOS.includes(conversacion?.estado);
}

// "Contactar": abre la negociación y deja el primer mensaje.
//
// `servicioSubtipo` solo se manda cuando la publicación es del auxiliar
// ('ofrezco'): ahí el subtipo es justamente lo que el médico está eligiendo.
// Si la publicación es del médico ('busco'), el trigger de alta lo copia de
// ella e ignora lo que mande el cliente.
//
// Idempotente contra el UNIQUE(publicacion_id, interesado_id): se puede llegar
// acá desde dos pestañas o desde una tarjeta desactualizada.
export async function iniciarConversacionApoyo({ publicacionId, interesadoId, servicioSubtipo, mensaje }) {
  const texto = (mensaje ?? '').trim();
  if (!texto) throw new Error('Escribe un mensaje para iniciar la conversación.');

  const { data: creada, error } = await supabase
    .from('apoyo_conversaciones')
    .insert({
      publicacion_id: publicacionId,
      interesado_id: interesadoId,
      servicio_subtipo: servicioSubtipo ?? null,
    })
    .select()
    .single();

  let conversacion = creada;
  if (error) {
    // 23505 = unique_violation: ya había conversación con esta publicación.
    if (error.code !== '23505') throw error;
    const { data: existente, error: errorExistente } = await supabase
      .from('apoyo_conversaciones')
      .select('*')
      .eq('publicacion_id', publicacionId)
      .eq('interesado_id', interesadoId)
      .single();
    if (errorExistente) throw errorExistente;
    conversacion = existente;
  }

  await enviarMensajeApoyo({ conversacionId: conversacion.id, remitenteId: interesadoId, mensaje: texto });
  return conversacion;
}

// La bandeja: mis conversaciones de los DOS lados en una sola consulta.
export async function fetchMisConversacionesApoyo(perfilId) {
  const { data, error } = await supabase
    .from('apoyo_conversaciones')
    .select('*, publicacion:publicacion_id(id, tipo, servicio_subtipo, descripcion, zona, fecha, hora_inicio, hora_fin, tarifa, autor_id, activa, estado)')
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

export async function fetchConversacionApoyo(conversacionId, perfilId) {
  const { data, error } = await supabase
    .from('apoyo_conversaciones')
    .select('*, publicacion:publicacion_id(id, tipo, servicio_subtipo, descripcion, zona, fecha, hora_inicio, hora_fin, tarifa, autor_id, activa, estado)')
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
// lo deriva el trigger de 0028 — acá nunca se escribe.
export async function acordarConversacionApoyo(conversacion, perfilId) {
  const campo = esParteAutora(conversacion, perfilId) ? 'acuerdo_autor' : 'acuerdo_interesado';
  const { data, error } = await supabase
    .from('apoyo_conversaciones')
    .update({ [campo]: true })
    .eq('id', conversacion.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Terminal, y la puede tomar cualquiera de los dos, solo mientras esté abierta.
export async function descartarConversacionApoyo(conversacionId) {
  const { data, error } = await supabase
    .from('apoyo_conversaciones')
    .update({ estado: 'descartada' })
    .eq('id', conversacionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cierra el servicio. Vía RPC porque el trigger bloquea que el cliente saque
// la conversación de 'aceptada' con un update suelto. NO borra los mensajes
// (a diferencia de cobertura_finalizar_servicio): el historial se conserva.
export async function finalizarServicioApoyo(conversacionId) {
  const { error } = await supabase.rpc('apoyo_finalizar_servicio', { p_conversacion_id: conversacionId });
  if (error) throw error;
}

export async function marcarConversacionApoyoLeida(conversacion, perfilId) {
  const campo = esParteAutora(conversacion, perfilId) ? 'leido_autor_at' : 'leido_interesado_at';
  const { error } = await supabase
    .from('apoyo_conversaciones')
    .update({ [campo]: new Date().toISOString() })
    .eq('id', conversacion.id);
  if (error) throw error;
}

export function tieneNoLeidosApoyo(conversacion, perfilId) {
  if (!conversacion) return false;
  const visto = esParteAutora(conversacion, perfilId)
    ? conversacion.leido_autor_at
    : conversacion.leido_interesado_at;
  if (!visto) return true;
  return new Date(conversacion.ultimo_mensaje_at) > new Date(visto);
}

// Ficha del otro participante. Sin teléfono ni dirección de sede: en este
// módulo el único canal es el chat y el único dato de ubicación es la
// dirección de encuentro.
export async function fetchFichaContactoApoyo(perfilId) {
  if (!perfilId) return null;
  const { data, error } = await supabase.rpc('apoyo_ficha_contacto', { p_perfil_id: perfilId });
  if (error) throw error;
  return data?.[0] ?? null;
}

// ============================================================================
// Mensajes y adjuntos
// ============================================================================

export async function fetchMensajesApoyo(conversacionId) {
  const { data, error } = await supabase
    .from('apoyo_mensajes')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Sube al bucket privado 'apoyo-chat' (el fundador debe crearlo a mano en el
// Dashboard — ver la cabecera de 0028) bajo
// `${conversacionId}/${uid}-${timestamp}.${ext}`. Se guarda el path, nunca una
// URL pública: el bucket es privado y se firma al mostrarlo.
async function subirArchivoApoyo(conversacionId, remitenteId, file) {
  const ext = file.name.split('.').pop();
  const path = `${conversacionId}/${remitenteId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('apoyo-chat').upload(path, file);
  if (error) throw error;
  return path;
}

export async function getSignedApoyoChatFileUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('apoyo-chat').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// La policy de insert de 0028 exige que la conversación esté 'abierta' o
// 'aceptada': el hilo sigue vivo mientras dura el servicio y se cierra al
// finalizarlo. Es backend, no una condición de la UI.
export async function enviarMensajeApoyo({ conversacionId, remitenteId, mensaje, archivo }) {
  const texto = (mensaje ?? '').trim();
  if (!texto && !archivo) throw new Error('Escribe un mensaje o adjunta un archivo.');

  let archivoPath = null;
  if (archivo) {
    archivoPath = await subirArchivoApoyo(conversacionId, remitenteId, archivo);
  }

  const { data, error } = await supabase
    .from('apoyo_mensajes')
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

export function subscribeMensajesApoyo(conversacionId, onNuevoMensaje) {
  return subscribeInserts('apoyo_mensajes', 'conversacion_id', conversacionId, onNuevoMensaje);
}

export function subscribeConversacionApoyo(conversacionId, onCambio) {
  return subscribeRow('apoyo_conversaciones', conversacionId, onCambio);
}

// ============================================================================
// Dirección de encuentro (tabla lateral, D-064)
// ============================================================================
// La escribe el médico y el auxiliar solo la lee una vez la conversación queda
// 'aceptada'. El control es de backend: la policy de select de `apoyo_direccion`
// devuelve CERO filas antes del acuerdo, no es que la UI la esconda. Por eso
// aquí no hay ningún chequeo de estado — si no se puede ver, llega null.

export async function fetchDireccionEncuentro(conversacionId) {
  const { data, error } = await supabase
    .from('apoyo_direccion')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function guardarDireccionEncuentro({ conversacionId, direccion, referencia }) {
  const texto = (direccion ?? '').trim();
  if (!texto) throw new Error('Escribe la dirección del punto de encuentro.');

  const { data, error } = await supabase
    .from('apoyo_direccion')
    .upsert(
      {
        conversacion_id: conversacionId,
        direccion_encuentro: texto,
        referencia: referencia?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'conversacion_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Deep link a la app de mapas nativa (D-536). Se mudó a lib/mapas.js cuando
// dejó de ser exclusivo de este módulo (Home, N-30 y N-9 también lo usan); se
// re-exporta para no romper a quien ya lo importaba desde acá.
export { mapsUrl } from './mapas';

// El auxiliar no se enteraba de que la dirección había aparecido: la escribe el
// médico DESPUÉS del acuerdo, `apoyo_direccion` está fuera de Realtime (0028
// §C.4) y la pantalla solo la volvía a pedir cuando cambiaba `estado` — que ya
// no se mueve. 0031 agrega el latido `direccion_actualizada_at` en la fila de
// la conversación, que sí está publicada, para poder reaccionar a la escritura
// y a cada edición posterior. El dato en sí sigue viajando solo por PostgREST,
// donde manda la policy de select.
export function direccionActualizadaAt(conversacion) {
  return conversacion?.direccion_actualizada_at ?? null;
}

// ============================================================================
// Formato
// ============================================================================

export function formatFechaApoyo(publicacion) {
  if (!publicacion?.fecha) return '';
  const fecha = new Date(`${publicacion.fecha}T00:00:00`);
  return Number.isNaN(fecha.getTime())
    ? publicacion.fecha
    : fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatFranjaApoyo(publicacion) {
  const inicio = publicacion?.hora_inicio ? publicacion.hora_inicio.slice(0, 5) : '';
  const fin = publicacion?.hora_fin ? publicacion.hora_fin.slice(0, 5) : '';
  if (!inicio) return '';
  return fin ? `${inicio}–${fin}` : inicio;
}
