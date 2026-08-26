// Nombres visibles de los dos módulos gremiales.
//
// ⚠️ LEER ANTES DE TOCAR CUALQUIER COSA DE ESTOS DOS MÓDULOS ⚠️
//
// Los nombres de cara al usuario se intercambiaron, pero los IDENTIFICADORES
// de código NO. "Relevo" pasó al módulo que de verdad es un relevo (un médico
// le pasa a otro un servicio concreto que no puede atender), y la bolsa
// gremial multi-rol pasó a llamarse "Turnos". El mapeo quedó invertido:
//
//   UI "MUVET Turnos"  →  ruta /relevo              →  lib/relevo.js,
//                                                      tablas relevo_*,
//                                                      notificaciones relevo_*
//
//   UI "MUVET Relevo"  →  ruta /cobertura-servicio  →  lib/coberturaServicio.js,
//                                                      tablas cobertura_*,
//                                                      notificaciones cobertura_*
//
// No se renombraron rutas, tablas ni funciones a propósito: hay deep links
// vivos (/relevo?tab=ofertas, /relevo?tipo=ofrezco&rol=auxiliar) y los tipos
// de notificación están en el CHECK de la migración 0026. Ese refactor, si
// alguna vez se hace, va con migración de BD y es trabajo aparte.
//
// Todo texto de UI de ambos módulos sale de aquí, para que el día que cambien
// de nombre otra vez se toque un solo archivo.

// Bolsa gremial multi-rol (N-26): turnos, jornadas, clínicas buscando
// personal, médicos buscando auxiliar. Identificador interno: `relevo`.
export const NOMBRE_TURNOS = 'MUVET Turnos';
export const ICONO_TURNOS = '🗓️';
// Etiqueta corta, para la barra inferior y los chips de filtro.
export const CORTO_TURNOS = 'Turnos';

// Médico↔médico (N-30): pasar un servicio ya agendado que no se puede
// atender. Identificador interno: `cobertura`.
export const NOMBRE_RELEVO = 'MUVET Relevo';
export const ICONO_RELEVO = '🔄';
export const CORTO_RELEVO = 'Relevo';
