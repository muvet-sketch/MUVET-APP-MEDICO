import { useNavigate } from 'react-router-dom';
import { Card, Badge } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import { NOMBRE_RELEVO, NOMBRE_TURNOS, ICONO_RELEVO, ICONO_TURNOS } from '../../lib/nombresModulos';
import SolicitudCard from '../n30-cobertura-servicio/SolicitudCard';

// Cada ítem del historial único se pinta según su origen. La tarjeta de N-30 se
// reutiliza tal cual (ya cubre los estados 'finalizada'/'cancelada' en su
// ESTADO_BADGE) en vez de duplicarla acá — mismo patrón de import entre
// pantallas que ya usa N-27 con DisponibleToggle.
//
// Los `origen` son identificadores internos anteriores al cambio de nombres:
// `cobertura` es MUVET Relevo y `relevo_*` es MUVET Turnos. No es un error de
// copia — ver el bloque de lib/nombresModulos.js.
const ORIGEN_LABEL = {
  cobertura: `${ICONO_RELEVO} ${NOMBRE_RELEVO}`,
  relevo_oferta: `${ICONO_TURNOS} ${NOMBRE_TURNOS} · mi oferta`,
  relevo_conversacion: `${ICONO_TURNOS} ${NOMBRE_TURNOS} · conversación`,
};

const ESTADO_OFERTA_BADGE = {
  cancelada: { label: 'Cancelada', tone: 'critical' },
  finalizada: { label: 'Finalizada', tone: 'ok' },
};

const ESTADO_CONVERSACION_BADGE = {
  aceptada: { label: 'Turno confirmado', tone: 'ok' },
  descartada: { label: 'Descartada', tone: 'critical' },
};

function OrigenTag({ origen, fecha }) {
  return (
    <p className="text-[11px] text-[#5A6B7A]">
      {ORIGEN_LABEL[origen]}
      {fecha ? ` · ${formatFechaCorta(fecha)}` : ''}
    </p>
  );
}

// El modal "Enviar mensaje" que vivía acá desapareció con 0027: ya no hay
// mensajes sueltos post-aceptación. Una conversación cerrada se abre en su
// propio hilo, en solo lectura, y el contacto directo (teléfono) sale de la
// ficha ampliada dentro de esa pantalla.
export default function ItemHistorial({ item, perfilId }) {
  const navigate = useNavigate();
  const { origen, fecha, raw } = item;

  if (origen === 'cobertura') {
    return (
      <SolicitudCard solicitud={raw}>
        <div className="border-t border-[#E1E8ED] pt-2">
          <OrigenTag origen={origen} fecha={fecha} />
        </div>
      </SolicitudCard>
    );
  }

  if (origen === 'relevo_oferta') {
    const badge = ESTADO_OFERTA_BADGE[raw.estado] ?? { label: raw.estado, tone: 'neutral' };
    return (
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-medium text-[#0A1628]">{raw.descripcion || '(sin descripción)'}</p>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        {raw.zona && <p className="text-[12px] text-[#5A6B7A]">📍 {raw.zona}</p>}
        <OrigenTag origen={origen} fecha={fecha} />
      </Card>
    );
  }

  // relevo_conversacion — una negociación ya cerrada, de cualquiera de los dos
  // lados (0027). `otro` lo resuelve fetchMisConversaciones según el lado en el
  // que esté el perfil.
  const badge = ESTADO_CONVERSACION_BADGE[raw.estado] ?? { label: raw.estado, tone: 'neutral' };
  const nombreOtro = raw.otro?.razon_social || raw.otro?.nombre_completo || 'Usuario MUVET';
  const soyAutora = raw.autor_id === perfilId;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-medium text-[#0A1628]">{nombreOtro}</p>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="text-[12px] text-[#5A6B7A]">
        Sobre: {raw.publicacion?.descripcion || '(sin descripción)'}
        {raw.publicacion?.zona ? ` · ${raw.publicacion.zona}` : ''}
      </p>
      <p className="text-[11px] text-[#5A6B7A]">{soyAutora ? 'Sobre mi oferta' : 'Sobre su oferta'}</p>
      <button
        type="button"
        onClick={() => navigate(`/relevo/conversacion/${raw.id}`)}
        className="self-start text-[12px] font-medium text-[#1A7A5E]"
      >
        Ver conversación →
      </button>
      <OrigenTag origen={origen} fecha={fecha} />
    </Card>
  );
}
