import { supabase } from './supabase';

// N-15: SOAP + constantes vitales. Notación siempre S/O/A/P (nunca S/O/T/P).
// D-043: soap_notas está restringida por RLS al médico dueño del servicio
// (policies soap_notas_select_medico_dueno / _write_medico_dueno, 0001) —
// ver auditoría en supabase/migrations/0008_soap_formula_fase5.sql. La
// escritura pasa siempre por el RPC guardar_soap_nota (nunca insert/update
// directo desde el cliente), que refuerza esa misma verificación.

export async function fetchSoapNota(servicioId) {
  const { data, error } = await supabase
    .from('soap_notas')
    .select('*')
    .eq('servicio_id', servicioId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function guardarSoapNota(servicioId, { sSubjetivo, oObjetivo, aAssessment, pPlan }) {
  const { data, error } = await supabase.rpc('guardar_soap_nota', {
    p_servicio_id: servicioId,
    p_s_subjetivo: sSubjetivo,
    p_o_objetivo: oObjetivo,
    p_a_assessment: aAssessment,
    p_p_plan: pPlan,
  });
  if (error) throw error;
  return data;
}
