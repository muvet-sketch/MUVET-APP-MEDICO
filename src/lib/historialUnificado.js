// N-9 · Historial único (Cobertura de Servicio + MUVET Relevo).
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
import { fetchMisPublicaciones, fetchMisPostulaciones } from './relevo';

// Estados terminales de cada fuente — lo que ya terminó y por eso es historial.
const RELEVO_OFERTA_TERMINAL = ['cancelada', 'finalizada'];
const RELEVO_POSTULACION_TERMINAL = ['aceptada', 'rechazada'];

export const ORIGENES_HISTORIAL = [
  { value: '', label: 'Todo' },
  { value: 'cobertura', label: 'Cobertura' },
  { value: 'relevo', label: 'Relevo' },
];

// `origen` distingue cómo se renderiza cada ítem (ver ItemHistorial.jsx);
// `familia` es lo que filtran los chips de la pantalla.
function normalizar(origen, familia, fecha, raw) {
  return { id: `${origen}-${raw.id}`, origen, familia, fecha, raw };
}

export async function fetchHistorialUnificado(perfilId) {
  const [cobertura, publicaciones, postulaciones] = await Promise.all([
    fetchHistorial(perfilId),
    fetchMisPublicaciones(perfilId),
    fetchMisPostulaciones(perfilId),
  ]);

  const items = [
    // fetchHistorial ya filtra a estado in ('finalizada','cancelada'). Una
    // solicitud cancelada nunca llegó a finalizarse, así que no tiene
    // `finalizada_at` — para esas se ordena por su fecha de creación.
    ...cobertura.map((s) => normalizar('cobertura', 'cobertura', s.finalizada_at ?? s.created_at, s)),

    // SUPUESTO: `relevo_publicaciones` no tiene columna de cierre
    // (`cancelada_at`/`finalizada_at`), solo `created_at` — el estado terminal
    // lo escribe el trigger de 0018 sin estampar fecha. Los ítems de Relevo se
    // ordenan por su fecha de creación, así que una oferta publicada hace
    // meses y cerrada ayer aparece abajo. Resolverlo exige una migración que
    // agregue `cerrada_at`; fuera de alcance de este cambio.
    ...publicaciones
      .filter((p) => RELEVO_OFERTA_TERMINAL.includes(p.estado))
      .map((p) => normalizar('relevo_oferta', 'relevo', p.created_at, p)),

    // Mismo caso: `relevo_mensajes` tampoco estampa la fecha de la decisión.
    ...postulaciones
      .filter((m) => RELEVO_POSTULACION_TERMINAL.includes(m.estado))
      .map((m) => normalizar('relevo_postulacion', 'relevo', m.created_at, m)),
  ];

  return items.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0));
}
