import { Card, Badge } from '../../components/ui';
import { formatCOP } from '../../lib/format';
import { formatFechaApoyo, formatFranjaApoyo, labelSubtipo } from '../../lib/apoyo';

// Tarjeta compartida por el tablón y "Mi publicación" (N-32).
// Espejo de n30-cobertura-servicio/SolicitudCard.jsx.

const ESTADO_BADGE = {
  abierta: { label: 'Abierta', tone: 'info' },
  cancelada: { label: 'Cancelada', tone: 'critical' },
  finalizada: { label: 'Finalizada', tone: 'neutral' },
};

export default function PublicacionApoyoCard({ publicacion, children }) {
  const p = publicacion;
  const nombreAutor = p.autor?.nombre_completo || p.autor?.razon_social;
  const fecha = formatFechaApoyo(p);
  const franja = formatFranjaApoyo(p);
  const badge = ESTADO_BADGE[p.estado] ?? ESTADO_BADGE.abierta;

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#0A1628]">
          {p.tipo === 'ofrezco' ? '🧰 Auxiliar disponible' : `🩺 ${labelSubtipo(p.servicio_subtipo)}`}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {!p.activa && p.estado === 'abierta' && <Badge tone="neutral">Pausada</Badge>}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </div>

      {nombreAutor && <p className="text-[12px] text-[#5A6B7A]">{nombreAutor}</p>}

      {p.descripcion && <p className="text-[13px] text-[#0A1628]">{p.descripcion}</p>}

      <p className="text-[12px] text-[#5A6B7A]">
        {p.zona ? `📍 ${p.zona}` : 'Sin zona'}
        {fecha ? ` · ${fecha}` : ''}
        {franja ? ` · ${franja}` : ''}
      </p>

      {p.tarifa != null && (
        <p className="text-[13px] font-semibold text-[#1A7A5E]">{formatCOP(p.tarifa)}</p>
      )}

      {children}
    </Card>
  );
}
