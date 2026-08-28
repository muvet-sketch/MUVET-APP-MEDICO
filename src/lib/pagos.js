import { supabase } from './supabase';

// Control de pagos de los módulos gremiales (migración 0029). Capa común a
// MUVET Turnos (relevo_conversaciones) y MUVET Auxiliar (apoyo_conversaciones).
// Ver el bloque de lib/nombresModulos.js — los `modulo` de aquí son los
// IDENTIFICADORES internos, no los nombres de UI.
//
// ⚠️ MUVET Relevo (N-30, `cobertura_*`) SALIÓ de esta capa en la migración 0034:
// ahí el médico que releva le cobra directamente al tutor, así que no hay pago
// entre las dos partes que marcar ni datos bancarios que intercambiar. Los tres
// RPC `cobertura_pago_*` se eliminaron; las columnas `pago_*` de
// `cobertura_solicitudes` siguen en la tabla pero inertes. No volver a añadir
// 'cobertura' acá sin reponerlos.
//
// Dos cosas:
//   1. Datos de pago en el perfil (perfiles.pago_*): los edita el propio dueño
//      desde su perfil. NUNCA se leen por PostgREST de otra fila — la
//      contraparte solo los ve vía `fetchDatosPagoContraparte`, y solo si el
//      dueño hizo opt-in en ese servicio.
//   2. Estado de pago del servicio + opt-in para compartir, ambos en la fila
//      del servicio, movidos siempre por los RPC `<pfx>_pago_*` de 0029
//      (security definer). El cliente nunca hace UPDATE directo de `pago_*`.

export const TIPOS_CUENTA = ['Ahorros', 'Corriente', 'Depósito de Bajo Monto'];

// Campos de perfiles.pago_* ↔ etiqueta de UI. El orden es el de la tarjeta.
export const CAMPOS_DATOS_PAGO = [
  { col: 'pago_titular', label: 'Titular de la cuenta' },
  { col: 'pago_banco', label: 'Banco' },
  { col: 'pago_tipo_cuenta', label: 'Tipo de cuenta' },
  { col: 'pago_numero_cuenta', label: 'Número de cuenta' },
  { col: 'pago_llave_breb', label: 'Llave BreB' },
  { col: 'pago_link', label: 'Link de pago' },
];

// El RPC `<pfx>_datos_pago` devuelve estas claves (sin el prefijo `pago_`).
const CAMPOS_RPC = ['titular', 'banco', 'tipo_cuenta', 'numero_cuenta', 'llave_breb', 'link'];

// ¿El perfil tiene al menos un dato de pago configurado?
export function perfilTieneDatosPago(perfil) {
  return CAMPOS_DATOS_PAGO.some(({ col }) => (perfil?.[col] ?? '').toString().trim() !== '');
}

// ¿La fila que devolvió el RPC de contraparte trae algo?
export function datosPagoVacios(datos) {
  return !datos || CAMPOS_RPC.every((k) => (datos[k] ?? '').toString().trim() === '');
}

// Normaliza la fila del RPC a [{ label, valor, esLink }] para pintar la tarjeta.
export function filasDatosPago(datos) {
  if (!datos) return [];
  return [
    { label: 'Titular de la cuenta', valor: datos.titular },
    { label: 'Banco', valor: datos.banco },
    { label: 'Tipo de cuenta', valor: datos.tipo_cuenta },
    { label: 'Número de cuenta', valor: datos.numero_cuenta },
    { label: 'Llave BreB', valor: datos.llave_breb },
    { label: 'Link de pago', valor: datos.link, esLink: true },
  ].filter((f) => (f.valor ?? '').toString().trim() !== '');
}

// modulo → prefijo de los RPC + columna de la contraparte en la fila del servicio.
const CONFIG = {
  relevo: { pfx: 'relevo', flagContraparte: 'pago_datos_interesado' },
  apoyo: { pfx: 'apoyo', flagContraparte: 'pago_datos_interesado' },
};

// Un `modulo` desconocido (hoy solo 'cobertura', retirado en 0034) no debe
// reventar la pantalla que lo monte por error: se comporta como "sin pagos".
function configDe(modulo) {
  return CONFIG[modulo] ?? null;
}

