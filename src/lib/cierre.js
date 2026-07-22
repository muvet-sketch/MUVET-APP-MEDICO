import { supabase } from './supabase';

// N-19: Cierre del servicio. El checklist de pre-cierre (D-506) se computa
// en el propio componente a partir de lo que ya exponen fetchSoapNota /
// fetchFormulaConItems / fetchOrdenesExternas / fetchRecomendaciones — no
// hay un RPC de checklist aparte. El RPC cerrar_servicio revalida en
// servidor los bloqueantes (SOAP·A, fórmula no en borrador) como refuerzo
// defensivo, igual que abrir_constelacion revalida D-116 en 0006.
export async function cerrarServicio(servicioId) {
  const { data, error } = await supabase.rpc('cerrar_servicio', { p_servicio_id: servicioId });
  if (error) throw error;
  return data;
}
