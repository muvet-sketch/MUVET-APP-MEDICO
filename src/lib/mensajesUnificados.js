// N-34 · Mensajes — bandeja unificada AGRUPADA POR CONTACTO.
//
// OJO con los nombres: `relevo` es el identificador interno de lo que la UI
// llama "MUVET Turnos", y `cobertura` el de lo que la UI llama "MUVET Relevo".
// Ver el bloque de lib/nombresModulos.js.
//
// Hermana de lib/historialUnificado.js, con otra pregunta:
//   · N-9 (historialUnificado) agrega solo lo TERMINAL y lo ordena
//     cronológicamente — responde "¿qué pasó?".
//   · N-34 (este archivo) agrega TODO —abierto y cerrado— y lo agrupa por
//     PERSONA — responde "¿con quién he hablado, y qué tengo vivo con cada
//     uno?".
//
// Igual que en historialUnificado, no hay queries nuevas ni tablas nuevas: se
// reutilizan las funciones de acceso a datos de cada módulo y el cruce se hace
// en memoria. Lo que cada rol puede leer ya lo decide la RLS de cada tabla.
import {
  ESTADOS_ACTIVOS_COBERTURA,
  chatAbierto as chatAbiertoCobertura,
  fetchHistorial as fetchHistorialCobertura,
  fetchMisSolicitudesActivas,
  tieneNoLeidosCobertura,
} from './coberturaServicio';
import { fetchMisConversaciones, tieneNoLeidos } from './relevo';
import {
  ESTADOS_ABIERTOS as ESTADOS_ABIERTOS_APOYO,
  fetchMisConversacionesApoyo,
  participaEnApoyo,
  tieneNoLeidosApoyo,
} from './apoyo';
import {
  CORTO_AUXILIAR,
  CORTO_RELEVO,
  CORTO_TURNOS,
  ICONO_AUXILIAR,
  ICONO_RELEVO,
  ICONO_TURNOS,
} from './nombresModulos';

// Mismo criterio que RELEVO_CONVERSACION_TERMINAL en historialUnificado.js:
// 'aceptada' NO es terminal (el turno confirmado sigue vivo, con su chat
// abierto, hasta que alguien lo finaliza).
const RELEVO_CONVERSACION_TERMINAL = ['descartada', 'finalizada'];

// Etiqueta de módulo para las tarjetas de N-34. Los `value` son identificadores
// internos y van al revés que los nombres visibles — no es un error de copia.
export const MODULOS_MENSAJES = {
  relevo: { label: CORTO_TURNOS, icono: ICONO_TURNOS },
  cobertura: { label: CORTO_RELEVO, icono: ICONO_RELEVO },
  apoyo: { label: CORTO_AUXILIAR, icono: ICONO_AUXILIAR },
};

export function nombreContacto(otro) {
  return otro?.razon_social || otro?.nombre_completo || 'Usuario MUVET';
}

// Forma común de una conversación, sea del módulo que sea.
//
// `chatDisponible` NO es lo mismo que `activa`: en MUVET Relevo (cobertura) un
// servicio finalizado conserva su chat 24 h y después se purga (0034), así que
// hay filas cerradas cuyo hilo todavía se puede abrir y filas cerradas que ya
// no llevan a ninguna parte. En Turnos y Auxiliar el hilo siempre se puede
// releer.
function normalizar({ origen, raw, otro, estado, activa, fecha, ruta, noLeido, chatDisponible }) {
  return {
    id: `${origen}-${raw.id}`,
    origen,
    estado,
    activa,
    fecha,
    otro,
    ruta,
    noLeido,
    chatDisponible,
    raw,
  };
}

// Al mismo perfil se le puede haber hablado desde dos módulos, y cada lib
// resuelve `perfiles_publico` con un `select` distinto: relevo trae
// `razon_social` y `foto_url` (0035), apoyo solo `razon_social`, y cobertura ni
// uno ni otro (es médico↔médico, ahí no hay clínicas ni logos). Al agrupar se
// completan los huecos con lo que haya traído cualquiera de las fuentes, para
// que el avatar y el nombre no dependan de en qué módulo se habló primero.
function fusionarOtro(previo, nuevo) {
  if (!previo) return nuevo;
  const fusionado = { ...previo };
  Object.entries(nuevo ?? {}).forEach(([clave, valor]) => {
    if (fusionado[clave] == null && valor != null) fusionado[clave] = valor;
  });
  return fusionado;
}

// MUVET Turnos (N-26). Conversación 1:1 sobre una publicación; abierta a los
// tres roles.
function normalizarRelevo(conversaciones, perfilId) {
  return conversaciones.map((c) =>
    normalizar({
      origen: 'relevo',
      raw: c,
      otro: c.otro,
      estado: c.estado,
      activa: !RELEVO_CONVERSACION_TERMINAL.includes(c.estado),
      fecha: c.ultimo_mensaje_at ?? c.created_at,
      ruta: `/relevo/conversacion/${c.id}`,
      noLeido: tieneNoLeidos(c, perfilId),
      chatDisponible: true,
    }),
  );
}

