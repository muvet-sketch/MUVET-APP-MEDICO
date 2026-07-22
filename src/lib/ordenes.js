import { supabase } from './supabase';
import { uploadDocumento } from './storage';

// N-17: Órdenes a exámenes externos. Laboratorio destino en texto libre (no
// buscador de aliados — N-13 "Órdenes MUVET" está fuera de esta fase). D-228/
// D-229: si algún ítem coincide con el catálogo sustancias_controladas, la
// orden nace/queda en estado 'bloqueada_comite' (RPC crear_orden_externa /
// actualizar_items_orden en 0009) y no puede emitirse hasta quitar el ítem.
// Estados: borrador → (bloqueada_comite) → emitida → resultado_cargado.

export const FEE_POR_ITEM = 500; // COP, solo informativo — no hay cobro real en el MVP.

export async function fetchOrdenesExternas(servicioId) {
  const { data, error } = await supabase
    .from('ordenes_externas')
    .select('*')
    .eq('servicio_id', servicioId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function crearOrdenExterna(servicioId, { laboratorioDestino, items, indicaciones }) {
  const { data, error } = await supabase.rpc('crear_orden_externa', {
    p_servicio_id: servicioId,
    p_laboratorio_destino: laboratorioDestino,
    p_items: items,
    p_indicaciones: indicaciones || null,
  });
  if (error) throw error;
  return data;
}

export async function actualizarItemsOrden(ordenId, { laboratorioDestino, items, indicaciones }) {
  const { data, error } = await supabase.rpc('actualizar_items_orden', {
    p_orden_id: ordenId,
    p_laboratorio_destino: laboratorioDestino,
    p_items: items,
    p_indicaciones: indicaciones || null,
  });
  if (error) throw error;
  return data;
}

export async function emitirOrdenExterna(ordenId) {
  const { data, error } = await supabase.rpc('emitir_orden_externa', { p_orden_id: ordenId });
  if (error) throw error;
  return data;
}

export async function cargarResultadoOrden(ordenId, { resultadoArchivoUrl, valoresManuales, interpretacion }) {
  const { data, error } = await supabase.rpc('cargar_resultado_orden', {
    p_orden_id: ordenId,
    p_resultado_archivo_url: resultadoArchivoUrl || null,
    p_valores_manuales: valoresManuales || null,
    p_interpretacion: interpretacion || null,
  });
  if (error) throw error;
  return data;
}

// Sube el resultado (foto/PDF) al bucket 'documents' ya existente, misma
// convención de path que el logo/firma de N-8 (${userId}/{proposito}-{ts}.{ext}).
// Devuelve el path (no una URL pública — el bucket es privado desde Fase 7,
// ver src/lib/storage.js); se resuelve a signed URL en el momento de mostrarlo.
// Sin OCR real — TODO: OCR real — P-EI-005.
export async function subirResultadoArchivo(medicoId, ordenId, file) {
  const ext = file.name.split('.').pop();
  const path = `${medicoId}/orden-${ordenId}-${Date.now()}.${ext}`;
  await uploadDocumento(path, file);
  return path;
}
