import { supabase } from './supabase';

export async function fetchMascota(mascotaId) {
  const { data, error } = await supabase.from('mascotas').select('*').eq('id', mascotaId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchTutor(tutorId) {
  if (!tutorId) return null;
  const { data, error } = await supabase.from('tutores').select('*').eq('id', tutorId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchVacunas(mascotaId) {
  const { data, error } = await supabase
    .from('vacunas')
    .select('*')
    .eq('mascota_id', mascotaId)
    .order('fecha_aplicacion', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchDesparasitaciones(mascotaId) {
  const { data, error } = await supabase
    .from('desparasitaciones')
    .select('*')
    .eq('mascota_id', mascotaId)
    .order('fecha_aplicacion', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchMedicamentosActuales(mascotaId) {
  const { data, error } = await supabase
    .from('medicamentos_actuales')
    .select('*')
    .eq('mascota_id', mascotaId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAlergias(mascotaId) {
  const { data, error } = await supabase
    .from('alergias')
    .select('*')
    .eq('mascota_id', mascotaId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// -- SUPUESTO: por RLS (servicios_select_medico, D-043 en soap_notas) este
// médico solo puede ver los servicios cerrados donde él mismo fue el
// médico tratante. No hay visibilidad cruzada entre médicos del historial
// clínico de otros colegas en este MVP — no se pidió tocar esa política.
export async function fetchServiciosCerrados(mascotaId) {
  const { data, error } = await supabase
    .from('servicios')
    .select('id, cerrado_at, created_at, soap_notas(a_assessment)')
    .eq('mascota_id', mascotaId)
    .eq('estado', 'cerrada')
    .order('cerrado_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function crearMascota({ tutorId, nombre, especie, raza, sexo, fechaNacimiento, pesoKg }) {
  const { data, error } = await supabase
    .from('mascotas')
    .insert({
      tutor_id: tutorId,
      nombre,
      especie,
      raza,
      sexo,
      fecha_nacimiento: fechaNacimiento || null,
      peso_kg: pesoKg || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
