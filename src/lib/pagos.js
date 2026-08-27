import { supabase } from './supabase';

// Control de pagos de los módulos gremiales (migración 0029). Capa común a los
// tres: MUVET Turnos (relevo_conversaciones), MUVET Relevo (cobertura_solicitudes)
// y MUVET Auxiliar (apoyo_conversaciones). Ver el bloque de lib/nombresModulos.js
// — los `modulo` de aquí son los IDENTIFICADORES internos, no los nombres de UI.
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
  cobertura: { pfx: 'cobertura', flagContraparte: 'pago_datos_cobertura' },
};

// Cuál de las dos banderas de opt-in es la del usuario actual en esta fila.
export function columnaMiOptIn(modulo, fila, perfilId) {
  const soyAutor = fila?.autor_id === perfilId;
  return soyAutor ? 'pago_datos_autor' : CONFIG[modulo].flagContraparte;
}

// Lee, desde la fila del servicio ya cargada, el estado de pago tal como lo
// necesita el panel. `fila` es una conversación (relevo/apoyo) o una solicitud
// (cobertura); en las tres, `autor_id` identifica al lado "autor".
export function estadoPagoServicio(modulo, fila, perfilId) {
  const { flagContraparte } = CONFIG[modulo];
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
  const { pfx } = CONFIG[modulo];
  const { error } = await supabase.rpc(`${pfx}_pago_marcar`, {
    p_id: id,
    p_pagado: pagado,
    p_nota: nota,
  });
  if (error) throw error;
}

export async function compartirDatosPagoServicio(modulo, id, compartir) {
  const { pfx } = CONFIG[modulo];
  const { error } = await supabase.rpc(`${pfx}_pago_compartir`, {
    p_id: id,
    p_compartir: compartir,
  });
  if (error) throw error;
}

export async function fetchDatosPagoContraparte(modulo, id) {
  const { pfx } = CONFIG[modulo];
  const { data, error } = await supabase.rpc(`${pfx}_datos_pago`, { p_id: id });
  if (error) throw error;
  const fila = Array.isArray(data) ? data[0] : data;
  return datosPagoVacios(fila) ? null : fila;
}
