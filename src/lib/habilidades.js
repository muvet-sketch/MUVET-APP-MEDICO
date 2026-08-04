import { supabase } from './supabase';

// Catálogos cerrados de habilidades para MUVET Relevo (migración 0015).
// Definidos por el fundador — no inventar, reordenar ni traducir entradas.
//
// Quién las usa:
// - médico y auxiliar: las configuran en su perfil (N-8 · PerfilAuxiliarInline)
//   y/o al editar su oferta; quedan activas en la publicación cada vez que la
//   crean o la activan.
// - clínica: NO tiene habilidades de perfil. Las selecciona solo dentro de su
//   oferta, como las que espera del candidato que vea o acepte la publicación.
export const HABILIDADES_PROFESIONALES = [
  'Consulta interna',
  'Venopunción',
  'Cistocentesis',
  'Sondaje',
  'Triage',
  'Reanimación',
  'Intubación',
  'Toracocentesis',
  'Fluidoterapia',
  'Monitoreo',
  'Ecografía',
  'A-FAST',
  'T-FAST',
  'Radiología',
  'Citología',
  'Sedación',
  'Anestesia',
];

export const HABILIDADES_PERSONALES = [
  'Puntualidad',
  'Empatía',
  'Resiliencia',
  'Liderazgo',
  'Asertividad',
  'Paciencia',
  'Adaptabilidad',
  'Comunicación con tutores',
  'Trabajo en equipo',
  'Gestión del estrés',
  'Toma de decisiones',
  'Observación',
  'Proactividad',
  'Compañerismo',
  'Escucha activa',
  'Resolución de conflictos',
  'Manejo del tiempo',
  'Atención al detalle',
  'Servicio al cliente',
];

// Solo médico y auxiliar guardan habilidades en su perfil; la clínica las
// declara por oferta (son expectativas sobre el candidato, no propias).
export const ROLES_CON_HABILIDADES_DE_PERFIL = ['medico', 'auxiliar'];

export function tieneHabilidadesDePerfil(rol) {
  return ROLES_CON_HABILIDADES_DE_PERFIL.includes(rol);
}

// Descarta valores que ya no estén en el catálogo (p. ej. si el fundador
// retira una entrada) para que la UI no muestre chips huérfanos.
export function normalizarHabilidades(valores, catalogo) {
  return (valores ?? []).filter((v) => catalogo.includes(v));
}

export async function guardarHabilidadesPerfil(perfilId, { profesionales, personales }) {
  const { error } = await supabase
    .from('perfiles')
    .update({
      habilidades_profesionales: profesionales ?? [],
      habilidades_personales: personales ?? [],
    })
    .eq('id', perfilId);
  if (error) throw error;
}
