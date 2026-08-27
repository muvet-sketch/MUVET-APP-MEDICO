// Nombres visibles de los TRES módulos gremiales.
//
// ⚠️ LEER ANTES DE TOCAR CUALQUIER COSA DE ESTOS TRES MÓDULOS ⚠️
//
// Ninguno de los tres tiene un identificador de código igual a su nombre
// visible. Los dos primeros porque los nombres se intercambiaron y no se
// renombró el código; el tercero porque su nombre natural ya estaba ocupado.
//
//   UI "MUVET Turnos"    →  ruta /relevo              →  lib/relevo.js,
//                                                        tablas relevo_*,
//                                                        notificaciones relevo_*
//
//   UI "MUVET Relevo"    →  ruta /cobertura-servicio  →  lib/coberturaServicio.js,
//                                                        tablas cobertura_*,
//                                                        notificaciones cobertura_*
//
//   UI "MUVET Auxiliar"  →  ruta /apoyo               →  lib/apoyo.js,
//                                                        tablas apoyo_*,
//                                                        notificaciones apoyo_*
//
// Los dos primeros: los nombres de cara al usuario se intercambiaron, pero los
// IDENTIFICADORES de código NO. "Relevo" pasó al módulo que de verdad es un
// relevo (un médico le pasa a otro un servicio concreto que no puede atender),
// y la bolsa gremial multi-rol pasó a llamarse "Turnos".
//
// No se renombraron rutas, tablas ni funciones a propósito: hay deep links
// vivos (/relevo?tab=ofertas) y los tipos de notificación están en el CHECK de
// la migración 0026. Ese refactor, si alguna vez se hace, va con migración de
// BD y es trabajo aparte.
//
// Todo texto de UI de los tres módulos sale de aquí, para que el día que
// cambien de nombre otra vez se toque un solo archivo.

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

// Médico↔auxiliar (N-32, migración 0028): el auxiliar ofrece su disponibilidad
// y el médico busca apoyo, sea para que lo ACOMPAÑE en su jornada o para que
// vaya solo a un domicilio a hacer una TAREA. Salió de MUVET Turnos, donde
// vivía como las combinaciones (busco, auxiliar) y (ofrezco, medico).
//
// ⚠️ El identificador interno es `apoyo`, NO `auxiliar`: `auxiliar` ya es un
// valor de `perfiles.rol`, y una tabla `auxiliar_conversaciones` conviviendo
// con `rol = 'auxiliar'` haría ilegible cada policy. Son tres cosas distintas:
//   `apoyo`      → el módulo (tablas, ruta, lib)
//   "Auxiliar"   → el nombre visible del módulo
//   'auxiliar'   → el rol del usuario en `perfiles.rol`
export const NOMBRE_AUXILIAR = 'MUVET Auxiliar';
export const ICONO_AUXILIAR = '🧰';
export const CORTO_AUXILIAR = 'Auxiliar';
