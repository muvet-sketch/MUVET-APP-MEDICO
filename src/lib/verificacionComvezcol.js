import { supabase } from './supabase';

// Verificación automática de la matrícula COMVEZCOL contra el registro público
// del Consejo Profesional de Medicina Veterinaria y Zootecnia de Colombia.
// La consulta la hace la Edge Function `verificar-comvezcol` (ver
// supabase/functions/verificar-comvezcol/index.ts); el cliente nunca habla
// directo con el registro externo.
//
// MODIFICACIÓN EXPLÍCITA A D-541 ("Validación COMVEZCOL manual"): confirmada
// con el fundador. La validación pasa a automática cuando hay coincidencia
// inequívoca (misma matrícula + nombre concordante), con RESPALDO MANUAL en
// todos los demás casos. Lo que NO cambia: sin matrícula validada el médico
// sigue sin poder activar disponibilidad (DisponibleToggle.jsx), y el plazo
// ≤24h sigue aplicando a lo que cae a revisión manual. Ver el encabezado de
// supabase/migrations/0024_verificacion_comvezcol.sql.
//
// La automatización NUNCA rechaza: el peor caso es dejar el perfil en
// 'pendiente'. Un fallo de red no puede dejar fuera a un médico legítimo.

// Resultados posibles que devuelve la función (mismo enum que la columna
// validaciones_comvezcol.resultado).
export const RESULTADO_VALIDADO = 'validado';
export const RESULTADO_SIN_COINCIDENCIA = 'sin_coincidencia';
export const RESULTADO_AMBIGUO = 'ambiguo';
export const RESULTADO_ERROR = 'error';
export const RESULTADO_DUPLICADO = 'duplicado';

// Estado de bloqueo por posible suplantación (0025). Quien está así solo puede
// actualizar su perfil y contactar a soporte; el bloqueo real es de backend
// (RLS + trigger), esto es únicamente para la UI.
export const ESTADO_EN_DISPUTA = 'en_disputa';

export function estaEnDisputa(perfil) {
  return perfil?.estado_validacion === ESTADO_EN_DISPUTA;
}

// Dispara la verificación del médico autenticado. Devuelve
// { resultado, estado_validacion }.
//
// Pensada para llamarse "en segundo plano" tras guardar la matrícula: quien la
// invoca NO debe bloquear el flujo si esto falla (ver los try/catch en
// ActorProfileForm.jsx y MatriculaSection.jsx). El perfil ya quedó en
// 'pendiente' de todas formas, así que un error acá solo significa que la
// validación la hará una persona.
export async function verificarMatriculaComvezcol() {
  const { data, error } = await supabase.functions.invoke('verificar-comvezcol');
  if (error) throw error;
  return data;
}

// Último intento de verificación del médico (para mostrar contexto en N-8 si
// se quisiera). RLS limita la lectura a las filas propias.
export async function fetchUltimaVerificacion(medicoId) {
  const { data, error } = await supabase
    .from('validaciones_comvezcol')
    .select('resultado, matricula_consultada, nombre_encontrado, created_at')
    .eq('medico_id', medicoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