export function moduloTienePagos(modulo) {
  return configDe(modulo) !== null;
}

// Para los wrappers de RPC, donde no hay valor neutro que devolver.
function exigirConfig(modulo) {
  const config = configDe(modulo);
  if (!config) throw new Error(`El módulo "${modulo}" no lleva control de pagos.`);
  return config;
}

// Cuál de las dos banderas de opt-in es la del usuario actual en esta fila.
export function columnaMiOptIn(modulo, fila, perfilId) {
  const config = configDe(modulo);
  if (!config) return null;
  const soyAutor = fila?.autor_id === perfilId;
  return soyAutor ? 'pago_datos_autor' : config.flagContraparte;
}

// ¿Me toca a MÍ compartir mis datos de pago en este servicio? (migración 0033)
//
// 0029 lo dejó simétrico y las dos partes podían publicar su cuenta bancaria.
// El pago va en una sola dirección, así que solo quien COBRA tiene motivo para
// entregar sus datos; quien paga los recibe y copia.
//
// La regla NO es "quien no creó la oferta": en MUVET Turnos un médico puede
// publicar "Ofrezco disponibilidad a establecimientos" y ser a la vez el autor
// de la oferta Y el que cobra. Por eso se decide por ROL.
//
// Esto es la capa de UI. La frontera real son los RPC `<pfx>_pago_compartir`
// de 0033, que rechazan igual al lado que no cobra.
export function puedeCompartirDatosPago(modulo, fila, perfil) {
  if (!perfil) return false;
  switch (modulo) {
    // Cobra el profesional; la clínica contrata y paga (y ni siquiera tiene la
    // sección de datos de pago en su perfil).
    case 'relevo':
      return perfil.rol !== 'clinica';
    // Cobra el auxiliar; el médico es quien contrata el apoyo.
    case 'apoyo':
      return perfil.rol === 'auxiliar';
    // 'cobertura' salió del módulo de pagos en 0034 (el médico que releva le
    // cobra al tutor): cae acá y no comparte nada.
    default:
      return false;
  }
}

// Lee, desde la fila del servicio ya cargada, el estado de pago tal como lo
// necesita el panel. `fila` es una conversación de Turnos o de Auxiliar; en las
// dos, `autor_id` identifica al lado "autor".
export function estadoPagoServicio(modulo, fila, perfilId) {
  const config = configDe(modulo);
  if (!config) {
    return { pagado: false, marcadoPorMi: false, marcadoAt: null, nota: '', yoComparto: false };
  }
  const { flagContraparte } = config;
  const soyAutor = fila?.autor_id === perfilId;
  return {
    pagado: fila?.pago_estado === 'pagado',
    marcadoPorMi: fila?.pago_marcado_por === perfilId,
    marcadoAt: fila?.pago_marcado_at ?? null,
    nota: fila?.pago_nota ?? '',
    yoComparto: soyAutor ? Boolean(fila?.pago_datos_autor) : Boolean(fila?.[flagContraparte]),
  };
}

// ---------------------------------------------------------------------------
// RPC wrappers — firma homogénea (modulo, id, ...)
// ---------------------------------------------------------------------------

export async function marcarPagoServicio(modulo, id, pagado, nota = null) {
  const { pfx } = exigirConfig(modulo);
  const { error } = await supabase.rpc(`${pfx}_pago_marcar`, {
    p_id: id,
    p_pagado: pagado,
    p_nota: nota,
  });
  if (error) throw error;
}

export async function compartirDatosPagoServicio(modulo, id, compartir) {
  const { pfx } = exigirConfig(modulo);
  const { error } = await supabase.rpc(`${pfx}_pago_compartir`, {
    p_id: id,
    p_compartir: compartir,
  });
  if (error) throw error;
}

export async function fetchDatosPagoContraparte(modulo, id) {
  const { pfx } = exigirConfig(modulo);
  const { data, error } = await supabase.rpc(`${pfx}_datos_pago`, { p_id: id });
  if (error) throw error;
  const fila = Array.isArray(data) ? data[0] : data;
  return datosPagoVacios(fila) ? null : fila;
}
