import { supabase } from './supabase';

// Vista D-064: nunca expone direccion_exacta ni teléfono del tutor.
const CAMPOS_PRE_ACEPTACION =
  'id, mascota_especie, mascota_raza, mascota_nombre, tutor_primer_nombre, motivo_consulta, zona_aproximada, tarifa_estimada, primera_vez_paciente, expira_en, estado';

export async function expirarSolicitudesVencidas() {
  const { error } = await supabase.rpc('expirar_solicitudes_vencidas');
  if (error) throw error;
}

export async function fetchSolicitudPendiente() {
  const { data, error } = await supabase
    .from('solicitudes_pre_aceptacion')
    .select(CAMPOS_PRE_ACEPTACION)
    .eq('estado', 'pendiente')
    .order('expira_en', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchSolicitudPreAceptacionById(id) {
  const { data, error } = await supabase
    .from('solicitudes_pre_aceptacion')
    .select(CAMPOS_PRE_ACEPTACION)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Se suscribe a INSERTs de solicitudes en estado 'pendiente'. Usa la tabla
// base (postgres_changes no soporta vistas), pero direccion_exacta nunca
// viaja en el payload porque vive en `solicitudes_direccion` — ver nota en
// supabase/migrations/0004_solicitudes_servicios.sql.
export function subscribeNuevasSolicitudesPendientes(onNuevaSolicitud) {
  const channel = supabase
    .channel('solicitudes-pendientes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: 'estado=eq.pendiente' },
      (payload) => onNuevaSolicitud(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Se suscribe a cambios de estado de una solicitud puntual (para detectar
// que expiró mientras el overlay de N-3 seguía abierto).
export function subscribeSolicitudEstado(solicitudId, onCambioEstado) {
  const channel = supabase
    .channel(`solicitud-${solicitudId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'solicitudes', filter: `id=eq.${solicitudId}` },
      (payload) => onCambioEstado(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function aceptarSolicitud(solicitudId) {
  const { data, error } = await supabase.rpc('aceptar_solicitud', { p_solicitud_id: solicitudId });
  if (error) throw error;
  return data;
}

export async function rechazarSolicitud(solicitudId) {
  const { error } = await supabase.rpc('rechazar_solicitud', { p_solicitud_id: solicitudId });
  if (error) throw error;
}

export async function cancelarServicio(servicioId) {
  const { error } = await supabase.rpc('cancelar_servicio', { p_servicio_id: servicioId });
  if (error) throw error;
}

export async function fetchServicioActivoEnCamino(medicoId) {
  const { data, error } = await supabase
    .from('servicios')
    .select('id, estado, created_at, mascota_id')
    .eq('medico_id', medicoId)
    .eq('estado', 'en_camino')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Post-aceptación: la RLS de `solicitudes` ya permite leer la fila completa
// (medico_id = auth.uid() y estado != 'pendiente'), incluida direccion_exacta.
// `referencia` vive aparte en solicitudes_direccion (ver 0004); se trae con
// una consulta explícita en vez de un embed anidado para no depender de si
// PostgREST resuelve esa relación 1:1 como objeto o como arreglo.
export async function fetchServicioDetalle(servicioId) {
  const { data, error } = await supabase
    .from('servicios')
    .select('*, mascotas:mascota_id(*), solicitudes:solicitud_id(*, tutores:tutor_id(*))')
    .eq('id', servicioId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let referenciaDireccion = null;
  if (data.solicitud_id) {
    const { data: direccion } = await supabase
      .from('solicitudes_direccion')
      .select('referencia')
      .eq('solicitud_id', data.solicitud_id)
      .maybeSingle();
    referenciaDireccion = direccion?.referencia ?? null;
  }

  return { ...data, referenciaDireccion };
}
