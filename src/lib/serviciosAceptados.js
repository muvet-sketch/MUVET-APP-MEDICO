import { fetchMisConversaciones, fetchFichaContacto } from './relevo';
import { fetchMisConversacionesApoyo, fetchDireccionEncuentro, labelSubtipo } from './apoyo';
import { CORTO_AUXILIAR, CORTO_TURNOS, ICONO_AUXILIAR, ICONO_TURNOS } from './nombresModulos';

// Servicios acordados y todavía en curso, agregados de los dos módulos que
// tienen acuerdo mutuo (0028). Es la fuente de la sección "Servicios
// aceptados" del Home de los tres roles.
//
// Espejo de lib/historialUnificado.js, pero al revés: aquel junta lo que ya
// TERMINÓ, este lo que está EN CURSO. La frontera es exactamente el estado
// 'aceptada' — que desde 0028 ya no es terminal en ninguno de los dos módulos:
// un acuerdo abre el servicio, no lo cierra.
//
//   apoyo_conversaciones  estado='aceptada'  → dirección de encuentro
//   relevo_conversaciones estado='aceptada'  → dirección de sede de la clínica
//
// En ambos casos la dirección la decide el BACKEND: llega o no llega según las
// policies de 0028. Acá no se filtra nada por estado — si el servidor no la
// manda, la tarjeta simplemente no la muestra.
//
// Cobertura (N-30) queda fuera a propósito: no tiene acuerdo mutuo ni
// dirección estructurada, y su chat se autodestruye al finalizar.

function nombreDe(conversacion) {
  return (
    conversacion.otro?.razon_social ||
    conversacion.otro?.nombre_completo ||
    'Usuario MUVET'
  );
}

export async function fetchServiciosAceptados(perfilId) {
  if (!perfilId) return [];

  const [conversacionesRelevo, conversacionesApoyo] = await Promise.all([
    fetchMisConversaciones(perfilId),
    fetchMisConversacionesApoyo(perfilId),
  ]);

  const relevoAceptadas = conversacionesRelevo.filter((c) => c.estado === 'aceptada');
  const apoyoAceptadas = conversacionesApoyo.filter((c) => c.estado === 'aceptada');

  // Una petición de dirección por servicio aceptado. Son pocos por definición
  // (lo que tienes en curso), así que no hace falta paginar ni agrupar.
  const [direccionesApoyo, fichasRelevo] = await Promise.all([
    Promise.all(
      apoyoAceptadas.map((c) =>
        fetchDireccionEncuentro(c.id).catch(() => null),
      ),
    ),
    Promise.all(
      relevoAceptadas.map((c) =>
        c.otro?.id ? fetchFichaContacto(c.otro.id).catch(() => null) : Promise.resolve(null),
      ),
    ),
  ]);

  const items = [
    ...apoyoAceptadas.map((c, i) => ({
      id: `apoyo-${c.id}`,
      origen: 'apoyo',
      modulo: CORTO_AUXILIAR,
      icono: ICONO_AUXILIAR,
      titulo: nombreDe(c),
      subtitulo: labelSubtipo(c.servicio_subtipo),
      direccion: direccionesApoyo[i]?.direccion_encuentro ?? null,
      referencia: direccionesApoyo[i]?.referencia ?? null,
      fecha: c.aceptada_at ?? c.ultimo_mensaje_at,
      to: `/apoyo/conversacion/${c.id}`,
    })),

    ...relevoAceptadas.map((c, i) => ({
      id: `relevo-${c.id}`,
      origen: 'relevo',
      modulo: CORTO_TURNOS,
      icono: ICONO_TURNOS,
      titulo: nombreDe(c),
      subtitulo: c.publicacion?.descripcion || '(sin descripción)',
      // Solo la clínica tiene sede; entre médico y auxiliar no hay dirección
      // que compartir en este módulo, y la zona de la oferta hace de referencia.
      direccion: fichasRelevo[i]?.direccion_sede ?? null,
      referencia: c.publicacion?.zona ?? null,
      fecha: c.aceptada_at ?? c.ultimo_mensaje_at,
      to: `/relevo/conversacion/${c.id}`,
    })),
  ];

  return items.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0));
}
