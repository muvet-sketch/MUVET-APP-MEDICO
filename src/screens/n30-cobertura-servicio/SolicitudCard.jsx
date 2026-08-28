import { Card, Badge } from '../../components/ui';
import { formatFechaHoraServicio } from '../../lib/coberturaServicio';

const ESTADO_BADGE = {
  abierta: { label: 'Abierta', tone: 'alert' },
  // 0034: alguien se ofreció y falta que las dos partes confirmen.
  propuesta: { label: 'Por confirmar', tone: 'info' },
  cubierta: { label: 'Confirmada · servicio en curso', tone: 'ok' },
  finalizada: { label: 'Finalizada', tone: 'ok' },
  cancelada: { label: 'Cancelada', tone: 'critical' },
};

// Tarjeta compartida entre las 3 pestañas (Disponibles / Mis Solicitudes /
// Historial) con el detalle del servicio: tipo, zona/perímetro, especie,
// raza, temperamento — los campos pedidos para que quien vaya a cubrir sepa
// a qué se enfrenta antes de ofrecerse.
export default function SolicitudCard({ solicitud, children }) {
  const estadoBadge = ESTADO_BADGE[solicitud.estado];
  const detalles = [
    solicitud.especie,
    solicitud.raza,
    solicitud.temperamento && `Temperamento: ${solicitud.temperamento}`,
  ].filter(Boolean);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#0A1628]">{solicitud.tipo_servicio}</p>
        {estadoBadge && <Badge tone={estadoBadge.tone}>{estadoBadge.label}</Badge>}
      </div>

      <p className="text-[12px] text-[#5A6B7A]">{formatFechaHoraServicio(solicitud)}</p>
      {solicitud.zona && <p className="text-[12px] text-[#5A6B7A]">📍 {solicitud.zona}</p>}
      {detalles.length > 0 && <p className="text-[12px] text-[#5A6B7A]">🐾 {detalles.join(' · ')}</p>}
      {solicitud.descripcion && <p className="text-[13px] text-[#0A1628]">{solicitud.descripcion}</p>}

      {solicitud.autor && <p className="text-[12px] text-[#5A6B7A]">Solicita: {solicitud.autor.nombre_completo}</p>}
      {solicitud.cobertura && (
        <p className="text-[12px] text-[#5A6B7A]">
          {solicitud.estado === 'propuesta' ? 'Se ofreció: ' : 'Cubre: '}
          {solicitud.cobertura.nombre_completo}
        </p>
      )}

      {/* 0034: quién falta por confirmar, visible sin entrar al chat. */}
      {solicitud.estado === 'propuesta' && (
        <p className="text-[11px] text-[#5A6B7A]">
          Solicitante:{' '}
          <span className="font-medium text-[#0A1628]">
            {solicitud.acuerdo_autor ? '✓ de acuerdo' : 'sin confirmar'}
          </span>{' '}
          · Quien cubre:{' '}
          <span className="font-medium text-[#0A1628]">
            {solicitud.acuerdo_cobertura ? '✓ de acuerdo' : 'sin confirmar'}
          </span>
        </p>
      )}

      {children}
    </Card>
  );
}
