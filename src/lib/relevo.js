import { supabase } from './supabase';

// N-26 · MUVET Relevo (D-540/D-545/D-546). Esquema (relevo_publicaciones,
// relevo_mensajes) y RLS ya existían desde 0001_schema_inicial.sql — esta es
// solo la capa de acceso a datos, siguiendo el patrón de lib/solicitudes.js.

// D-545: clínica solo puede publicar "busco médico/auxiliar"; médico y
// auxiliar solo pueden publicar "ofrezco disponibilidad". Se valida aquí
// además de en RLS para no depender solo de que el cliente arme bien el
// payload — la policy de insert ya restringe autor_id = auth.uid(), pero no
// el valor de `tipo` según el rol.
const TIPO_PERMITIDO_POR_ROL = {
  medico: 'ofrezco',
  auxiliar: 'ofrezco',
  clinica: 'busco',
};

export async function fetchPublicacionesActivas({ tipo, rolObjetivo, zona } = {}) {
  let query = supabase
    .from('relevo_publicaciones')
    .select('*, autor:autor_id(id, rol, nombre_completo, razon_social)')
    .eq('activa', true)
    .order('created_at', { ascending: false });

  if (tipo) query = query.eq('tipo', tipo);
  if (rolObjetivo) query = query.eq('rol_objetivo', rolObjetivo);
  if (zona) query = query.ilike('zona', `%${zona}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchMisPublicaciones(autorId) {
  const { data, error } = await supabase
    .from('relevo_publicaciones')
    .select('*')
    .eq('autor_id', autorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function crearPublicacion({
  autorId,
  autorRol,
  tipo,
  rolObjetivo,
  descripcion,
  zona,
  fechaInicio,
  fechaFin,
  tipoJornada,
}) {
  const tipoEsperado = TIPO_PERMITIDO_POR_ROL[autorRol];
  if (tipo !== tipoEsperado) {
    throw new Error(
      autorRol === 'clinica'
        ? 'Las clínicas solo pueden publicar "Busco médico/auxiliar" (D-545).'
        : 'Solo puedes publicar "Ofrezco disponibilidad" (D-545).'
    );
  }

  const { data, error } = await supabase
    .from('relevo_publicaciones')
    .insert({
      autor_id: autorId,
      tipo,
      rol_objetivo: rolObjetivo || null,
      descripcion: descripcion || null,
      zona: zona || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      tipo_jornada: tipoJornada || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function desactivarPublicacion(id, autorId) {
  const { error } = await supabase
    .from('relevo_publicaciones')
    .update({ activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

export async function activarPublicacion(id, autorId) {
  const { error } = await supabase
    .from('relevo_publicaciones')
    .update({ activa: true })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Usado por "Editar Oferta" en Mi Oferta (N-26). No cambia `tipo` ni
// `rol_objetivo` (D-545 ya los fija al crear; editar solo ajusta parámetros).
export async function actualizarPublicacion(id, autorId, { descripcion, zona, fechaInicio, fechaFin, tipoJornada }) {
  const { data, error } = await supabase
    .from('relevo_publicaciones')
    .update({
      descripcion: descripcion || null,
      zona: zona || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      tipo_jornada: tipoJornada || null,
    })
    .eq('id', id)
    .eq('autor_id', autorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// D-540: mensaje único de contacto, sin hilo de chat.
export async function enviarMensaje({ publicacionId, remitenteId, mensaje }) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .insert({ publicacion_id: publicacionId, remitente_id: remitenteId, mensaje })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// El dueño de la publicación marca una solicitud recibida como aceptada
// (0011: policy de update scoped a `p.autor_id = auth.uid()`). No abre un
// hilo ni notifica en tiempo real (D-540) — es solo el estado de la fila.
export async function aceptarSolicitud(mensajeId) {
  const { error } = await supabase.from('relevo_mensajes').update({ estado: 'aceptada' }).eq('id', mensajeId);
  if (error) throw error;
}

export async function fetchMensajesRecibidos(autorId) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .select('*, publicacion:publicacion_id!inner(id, tipo, descripcion, autor_id), remitente:remitente_id(id, rol, nombre_completo, razon_social, telefono)')
    .eq('publicacion.autor_id', autorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
