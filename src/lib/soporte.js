import { supabase } from './supabase';

// Tickets de soporte. Hoy el caso de uso es uno solo: un médico marcado como
// posible suplantación ('en_disputa', ver 0025) necesita un canal para
// resolver la controversia, porque el resto de la app le queda bloqueado.
//
// La RLS de soporte_tickets deliberadamente NO exige `not perfil_en_disputa()`:
// contactar a soporte es justamente lo único que sí debe poder hacer.

export const MOTIVO_VALIDACION_MATRICULA = 'validacion_matricula';

export async function crearTicket({ perfilId, mensaje, motivo = MOTIVO_VALIDACION_MATRICULA }) {
  const { data, error } = await supabase
    .from('soporte_tickets')
    .insert({ perfil_id: perfilId, mensaje, motivo })
    .select()
    .single();
  if (error) throw error;

  // Aviso por correo al fundador (best-effort, mismo patrón que
  // verificacionComvezcol.js / mejoras.js). El ticket ya quedó guardado y
  // visible en revision_matriculas_pendientes aunque esto falle. Un perfil
  // 'en_disputa' conserva su sesión válida, así que también puede invocarla.
  try {
    await supabase.functions.invoke('notificar-soporte', {
      body: { ticketId: data.id },
    });
  } catch (err) {
    console.warn('No se pudo enviar el aviso de soporte:', err);
  }

  return data;
}

export async function fetchMisTickets(perfilId) {
  const { data, error } = await supabase
    .from('soporte_tickets')
    .select('id, motivo, mensaje, estado, created_at')
    .eq('perfil_id', perfilId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
