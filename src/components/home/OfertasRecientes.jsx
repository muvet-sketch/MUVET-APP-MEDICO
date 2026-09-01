import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Avatar } from '../ui';
import { formatCOP, truncarTexto } from '../../lib/format';
import { fetchPublicacionesActivas, filtrarPublicacionesPorZona, formatFranjaHoraria } from '../../lib/relevo';

// Vista previa de MUVET Turnos en el Home. Vivía en screens/n2-home, pero
// desde la reorganización de los Home la comparten los tres roles (N-2 para el
// médico, N-28 para auxiliar y clínica), así que subió a components/home.
//
// Mismo conjunto que se ve en /relevo → pestaña "Ofertas": publicaciones
// activas dirigidas a su rol, excluyendo las propias y filtradas por la zona
// de cobertura del perfil (filtrarPublicacionesPorZona, compartido con
// TabOfertas). Es una vista de entrada, no el tablón: sin acciones, el clic
// lleva a MUVET Turnos.
const MAX_OFERTAS = 3;

const ACTOR_BADGE = {
  clinica: { label: '🏥 Clínica', tone: 'info' },
  auxiliar: { label: '🧰 Auxiliar', tone: 'neutral' },
  medico: { label: '🩺 Médico', tone: 'neutral' },
};

export default function OfertasRecientes({ perfil }) {
  const navigate = useNavigate();
  const [ofertas, setOfertas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    setLoading(true);
    fetchPublicacionesActivas({ paraRol: perfil.rol })
      .then((data) => {
        if (!active) return;
        const ajenas = data.filter((p) => p.autor_id !== perfil.id);
        setOfertas(filtrarPublicacionesPorZona(ajenas, perfil.zona_cobertura).slice(0, MAX_OFERTAS));
      })
      .catch(() => {
        // La Home no debe romperse por el tablón de Turnos: si falla, la
        // sección queda vacía y el usuario igual puede entrar a /relevo.
        if (active) setOfertas([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id, perfil?.rol, perfil?.zona_cobertura]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Ofertas recientes</p>
        <button
          type="button"
          onClick={() => navigate('/relevo?tab=ofertas')}
          className="text-[12px] font-medium text-[#1A7A5E]"
        >
          Ver todas →
        </button>
      </div>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && ofertas.length === 0 && (
        <Card>
          <p className="text-[13px] text-[#5A6B7A]">
            {perfil.zona_cobertura ? 'Sin ofertas nuevas en tu zona.' : 'Sin ofertas activas por ahora.'}
          </p>
        </Card>
      )}

      {!loading &&
        ofertas.map((p) => {
          const badge = ACTOR_BADGE[p.autor?.rol] ?? ACTOR_BADGE.medico;
          const nombreAutor = p.autor?.razon_social || p.autor?.nombre_completo || 'Usuario MUVET';
          const detalle = [p.zona, p.tipo_jornada, formatFranjaHoraria(p)].filter(Boolean).join(' · ');
          return (
            <Card key={p.id} className="cursor-pointer">
              <button
                type="button"
                onClick={() => navigate('/relevo?tab=ofertas')}
                className="flex w-full flex-col gap-1 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      fotoUrl={p.autor?.foto_url}
                      nombre={nombreAutor}
                      rol={p.autor?.rol}
                      semilla={p.autor?.id}
                      size={28}
                    />
                    <p className="text-[14px] font-medium text-[#0A1628]">{nombreAutor}</p>
                  </div>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                <p className="text-[12px] text-[#0A1628]">
                  {truncarTexto(p.descripcion || '(sin descripción)', 80)}
                </p>
                {detalle && <p className="text-[11px] text-[#5A6B7A]">{detalle}</p>}
                {p.tarifa != null && <p className="text-[13px] font-semibold text-[#1A7A5E]">{formatCOP(p.tarifa)}</p>}
              </button>
            </Card>
          );
        })}
    </div>
  );
}
