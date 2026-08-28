import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Toast } from '../ui';
import MiPublicacionCard from './MiPublicacionCard';
import { formatFechaCorta } from '../../lib/format';
import {
  ICONO_AUXILIAR,
  ICONO_RELEVO,
  ICONO_TURNOS,
  NOMBRE_AUXILIAR,
  NOMBRE_TURNOS,
} from '../../lib/nombresModulos';
import {
  fetchMisPublicaciones,
  activarPublicacion,
  desactivarPublicacion,
  formatFranjaHoraria,
} from '../../lib/relevo';
import {
  fetchMisPublicacionesApoyo,
  activarPublicacionApoyo,
  desactivarPublicacionApoyo,
  participaEnApoyo,
  labelSubtipo,
  formatFechaApoyo,
  formatFranjaApoyo,
} from '../../lib/apoyo';
import { fetchMisSolicitudesActivas, formatFechaHoraServicio } from '../../lib/coberturaServicio';

// "Mis publicaciones" en el Home de los tres roles: lo que YO tengo publicado
// en los módulos gremiales, con la información completa y el interruptor de
// publicada/pausada acá mismo — antes había que entrar al módulo para verlo.
//
// Las tres fuentes tienen columnas distintas, así que cada una se normaliza a
// una misma forma de fila y se pinta con MiPublicacionCard. Qué se consulta
// depende del rol:
//
//   MUVET Turnos    (relevo_publicaciones)   → los tres roles      · con toggle
//   MUVET Auxiliar  (apoyo_publicaciones)    → médico y auxiliar   · con toggle
//   MUVET Relevo    (cobertura_solicitudes)  → solo médico         · solo lectura
//
// MUVET Relevo va sin toggle a propósito: una solicitud de relevo no tiene
// estado publicada/pausada — está abierta, en negociación ('propuesta', 0034) o
// es terminal.
//
// ⚠️ Los nombres visibles de los módulos NO coinciden con sus rutas ni con sus
// tablas. Ver lib/nombresModulos.js antes de tocar nada de esto.

// Las columnas `date` llegan como 'YYYY-MM-DD' y sin hora explícita el parser
// las toma como UTC, con lo que en Colombia se pintan un día antes. Mismo
// criterio que formatFechaApoyo en lib/apoyo.js.
function formatFechaDia(valor) {
  return valor ? formatFechaCorta(`${valor}T00:00:00`) : '';
}

// Solo lo vigente: cancelada/finalizada ya viven en el historial (N-9). Las
// publicaciones anteriores a la migración 0018 no tienen `estado`.
function esVigente(p) {
  return !p.estado || p.estado === 'abierta';
}

function desdeTurnos(p) {
  const inicio = formatFechaDia(p.fecha_inicio);
  const fin = formatFechaDia(p.fecha_fin);
  return {
    key: `turnos-${p.id}`,
    modulo: 'turnos',
    id: p.id,
    icono: ICONO_TURNOS,
    titulo:
      p.tipo === 'ofrezco'
        ? 'Ofrezco disponibilidad'
        : `Busco ${p.rol_objetivo === 'auxiliar' ? 'auxiliar' : 'médico'}`,
    descripcion: p.descripcion || '',
    zona: p.zona || '',
    fechaTexto: fin && fin !== inicio ? `${inicio}–${fin}` : inicio,
    franjaTexto: [p.tipo_jornada, formatFranjaHoraria(p)].filter(Boolean).join(' · '),
    tarifa: p.tarifa,
    activa: p.activa,
    soportaToggle: true,
    editarTo: '/relevo?tab=mi-oferta',
  };
}

function desdeApoyo(p) {
  return {
    key: `apoyo-${p.id}`,
    modulo: 'apoyo',
    id: p.id,
    icono: ICONO_AUXILIAR,
    titulo: p.tipo === 'ofrezco' ? 'Auxiliar disponible' : labelSubtipo(p.servicio_subtipo) || 'Busco apoyo',
    descripcion: p.descripcion || '',
    zona: p.zona || '',
    fechaTexto: formatFechaApoyo(p),
    franjaTexto: formatFranjaApoyo(p),
    tarifa: p.tarifa,
    activa: p.activa,
    soportaToggle: true,
    editarTo: '/apoyo?tab=mi-publicacion',
  };
}

function desdeRelevo(s) {
  // 0034: con una propuesta viva lo accionable es el chat —hay que confirmar—,
  // así que la fila lleva ahí en vez de al tablón del módulo.
  const enNegociacion = s.estado === 'propuesta';
  return {
    key: `relevo-${s.id}`,
    modulo: 'relevo',
    id: s.id,
    icono: ICONO_RELEVO,
    titulo: s.tipo_servicio || 'Servicio',
    descripcion: enNegociacion
      ? `⏳ ${s.cobertura?.nombre_completo || 'Otro médico'} se ofreció · falta confirmar`
      : s.descripcion || '',
    zona: s.zona || '',
    fechaTexto: formatFechaHoraServicio(s),
    franjaTexto: '',
    tarifa: null,
    activa: undefined,
    soportaToggle: false,
    badgeLabel: enNegociacion ? 'Por confirmar' : 'Abierta',
    badgeTone: enNegociacion ? 'alert' : 'info',
    nota: enNegociacion ? 'Falta que ambos confirmen' : 'Esperando quién la releve',
    ctaLabel: enNegociacion ? 'Confirmar' : 'Editar',
    editarTo: enNegociacion ? `/cobertura-servicio/chat/${s.id}` : '/cobertura-servicio?tab=mis-solicitudes',
  };
}

