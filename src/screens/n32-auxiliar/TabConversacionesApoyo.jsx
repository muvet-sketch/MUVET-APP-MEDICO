import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import { fetchMisConversacionesApoyo, labelSubtipo, tieneNoLeidosApoyo } from '../../lib/apoyo';

// Bandeja de N-32: mis conversaciones de los dos lados, ordenadas por
// actividad. Espejo de n26-relevo/TabConversaciones.jsx.

const ESTADO_BADGE = {
  abierta: { label: 'En conversación', tone: 'info' },
  aceptada: { label: 'Servicio confirmado', tone: 'ok' },
  finalizada: { label: 'Finalizado', tone: 'neutral' },
  descartada: { label: 'Descartada', tone: 'critical' },
};

// "En curso" agrupa abierta + aceptada porque son los dos estados en los que
// el chat sigue vivo: es lo que hay que atender.
const FILTROS = [
  { value: 'curso', label: 'En curso' },
  { value: 'cerradas', label: 'Cerradas' },
  { value: '', label: 'Todas' },
];

export default function TabConversacionesApoyo({ perfil }) {
  const navigate = useNavigate();
  const [conversaciones, setConversaciones] = useState([]);
  const [filtro, setFiltro] = useState('curso');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;
    fetchMisConversacionesApoyo(perfil.id)
      .then((data) => {
        if (activo) setConversaciones(data);
      })
      .catch(() => {
        if (activo) setConversaciones([]);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil?.id]);

  if (loading) {
    return <p className="px-5 py-5 text-[12px] text-[#5A6B7A]">Cargando…</p>;
  }

  const visibles = conversaciones.filter((c) => {
    if (filtro === 'curso') return c.estado === 'abierta' || c.estado === 'aceptada';
    if (filtro === 'cerradas') return c.estado === 'finalizada' || c.estado === 'descartada';
    return true;
  });

  return (
    <div className="flex flex-col gap-3 px-5 py-4 pb-24">
      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltro(f.value)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium ${
              filtro === f.value
                ? 'border-[#1A7A5E] bg-[#1A7A5E] text-white'
                : 'border-[#E1E8ED] bg-white text-[#5A6B7A]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visibles.length === 0 && (
        <Card className="text-center text-[13px] text-[#5A6B7A]">
          No tienes conversaciones acá todavía.
        </Card>
      )}

      {visibles.map((c) => {
        const badge = ESTADO_BADGE[c.estado] ?? ESTADO_BADGE.abierta;
        const nombreOtro = c.otro?.nombre_completo || c.otro?.razon_social || 'Usuario MUVET';
        const noLeidos = tieneNoLeidosApoyo(c, perfil.id);
        return (
          <button key={c.id} type="button" onClick={() => navigate(`/apoyo/conversacion/${c.id}`)} className="text-left">
            <Card className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-[#0A1628]">
                  {noLeidos && <span className="h-2 w-2 shrink-0 rounded-full bg-[#C63B3B]" aria-label="Sin leer" />}
                  {nombreOtro}
                </p>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </div>
              <p className="text-[12px] text-[#5A6B7A]">{labelSubtipo(c.servicio_subtipo)}</p>
              <p className="text-[13px] text-[#0A1628]">
                {c.publicacion?.descripcion || '(sin descripción)'}
              </p>
              <p className="text-[11px] text-[#5A6B7A]">{formatFechaCorta(c.ultimo_mensaje_at)}</p>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
