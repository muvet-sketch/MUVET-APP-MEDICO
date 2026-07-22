import { supabase } from './supabase';

// N-12: Fórmula médica. Nomenclatura DCI (denominación común internacional)
// como campo principal — no marca comercial. D-539: aviso de sustancia
// controlada, sin bloqueo (se resuelve contra el catálogo semilla real
// `sustancias_controladas`, ver 0001 — Tramadol/Fenobarbital/Ketamina/
// Diazepam/Morfina). // TODO: catálogo regulatorio completo — P-EI-IRIS-006.

export async function fetchSustanciasControladas() {
  const { data, error } = await supabase.from('sustancias_controladas').select('nombre');
  if (error) throw error;
  return (data ?? []).map((row) => row.nombre);
}

export function esSustanciaControlada(dci, catalogo) {
  if (!dci) return false;
  const normalizado = dci.trim().toLowerCase();
  return catalogo.some((nombre) => normalizado.includes(nombre.toLowerCase()));
}

export async function fetchFormulaConItems(servicioId) {
  const { data: formula, error } = await supabase
    .from('formulas')
    .select('*')
    .eq('servicio_id', servicioId)
    .maybeSingle();
  if (error) throw error;
  if (!formula) return null;

  const { data: items, error: itemsError } = await supabase
    .from('formula_items')
    .select('*')
    .eq('formula_id', formula.id)
    .order('created_at', { ascending: true });
  if (itemsError) throw itemsError;

  return { ...formula, items: items ?? [] };
}

export async function obtenerOCrearFormula(servicioId) {
  const { data, error } = await supabase.rpc('obtener_o_crear_formula', { p_servicio_id: servicioId });
  if (error) throw error;
  return data;
}

export async function agregarFormulaItem(formulaId, item) {
  const { data, error } = await supabase.rpc('agregar_formula_item', {
    p_formula_id: formulaId,
    p_dci: item.dci,
    p_dosis: item.dosis || null,
    p_via: item.via || null,
    p_frecuencia: item.frecuencia || null,
    p_duracion: item.duracion || null,
    p_instrucciones: item.instrucciones || null,
    p_contiene_controlada: item.contieneControlada,
  });
  if (error) throw error;
  return data;
}

export async function eliminarFormulaItem(itemId) {
  const { error } = await supabase.rpc('eliminar_formula_item', { p_item_id: itemId });
  if (error) throw error;
}

export async function actualizarEstadoFormula(formulaId, estado) {
  const { data, error } = await supabase.rpc('actualizar_estado_formula', {
    p_formula_id: formulaId,
    p_estado: estado,
  });
  if (error) throw error;
  return data;
}
