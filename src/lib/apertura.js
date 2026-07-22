import { supabase } from './supabase';

// Apertura del servicio: check-in de llegada (D-537) + doble consentimiento
// (D-116). Ver supabase/migrations/0006_apertura_consentimiento.sql.

export async function registrarCheckinLlegada(servicioId) {
  const { data, error } = await supabase.rpc('registrar_checkin_llegada', { p_servicio_id: servicioId });
  if (error) throw error;
  return data;
}

export async function registrarConsentimientoMedico(servicioId, irisSolicitado) {
  const { data, error } = await supabase.rpc('registrar_consentimiento_medico', {
    p_servicio_id: servicioId,
    p_iris_solicitado: irisSolicitado,
  });
  if (error) throw error;
  return data;
}

// MOCK: la App Tutor no existe todavía — caveat canónico consolidado en
// supabase/migrations/0010_fase7_hardening.sql (sección "Acción 8 del
// despacho de Fase 7"), referenciado también desde el componente que llama a
// esta función (apertura-servicio/index.jsx). TODO: P-EI-AppMedico-TUTOR-AUTH.
export async function registrarRespuestaTutorMock(servicioId, aceptado) {
  const { data, error } = await supabase.rpc('registrar_respuesta_tutor', {
    p_servicio_id: servicioId,
    p_aceptado: aceptado,
  });
  if (error) throw error;
  return data;
}

export async function reintentarConsentimientoTutor(servicioId) {
  const { data, error } = await supabase.rpc('reintentar_consentimiento_tutor', { p_servicio_id: servicioId });
  if (error) throw error;
  return data;
}

export async function abrirConstelacion(servicioId) {
  const { data, error } = await supabase.rpc('abrir_constelacion', { p_servicio_id: servicioId });
  if (error) throw error;
  return data;
}
