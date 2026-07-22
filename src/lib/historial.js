import { supabase } from './supabase';

// N-9: Historial de servicios cerrados + calificación real (reemplaza el
// mock de N-8/CalificacionSection.jsx, Fase 2) + corrección post-cierre del
// SOAP (D-507: nunca edita soap_notas, solo agrega un anexo con trazabilidad).

export async function fetchServiciosCerrados(medicoId) {
  const { data, error } = await supabase
    .from('servicios')
    .select('*, mascotas:mascota_id(*), calificaciones_servicio(rating, comentario)')
    .eq('medico_id', medicoId)
    .eq('estado', 'cerrada')
    .order('cerrado_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCalificacionPromedio(medicoId) {
  const { data, error } = await supabase.from('calificaciones_servicio').select('rating').eq('medico_id', medicoId);
  if (error) throw error;
  const ratings = data ?? [];
  if (ratings.length === 0) return { promedio: null, total: 0 };
  const promedio = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  return { promedio, total: ratings.length };
}

export async function fetchCorreccionesSoap(servicioId) {
  const { data, error } = await supabase
    .from('correcciones_soap_post_cierre')
    .select('*')
    .eq('servicio_id', servicioId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function solicitarCorreccionSoap(servicioId, { campo, valorCorregido, motivo }) {
  const { data, error } = await supabase.rpc('solicitar_correccion_soap', {
    p_servicio_id: servicioId,
    p_campo: campo,
    p_valor_corregido: valorCorregido,
    p_motivo: motivo,
  });
  if (error) throw error;
  return data;
}

// MOCK / DEV ONLY — la App Tutor no existe todavía; simula que el tutor
// calificó el servicio. Caveat canónico consolidado en
// supabase/migrations/0010_fase7_hardening.sql (sección "Acción 8 del
// despacho de Fase 7"). TODO: P-EI-AppMedico-TUTOR-AUTH.
export async function simularCalificacionTutor(servicioId, { rating, comentario }) {
  const { data, error } = await supabase.rpc('simular_calificacion_tutor', {
    p_servicio_id: servicioId,
    p_rating: rating,
    p_comentario: comentario || null,
  });
  if (error) throw error;
  return data;
}
