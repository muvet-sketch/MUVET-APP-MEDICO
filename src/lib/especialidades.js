import { supabase } from './supabase';

// Catálogo cerrado de especialidades veterinarias — MUVET Especialistas (N-35,
// migración 0039). Es lo que hace BUSCABLE el directorio.
//
// ⚠️ A diferencia de los catálogos de habilidades (lib/habilidades.js), este NO
// admite valores fuera de la lista: el directorio se filtra por especialidad, y
// un valor libre ("cardio", "Cardiologia") volvería inencontrable a quien lo
// escribiera. Por eso la UI lo monta con `allowCustom={false}`.
//
// SUPUESTO: lista propuesta a partir de las especialidades clínicas de pequeños
// animales más frecuentes en Colombia. PENDIENTE de confirmación del fundador
// antes de congelarla — una vez haya perfiles guardados, cambiar una entrada
// deja huérfanos los `perfiles.especialidades` que la usaban.
export const ESPECIALIDADES_VETERINARIAS = [
  'Medicina interna',
  'Cirugía de tejidos blandos',
  'Cirugía ortopédica',
  'Ortopedia',
  'Anestesiología',
  'Cardiología',
  'Dermatología',
  'Oftalmología',
  'Neurología',
  'Oncología',
  'Odontología',
  'Endocrinología',
  'Gastroenterología',
  'Nefrología y urología',
  'Reproducción y obstetricia',
  'Imagenología',
  'Radiografía',
  'Ecografía',
  'Patología clínica',
  'Urgencias y cuidado crítico',
  'Etología y comportamiento',
  'Nutrición clínica',
  'Rehabilitación y fisioterapia',
  'Medicina felina',
  'Animales exóticos',
  'Equinos',
  'Grandes animales',
];

// `perfiles.especialidad` (singular, texto libre, migración 0001) sigue
// existiendo y lo leen relevo_ficha_contacto y apoyo_ficha_contacto. NO se
// migra a esta columna: sus valores actuales son frases libres que no
// pertenecen al catálogo — mismo criterio con el que 0015 dejó `habilidades`
// en paz al estrenar los catálogos cerrados.

// Limpia vacíos y duplicados, y descarta lo que no esté en el catálogo. Acá sí
// se filtra contra el catálogo (normalizarHabilidades ya no lo hace) por lo
// dicho arriba: un valor fuera de lista no es buscable.
export function normalizarEspecialidades(valores) {
  const limpios = (valores ?? [])
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => ESPECIALIDADES_VETERINARIAS.includes(v));
  return [...new Set(limpios)];
}

export async function guardarEspecialidadesPerfil(perfilId, especialidades) {
  const { error } = await supabase
    .from('perfiles')
    .update({ especialidades: normalizarEspecialidades(especialidades) })
    .eq('id', perfilId);
  if (error) throw error;
}

// Espejo EN CLIENTE de la función de BD `es_especialista_directorio()` (0039
// §5) y del WHERE de la vista `especialistas_directorio`. Las tres condiciones
// tienen que decir lo mismo; la de BD es la que manda.
//
// Se usa para lo que el backend no puede: decidir qué pestañas mostrar y qué
// avisar en el perfil. Nunca para autorizar — eso lo hace la RLS.
export function esVisibleEnDirectorio(perfil) {
  return (
    perfil?.rol === 'medico' &&
    perfil?.estado_validacion === 'validado' &&
    (perfil?.especialidades?.length ?? 0) >= 1
  );
}

// Qué le falta a este médico para aparecer en el directorio. Devuelve null si
// ya aparece. Lo usa la sección del perfil (N-8) y la tarjeta del Home para no
// dejar al usuario adivinando por qué no está listado.
export function faltaParaDirectorio(perfil) {
  if (!perfil || perfil.rol !== 'medico') return null;
  if (esVisibleEnDirectorio(perfil)) return null;
  if (perfil.estado_validacion !== 'validado') {
    return 'Tu matrícula COMVEZCOL tiene que estar validada.';
  }
  return 'Marca al menos una especialidad.';
}
