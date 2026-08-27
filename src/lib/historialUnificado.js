// N-9 · Historial único (MUVET Relevo + MUVET Turnos).
//
// OJO con los nombres: `cobertura` es el identificador interno de lo que la UI
// llama "MUVET Relevo", y `relevo` el de lo que la UI llama "MUVET Turnos".
// Ver el bloque de lib/nombresModulos.js.
//
// Antes había tres historiales desconectados, cada uno reimplementando el
// mismo patrón sobre su propia tabla: N-9 (servicios domiciliarios cerrados),
// la pestaña "Historial" de N-30 y la sección "Ofertas anteriores" de N-26.
// Esta capa agrega las dos fuentes que sí entran al historial único y las
// normaliza a una sola forma para poder ordenarlas juntas.
//
// El historial de DOMICILIOS ya no vive aquí: quedó encapsulado dentro de su
// propio módulo (N-27 · Mis Domicilios → "Actividad reciente"), porque el
// lanzamiento inicial va con Cobertura y Relevo, y domicilios queda para más
// adelante. Ver lib/historial.js, que sigue sirviendo a N-27 y N-8.
//
// No hay queries nuevas: se reutilizan las funciones de acceso a datos que ya
// existían en cada módulo.
import { fetchHistorial } from './coberturaServicio';
import { fetchMisPublicaciones, fetchMisConversaciones } from './relevo';
import { fetchMisConversacionesApoyo } from './apoyo';
import { CORTO_AUXILIAR, CORTO_RELEVO, CORTO_TURNOS } from './nombresModulos';

// Estados terminales de cada fuente — lo que ya terminó y por eso es historial.
const RELEVO_OFERTA_TERMINAL = ['cancelada', 'finalizada'];
// 0028: 'aceptada' deja de ser terminal en Turnos — el turno confirmado sigue
// vivo (con su chat abierto) hasta que alguien lo da por finalizado. Mientras
// está en 'aceptada' aparece en "Servicios aceptados" del Home, no acá.
const RELEVO_CONVERSACION_TERMINAL = ['descartada', 'finalizada'];
const APOYO_CONVERSACION_TERMINAL = ['descartada', 'finalizada'];

// Los `value` son identificadores internos y no se tocan; solo cambian las
// etiquetas. De ahí que 'cobertura' se muestre como "Relevo" y 'relevo' como
// "Turnos" — es correcto, no es un error de copia.
export const ORIGENES_HISTORIAL = [
  { value: '', label: 'Todo' },
  { value: 'cobertura', label: CORTO_RELEVO },
  { value: 'relevo', label: CORTO_TURNOS },
  { value: 'apoyo', label: CORTO_AUXILIAR },
];

// `origen` distingue cómo se renderiza cada ítem (ver ItemHistorial.jsx);
// `familia` es lo que filtran los chips de la pantalla.
function normalizar(origen, familia, fecha, raw) {
  return { id: `${origen}-${raw.id}`, origen, familia, fecha, raw };
}

// `limite` solo recorta el resultado ya ordenado: la agregación es en memoria
// sobre tres fuentes, así que no hay forma de limitar antes sin desordenar el
// cruce. Lo usa la vista previa del Home (últimos 3); N-9 la llama sin límite.
export async function fetchHistorialUnificado(perfilId, { limite } = {}) {
  const [cobertura, publicaciones, conversaciones, conversacionesApoyo] = await Promise.all([
    fetchHistorial(perfilId),
    fetchMisPublicaciones(perfilId),
    fetchMisConversaciones(perfilId),
    fetchMisConversacionesApoyo(perfilId),
  ]);

  const items = [
    // fetchHistorial ya filtra a estado in ('finalizada','cancelada'). Una
    // solicitud cancelada nunca llegó a finalizarse, así que no tiene
    // `finalizada_at` — para esas se ordena por su fecha de creación.
    ...cobertura.map((s) => normalizar('cobertura', 'cobertura', s.finalizada_at ?? s.created_at, s)),

    // SUPUESTO: `relevo_publicaciones` sigue sin columna de cierre
    // (`cancelada_at`/`finalizada_at`), solo `created_at` — el estado terminal
    // lo escribe el trigger de 0018 sin estampar fecha, y 0027 no lo cambió
    // porque el dato que importaba para ordenar el historial (el cierre de la
    // negociación) sí quedó resuelto con `relevo_conversaciones.cerrada_at`.
    // Una oferta publicada hace meses y cancelada ayer sigue apareciendo abajo.
    ...publicaciones
      .filter((p) => RELEVO_OFERTA_TERMINAL.includes(p.estado))
      .map((p) => normalizar('relevo_oferta', 'relevo', p.created_at, p)),

    // Las conversaciones cerradas sí se ordenan por su cierre real (0027).
    // Entran las de los DOS lados: tanto las que abrí sobre ofertas ajenas
    // como las que recibí sobre las mías.
    ...conversaciones
      .filter((c) => RELEVO_CONVERSACION_TERMINAL.includes(c.estado))
      .map((c) => normalizar('relevo_conversacion', 'relevo', c.cerrada_at ?? c.ultimo_mensaje_at, c)),

    // MUVET Auxiliar (0028). Solo las cerradas: un servicio 'aceptada' sigue
    // en curso y vive en "Servicios aceptados" del Home. A diferencia de
    // Cobertura, el historial del chat NO se borró al finalizar, así que estos
    // ítems sí se pueden abrir para releerlo.
    ...conversacionesApoyo
      .filter((c) => APOYO_CONVERSACION_TERMINAL.includes(c.estado))
      .map((c) => normalizar('apoyo_conversacion', 'apoyo', c.cerrada_at ?? c.ultimo_mensaje_at, c)),
  ];

  const ordenados = items.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0));
  return limite ? ordenados.slice(0, limite) : ordenados;
}
