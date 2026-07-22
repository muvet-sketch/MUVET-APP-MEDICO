import { supabase } from './supabase';

// N-18: Recomendaciones al tutor — documento separado del SOAP (D-043: nunca
// expone contenido clínico interno, solo lo que el médico redacta aquí).
// Estados: borrador → en_edición → aprobado. La sección "Medicamentos" no
// vive en esta tabla: se lee en solo lectura desde la fórmula aprobada
// (src/lib/formula.js) para no duplicar lógica.

export async function fetchRecomendaciones(servicioId) {
  const { data, error } = await supabase
    .from('recomendaciones')
    .select('*')
    .eq('servicio_id', servicioId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function guardarRecomendaciones(servicioId, { cuidadosCasa, signosAlarma, proximaCita, seccionPersonalizada }) {
  const { data, error } = await supabase.rpc('guardar_recomendaciones', {
    p_servicio_id: servicioId,
    p_cuidados_casa: cuidadosCasa || null,
    p_signos_alarma: signosAlarma || null,
    p_proxima_cita: proximaCita || null,
    p_seccion_personalizada: seccionPersonalizada || null,
  });
  if (error) throw error;
  return data;
}

export async function aprobarRecomendaciones(servicioId) {
  const { data, error } = await supabase.rpc('aprobar_recomendaciones', { p_servicio_id: servicioId });
  if (error) throw error;
  return data;
}
