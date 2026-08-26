import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge } from '../ui';
import { formatFechaCorta, truncarTexto } from '../../lib/format';
import { fetchHistorialUnificado } from '../../lib/historialUnificado';
import { ICONO_RELEVO, ICONO_TURNOS } from '../../lib/nombresModulos';

// Vista previa del historial único (N-9) en el Home de los tres roles: los
// últimos eventos terminados, con el detalle completo a un clic de distancia.
//
// No reutiliza ItemHistorial (screens/n9-historial): esa tarjeta está hecha
// para la pantalla completa — la de Cobertura reutiliza SolicitudCard, que son
// seis u ocho líneas por ítem, y la de conversación trae su propio botón "Ver
// conversación →" que chocaría con el clic de la fila. Aquí cada evento es una
// fila compacta y la fila entera lleva a /historial.
const MAX_EVENTOS = 3;

const ORIGEN_ICONO = {
  cobertura: ICONO_RELEVO,
  relevo_oferta: ICONO_TURNOS,
  relevo_conversacion: ICONO_TURNOS,
};

// Mismos estados terminales que pinta ItemHistorial, resumidos a una etiqueta
// corta que quepa junto al título en 390px.
const ESTADO_BADGE = {
  finalizada: { label: 'Finalizada', tone: 'ok' },
  cancelada: { label: 'Cancelada', tone: 'critical' },
  aceptada: { label: 'Acuerdo', tone: 'ok' },
  descartada: { label: 'Descartada', tone: 'critical' },
};

// Cada origen guarda su fila cruda en `raw`, con forma distinta según la
// tabla de la que salió.
function tituloDe(item) {
  const { origen, raw } = item;
  if (origen === 'cobertura') return raw.tipo_servicio || 'Servicio';
  if (origen === 'relevo_oferta') return raw.descripcion || '(sin descripción)';
  return raw.otro?.razon_social || raw.otro?.nombre_completo || 'Usuario MUVET';
}

export default function HistorialReciente({ perfil }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    setLoading(true);
    fetchHistorialUnificado(perfil.id, { limite: MAX_EVENTOS })
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        // Igual que OfertasRecientes: el Home no se rompe porque falle una de
        // las tres fuentes del historial; la sección queda vacía y /historial
        // sigue siendo alcanzable.
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Historial</p>
        <button
          type="button"
          onClick={() => navigate('/historial')}
          className="text-[12px] font-medium text-[#1A7A5E]"
        >
          Ver todo →
        </button>
      </div>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && items.length === 0 && (
        <Card>
          <p className="text-[13px] text-[#5A6B7A]">Todavía no tienes actividad finalizada.</p>
        </Card>
      )}

      {!loading &&
        items.map((item) => {
          const badge = ESTADO_BADGE[item.raw.estado] ?? { label: item.raw.estado, tone: 'neutral' };
          return (
            <Card key={item.id} className="cursor-pointer">
              <button
                type="button"
                onClick={() => navigate('/historial')}
                className="flex w-full flex-col gap-1 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-medium text-[#0A1628]">
                    <span aria-hidden="true">{ORIGEN_ICONO[item.origen]} </span>
                    {truncarTexto(tituloDe(item), 40)}
                  </p>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                {item.fecha && <p className="text-[11px] text-[#5A6B7A]">{formatFechaCorta(item.fecha)}</p>}
              </button>
            </Card>
          );
        })}
    </div>
  );
}
