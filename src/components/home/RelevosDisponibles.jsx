import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui';
import SolicitudCard from '../../screens/n30-cobertura-servicio/SolicitudCard';
import { fetchSolicitudesAbiertas, filtrarSolicitudesPorZona } from '../../lib/coberturaServicio';

// Vista previa del tablón de MUVET Relevo (/cobertura-servicio → "Disponibles")
// en el Home. Tercera hermana de OfertasRecientes (MUVET Turnos) y
// ApoyoDisponibles (MUVET Auxiliar): era el único de los tres módulos gremiales
// cuyo tablón no se veía desde la Home — solo se llegaba por el acceso rápido o
// por la barra inferior.
//
// ⚠️ `cobertura` es el identificador interno de lo que la UI llama MUVET
// Relevo. Ver lib/nombresModulos.js.
//
// Es una vista de ENTRADA, no el tablón: sin acciones, el clic lleva al módulo
// con la pestaña ya abierta. Ofrecerse a cubrir sigue viviendo allá, donde está
// el detalle completo del servicio.
//
// Módulo exclusivo del médico (médico↔médico), así que solo lo monta N-2; N-28
// (auxiliar y clínica) no lo incluye.
const MAX_ITEMS = 3;

export default function RelevosDisponibles({ perfil }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;
    setLoading(true);
    fetchSolicitudesAbiertas(perfil.id)
      .then((data) => {
        if (!activo) return;
        setItems(filtrarSolicitudesPorZona(data, perfil.zona_cobertura).slice(0, MAX_ITEMS));
      })
      .catch(() => {
        // El Home no debe romperse por el tablón: si falla, la sección queda
        // vacía y /cobertura-servicio sigue siendo alcanzable.
        if (activo) setItems([]);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil?.id, perfil?.zona_cobertura]);

  const irAlTablon = () => navigate('/cobertura-servicio?tab=disponibles');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Relevos disponibles</p>
        <button type="button" onClick={irAlTablon} className="text-[12px] font-medium text-[#1A7A5E]">
          Ver todos →
        </button>
      </div>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && items.length === 0 && (
        <Card>
          <p className="text-[13px] text-[#5A6B7A]">
            {perfil.zona_cobertura
              ? 'Sin servicios por relevar en tu zona.'
              : 'Sin servicios por relevar por ahora.'}
          </p>
        </Card>
      )}

      {!loading &&
        items.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={irAlTablon}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') irAlTablon();
            }}
          >
            <SolicitudCard solicitud={s} />
          </div>
        ))}
    </div>
  );
}
