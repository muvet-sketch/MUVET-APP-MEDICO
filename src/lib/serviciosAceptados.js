import { fetchMisConversaciones, fetchFichaContacto } from './relevo';
import { fetchMisConversacionesApoyo, fetchDireccionEncuentro, labelSubtipo } from './apoyo';
import { fetchMisSolicitudesActivas, fetchDireccionCobertura } from './coberturaServicio';
import {
  CORTO_AUXILIAR,
  CORTO_RELEVO,
  CORTO_TURNOS,
  ICONO_AUXILIAR,
  ICONO_RELEVO,
  ICONO_TURNOS,
} from './nombresModulos';

// Servicios acordados y todavía en curso, agregados de los TRES módulos
// gremiales. Es la fuente de la sección "Servicios aceptados" del Home de los
// tres roles.
//
// Espejo de lib/historialUnificado.js, pero al revés: aquel junta lo que ya
// TERMINÓ, este lo que está EN CURSO. La frontera es el estado en que el
// servicio queda cerrado con la otra parte pero todavía no se prestó:
//
//   apoyo_conversaciones   estado='aceptada' → dirección de encuentro
//   relevo_conversaciones  estado='aceptada' → dirección de la sede de la oferta
//   cobertura_solicitudes  estado='cubierta' → dirección de encuentro
//
// En los tres casos la dirección la decide el BACKEND: llega o no llega según
// las policies. Acá no se filtra nada por estado — si el servidor no la manda,
// la tarjeta simplemente no la muestra.
//
// 0032: MUVET Relevo (cobertura, N-30) ENTRA a esta lista. Antes quedaba fuera
// porque no tenía dirección estructurada y su chat se autodestruía al
// finalizar; ahora tiene `cobertura_direccion`, que además sobrevive a esa
// destrucción.
//
// 0034: su 'cubierta' pasó a significar exactamente lo mismo que 'aceptada' en
// los otros dos — acuerdo de LAS DOS partes (`acuerdo_autor` +
// `acuerdo_cobertura`), no "alguien se ofreció". Antes esta lista mostraba
// servicios que el autor todavía no había aceptado; ahora los tres módulos
// entran con el mismo criterio.

function nombreDe(conversacion) {
  return (
    conversacion.otro?.razon_social ||
    conversacion.otro?.nombre_completo ||
    'Usuario MUVET'
  );
}

export async function fetchServiciosAceptados(perfilId) {
  if (!perfilId) return [];

  // Cada fuente falla sola: un módulo caído (o un rol que no tiene acceso a él,
  // como el auxiliar con N-30) deja la sección sin sus ítems, no rota.
  const [conversacionesRelevo, conversacionesApoyo, solicitudesCobertura] = await Promise.all([
    fetchMisConversaciones(perfilId).catch(() => []),
    fetchMisConversacionesApoyo(perfilId).catch(() => []),
    fetchMisSolicitudesActivas(perfilId).catch(() => []),
  ]);

  const relevoAceptadas = conversacionesRelevo.filter((c) => c.estado === 'aceptada');
  const apoyoAceptadas = conversacionesApoyo.filter((c) => c.estado === 'aceptada');
  const coberturaTomadas = solicitudesCobertura.filter((s) => s.estado === 'cubierta');

  // Una petición de dirección por servicio aceptado. Son pocos por definición
  // (lo que tienes en curso), así que no hace falta paginar ni agrupar.
  const [direccionesApoyo, fichasRelevo, direccionesCobertura] = await Promise.all([
    Promise.all(apoyoAceptadas.map((c) => fetchDireccionEncuentro(c.id).catch(() => null))),
    Promise.all(
      relevoAceptadas.map((c) =>
        c.otro?.id ? fetchFichaContacto(c.otro.id).catch(() => null) : Promise.resolve(null),
      ),
    ),
    Promise.all(coberturaTomadas.map((s) => fetchDireccionCobertura(s.id).catch(() => null))),
  ]);

  const items = [
    ...apoyoAceptadas.map((c, i) => ({
      id: `apoyo-${c.id}`,
      origen: 'apoyo',
      modulo: CORTO_AUXILIAR,
      icono: ICONO_AUXILIAR,
      titulo: nombreDe(c),
      // Solo MUVET Turnos tiene clínicas (y `perfiles_publico` solo expone el
      // logo para rol 'clinica', 0035); en los otros dos módulos no hay logo.
      fotoUrl: null,
      subtitulo: labelSubtipo(c.servicio_subtipo),
      direccion: direccionesApoyo[i]?.direccion_encuentro ?? null,
      referencia: direccionesApoyo[i]?.referencia ?? null,
      linkMaps: null,
      fecha: c.aceptada_at ?? c.ultimo_mensaje_at,
      to: `/apoyo/conversacion/${c.id}`,
    })),

    ...relevoAceptadas.map((c, i) => ({
      id: `relevo-${c.id}`,
      origen: 'relevo',
      modulo: CORTO_TURNOS,
      icono: ICONO_TURNOS,
      titulo: nombreDe(c),
      // Logo de la clínica (0035): `perfiles_publico` lo trae solo para rol
      // 'clinica'; entre médico y auxiliar llega null y el avatar cae a iniciales.
      fotoUrl: c.otro?.foto_url ?? null,
      subtitulo: c.publicacion?.descripcion || '(sin descripción)',
      // 0030: la dirección sale de la SEDE que eligió la oferta, no del perfil.
      // Solo la clínica tiene sede; entre médico y auxiliar no hay dirección
      // que compartir en este módulo, y la zona de la oferta hace de referencia.
      direccion: fichasRelevo[i]?.direccion_sede ?? null,
      referencia: fichasRelevo[i]?.sede_etiqueta ?? c.publicacion?.zona ?? null,
      linkMaps: fichasRelevo[i]?.sede_link_maps ?? null,
      fecha: c.aceptada_at ?? c.ultimo_mensaje_at,
      to: `/relevo/conversacion/${c.id}`,
    })),

    ...coberturaTomadas.map((s, i) => ({
      id: `cobertura-${s.id}`,
      origen: 'cobertura',
      modulo: CORTO_RELEVO,
      icono: ICONO_RELEVO,
      titulo:
        (s.autor_id === perfilId ? s.cobertura?.nombre_completo : s.autor?.nombre_completo) ||
        'Usuario MUVET',
      fotoUrl: null,
      subtitulo: s.tipo_servicio || '(sin tipo de servicio)',
      direccion: direccionesCobertura[i]?.direccion_encuentro ?? null,
      referencia: direccionesCobertura[i]?.referencia ?? s.zona ?? null,
      linkMaps: direccionesCobertura[i]?.link_maps ?? null,
      fecha: s.cubierta_at ?? s.created_at,
      to: `/cobertura-servicio/chat/${s.id}`,
    })),
  ];

  return items.sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0));
}
