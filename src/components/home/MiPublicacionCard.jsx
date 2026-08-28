import { useNavigate } from 'react-router-dom';
import { Card, Badge, Toggle } from '../ui';
import { formatCOP } from '../../lib/format';

// Fila de "Mis publicaciones" en el Home. Una sola tarjeta para los tres
// módulos gremiales: MisPublicaciones normaliza cada fuente a la misma forma
// antes de llegar acá (ver la cabecera de MisPublicaciones.jsx).
//
// No reutiliza PublicacionApoyoCard (screens/n32-auxiliar): esa tarjeta solo
// entiende columnas de apoyo_publicaciones, y en esta lista conviven filas de
// MUVET Turnos, MUVET Auxiliar y MUVET Relevo que deben verse idénticas.
export default function MiPublicacionCard({ fila, onToggle, toggling = false }) {
  const navigate = useNavigate();
  const detalle = [fila.zona, fila.fechaTexto, fila.franjaTexto].filter(Boolean).join(' · ');

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#0A1628]">
          <span aria-hidden="true">{fila.icono} </span>
          {fila.titulo}
        </p>
        {fila.soportaToggle ? (
          <Badge tone={fila.activa ? 'ok' : 'neutral'}>{fila.activa ? 'Publicada' : 'Pausada'}</Badge>
        ) : (
          // Sin toggle (MUVET Relevo) la etiqueta la manda la fila: 'Abierta' o
          // 'Por confirmar' cuando ya hay una propuesta viva (0034).
          <Badge tone={fila.badgeTone ?? 'info'}>{fila.badgeLabel ?? 'Abierta'}</Badge>
        )}
      </div>

      {fila.descripcion && <p className="text-[13px] text-[#0A1628]">{fila.descripcion}</p>}

      <p className="text-[12px] text-[#5A6B7A]">{detalle || 'Sin zona'}</p>

      {fila.tarifa != null && (
        <p className="text-[13px] font-semibold text-[#1A7A5E]">{formatCOP(fila.tarifa)}</p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[#E1E8ED] pt-2">
        {fila.soportaToggle ? (
          <div className="flex items-center gap-2">
            <Toggle
              checked={fila.activa}
              onChange={(next) => onToggle?.(fila, next)}
              disabled={toggling}
              label={fila.activa ? 'Pausar publicación' : 'Publicar'}
            />
            <span className="text-[12px] text-[#5A6B7A]">
              {fila.activa ? 'Visible en el tablón' : 'Fuera del tablón'}
            </span>
          </div>
        ) : (
          // MUVET Relevo no tiene toggle: una solicitud está abierta, en
          // negociación o no existe (no hay columna `activa` en
          // cobertura_solicitudes).
          <span className="text-[12px] text-[#5A6B7A]">{fila.nota ?? 'Esperando quién la releve'}</span>
        )}
        <button
          type="button"
          onClick={() => navigate(fila.editarTo)}
          className="shrink-0 text-[12px] font-medium text-[#1A7A5E]"
        >
          {fila.ctaLabel ?? 'Editar'} →
        </button>
      </div>
    </Card>
  );
}