// MUVET Auxiliar (N-32). Misma forma que Turnos; el chat NO se purga nunca, así
// que una conversación cerrada siempre se puede releer.
function normalizarApoyo(conversaciones, perfilId) {
  return conversaciones.map((c) =>
    normalizar({
      origen: 'apoyo',
      raw: c,
      otro: c.otro,
      estado: c.estado,
      activa: ESTADOS_ABIERTOS_APOYO.includes(c.estado),
      fecha: c.ultimo_mensaje_at ?? c.created_at,
      ruta: `/apoyo/conversacion/${c.id}`,
      noLeido: tieneNoLeidosApoyo(c, perfilId),
      chatDisponible: true,
    }),
  );
}

// MUVET Relevo (N-30). No tiene tabla de conversaciones: la negociación vive en
// la propia solicitud, y "el otro" es el autor o quien releva, según de qué
// lado esté el perfil. Una solicitud 'abierta' todavía no tiene contraparte
// (nadie se ha ofrecido): esas se descartan acá, porque no son una
// conversación con nadie.
//
// 0038 le dio a este módulo `ultimo_mensaje_at` y sus dos `leido_*_at`, así que
// ya ordena y marca "sin leer" igual que los otros dos. El respaldo
// `finalizada_at ?? created_at` sigue para las solicitudes sin un solo mensaje
// (y para los chats ya purgados, cuyo `ultimo_mensaje_at` se conserva pero que
// no tienen nada que releer).
function normalizarCobertura(solicitudes, perfilId) {
  return solicitudes
    .map((s) => {
      const soyAutor = s.autor_id === perfilId;
      const otro = soyAutor ? s.cobertura : s.autor;
      if (!otro) return null;
      return normalizar({
        origen: 'cobertura',
        raw: s,
        otro,
        estado: s.estado,
        activa: ESTADOS_ACTIVOS_COBERTURA.includes(s.estado),
        fecha: s.ultimo_mensaje_at ?? s.finalizada_at ?? s.created_at,
        ruta: `/cobertura-servicio/chat/${s.id}`,
        noLeido: tieneNoLeidosCobertura(s, perfilId),
        chatDisponible: chatAbiertoCobertura(s),
      });
    })
    .filter(Boolean);
}

// Todas las conversaciones del perfil, de los módulos en los que su rol
// participa. No se piden las fuentes que el rol no puede ver: la RLS las
// devolvería vacías igual, pero son viajes de red al pedo.
async function fetchConversacionesUnificadas(perfilId, rol) {
  const [conversaciones, conversacionesApoyo, coberturaActivas, coberturaHistorial] = await Promise.all([
    fetchMisConversaciones(perfilId),
    participaEnApoyo(rol) ? fetchMisConversacionesApoyo(perfilId) : Promise.resolve([]),
    rol === 'medico' ? fetchMisSolicitudesActivas(perfilId) : Promise.resolve([]),
    rol === 'medico' ? fetchHistorialCobertura(perfilId) : Promise.resolve([]),
  ]);

  // Las dos consultas de cobertura son disjuntas por estado, pero salen en dos
  // viajes distintos: si una solicitud se finaliza justo entre ambas, aparece
  // en las dos. Se deduplica por id quedándose con la primera.
  const porId = new Map();
  [...coberturaActivas, ...coberturaHistorial].forEach((s) => {
    if (!porId.has(s.id)) porId.set(s.id, s);
  });

  return [
    ...normalizarRelevo(conversaciones, perfilId),
    ...normalizarApoyo(conversacionesApoyo, perfilId),
    ...normalizarCobertura([...porId.values()], perfilId),
  ];
}

// Bandeja de N-34: un ítem por PERSONA, no por conversación. Ordenada por
// actividad más reciente, que es lo que se espera de una lista de mensajes.
//
// Una conversación cuyo `otro` no se pudo resolver contra `perfiles_publico`
// (perfil borrado) se descarta: sin contraparte no hay contacto que listar, y
// sigue siendo alcanzable desde su propio módulo y desde N-9.
export async function fetchContactosConMensajes(perfilId, rol) {
  const conversaciones = await fetchConversacionesUnificadas(perfilId, rol);

  const porContacto = new Map();
  conversaciones.forEach((c) => {
    if (!c.otro?.id) return;
    const previo = porContacto.get(c.otro.id);
    if (previo) {
      previo.otro = fusionarOtro(previo.otro, c.otro);
      previo.conversaciones.push(c);
    } else {
      porContacto.set(c.otro.id, { id: c.otro.id, otro: c.otro, conversaciones: [c] });
    }
  });

  const contactos = [...porContacto.values()].map((contacto) => {
    const ordenadas = contacto.conversaciones.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0));
    return {
      ...contacto,
      conversaciones: ordenadas,
      ultimaActividad: ordenadas[0]?.fecha ?? null,
      activas: ordenadas.filter((c) => c.activa).length,
      noLeido: ordenadas.some((c) => c.noLeido),
    };
  });

  return contactos.sort((a, b) => new Date(b.ultimaActividad ?? 0) - new Date(a.ultimaActividad ?? 0));
}

// Detalle de un contacto (N-34 › /mensajes/:contactoId). Reconsulta en vez de
// arrastrar el resultado de la lista por el router: así la pantalla funciona
// también con deep link o tras recargar, que es como llegan las
// notificaciones. Cuesta lo mismo que la lista.
export async function fetchConversacionesConContacto(perfilId, rol, contactoId) {
  const contactos = await fetchContactosConMensajes(perfilId, rol);
  return contactos.find((c) => c.id === contactoId) ?? null;
}