function valorDe(resultado) {
  return resultado.status === 'fulfilled' ? resultado.value ?? [] : [];
}

export default function MisPublicaciones({ perfil, mostrarToast }) {
  const navigate = useNavigate();
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendiente, setPendiente] = useState(null);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  // La Home del médico ya tiene su propio Toast; la de auxiliar/clínica no, así
  // que el componente trae uno de respaldo para no obligar a cablearlo.
  const notificar = useCallback(
    (message, tone = 'ok') => {
      if (mostrarToast) {
        mostrarToast(message, tone);
        return;
      }
      setToast({ message, tone, visible: true });
      setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
    },
    [mostrarToast],
  );

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;
    setLoading(true);

    const conApoyo = participaEnApoyo(perfil.rol);
    const esMedico = perfil.rol === 'medico';

    // allSettled y no all: que una fuente falle no debe vaciar la sección
    // entera, mismo criterio que OfertasRecientes e HistorialReciente.
    Promise.allSettled([
      fetchMisPublicaciones(perfil.id),
      conApoyo ? fetchMisPublicacionesApoyo(perfil.id) : Promise.resolve([]),
      esMedico ? fetchMisSolicitudesActivas(perfil.id) : Promise.resolve([]),
    ])
      .then(([turnos, apoyo, relevo]) => {
        if (!activo) return;
        setFilas([
          ...valorDe(turnos).filter(esVigente).map(desdeTurnos),
          ...valorDe(apoyo).filter(esVigente).map(desdeApoyo),
          // fetchMisSolicitudesActivas trae también las que estoy relevando yo:
          // esas no son "mis publicaciones", son trabajo aceptado. 'cubierta'
          // tampoco entra: eso ya vive en "Servicios aceptados".
          ...valorDe(relevo)
            .filter((s) => s.autor_id === perfil.id && ['abierta', 'propuesta'].includes(s.estado))
            .map(desdeRelevo),
        ]);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [perfil?.id, perfil?.rol]);

  // 0015: al activar, médico y auxiliar recopian las habilidades de su perfil
  // sobre la publicación. La clínica no (las suyas son expectativas sobre el
  // candidato, no propias). Mismo argumento que pasa TabMiOferta.
  function habilidadesArg() {
    if (perfil.rol === 'clinica') return null;
    return {
      profesionales: perfil.habilidades_profesionales ?? [],
      personales: perfil.habilidades_personales ?? [],
    };
  }

  async function handleToggle(fila, siguiente) {
    setPendiente(fila.key);
    setFilas((fs) => fs.map((f) => (f.key === fila.key ? { ...f, activa: siguiente } : f)));
    try {
      if (fila.modulo === 'turnos') {
        if (siguiente) await activarPublicacion(fila.id, perfil.id, habilidadesArg());
        else await desactivarPublicacion(fila.id, perfil.id);
      } else {
        if (siguiente) await activarPublicacionApoyo(fila.id, perfil.id);
        else await desactivarPublicacionApoyo(fila.id, perfil.id);
      }
    } catch (err) {
      // activarPublicacion rechaza si los cupos están llenos o la oferta ya es
      // terminal: se revierte el cambio optimista y se explica.
      setFilas((fs) => fs.map((f) => (f.key === fila.key ? { ...f, activa: !siguiente } : f)));
      notificar(err.message ?? 'No se pudo actualizar la publicación.', 'critical');
    } finally {
      setPendiente(null);
    }
  }

  if (!perfil) return null;

  const conApoyo = participaEnApoyo(perfil.rol);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] font-semibold text-[#0A1628]">Mis publicaciones</p>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && filas.length === 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-[13px] text-[#5A6B7A]">Todavía no tienes publicaciones abiertas.</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/relevo?tab=mi-oferta')}
              className="text-[12px] font-medium text-[#1A7A5E]"
            >
              {`Publicar en ${NOMBRE_TURNOS} →`}
            </button>
            {conApoyo && (
              <button
                type="button"
                onClick={() => navigate('/apoyo?tab=mi-publicacion')}
                className="text-[12px] font-medium text-[#1A7A5E]"
              >
                {`Publicar en ${NOMBRE_AUXILIAR} →`}
              </button>
            )}
          </div>
        </Card>
      )}

      {!loading &&
        filas.map((fila) => (
          <MiPublicacionCard
            key={fila.key}
            fila={fila}
            onToggle={handleToggle}
            toggling={pendiente === fila.key}
          />
        ))}

      {!mostrarToast && <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />}
    </div>
  );
}
