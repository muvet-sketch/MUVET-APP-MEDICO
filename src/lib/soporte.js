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
