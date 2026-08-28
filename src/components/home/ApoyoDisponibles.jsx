import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui';
import PublicacionApoyoCard from '../../screens/n32-auxiliar/PublicacionApoyoCard';
import { fetchPublicacionesDisponibles, filtrarPorZona } from '../../lib/apoyo';

// Vista previa del tablón de MUVET Auxiliar (/apoyo → "Disponibles") en el
// Home. Espejo de OfertasRecientes, que hace lo propio con MUVET Turnos.
//
// Un solo componente para los dos roles que participan en el módulo: cada uno
// ve el tipo complementario y eso ya lo resuelve fetchPublicacionesDisponibles
// (TIPO_QUE_BUSCA_POR_ROL). Aquí solo cambian dos textos.
//
//   médico   → publicaciones 'ofrezco' de auxiliares  → "Auxiliares disponibles"
//   auxiliar → publicaciones 'busco' de médicos       → "Médicos buscando apoyo"
//
// La clínica no participa en el módulo; las dos Home no lo montan para ella.
const MAX_ITEMS = 3;

export default function ApoyoDisponibles({ perfil }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;
    setLoading(true);
    fetchPublicacionesDisponibles({ paraRol: perfil.rol, excluirAutorId: perfil.id })
      .then((data) => {
        if (!activo) return;
        setItems(filtrarPorZona(data, perfil.zona_cobertura).slice(0, MAX_ITEMS));
      })
      .catch(() => {
        // El Home no debe romperse por el tablón: si falla, la sección queda
        // vacía y /apoyo sigue siendo alcanzable.
        if (activo) setItems([]);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil?.id, perfil?.rol, perfil?.zona_cobertura]);

  const esMedico = perfil.rol === 'medico';
  const titulo = esMedico ? 'Auxiliares disponibles' : 'Médicos buscando apoyo';
  const queHay = esMedico ? 'auxiliares disponibles' : 'médicos buscando apoyo';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">{titulo}</p>
        <button
          type="button"
          onClick={() => navigate('/apoyo?tab=disponibles')}
          className="text-[12px] font-medium text-[#1A7A5E]"
        >
          Ver todas →
        </button>
      </div>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && items.length === 0 && (
        <Card>
          <p className="text-[13px] text-[#5A6B7A]">
            {perfil.zona_cobertura ? `Sin ${queHay} en tu zona.` : `Sin ${queHay} por ahora.`}
          </p>
        </Card>
      )}

      {!loading &&
        items.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => navigate('/apoyo?tab=disponibles')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/apoyo?tab=disponibles');
            }}
          >
            <PublicacionApoyoCard publicacion={p} />
          </div>
        ))}
    </div>
  );
}
