import { useNavigate } from 'react-router-dom';
import { Card, Badge } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import {
  NOMBRE_AUXILIAR,
  NOMBRE_RELEVO,
  NOMBRE_TURNOS,
  ICONO_AUXILIAR,
  ICONO_RELEVO,
  ICONO_TURNOS,
} from '../../lib/nombresModulos';
import { labelSubtipo } from '../../lib/apoyo';
import SolicitudCard from '../n30-cobertura-servicio/SolicitudCard';
import PanelPagoServicio from '../../components/PanelPagoServicio';

// Badge de estado de pago (migración 0029). Solo tiene sentido en un servicio
// finalizado; lo pinta cada rama de servicio de abajo.
function PagoBadge({ estado }) {
  const pagado = estado === 'pagado';
  return <Badge tone={pagado ? 'ok' : 'alert'}>{pagado ? 'Pagado' : 'Pendiente de pago'}</Badge>;
}

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
  apoyo_conversacion: `${ICONO_AUXILIAR} ${NOMBRE_AUXILIAR} · servicio`,
};

const ESTADO_OFERTA_BADGE = {
  cancelada: { label: 'Cancelada', tone: 'critical' },
  finalizada: { label: 'Finalizada', tone: 'ok' },
};

// 0028: 'aceptada' ya no llega al historial (sigue en curso, con el chat
// abierto, hasta que alguien finaliza el servicio).
const ESTADO_CONVERSACION_BADGE = {
  finalizada: { label: 'Servicio finalizado', tone: 'ok' },
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
export default function ItemHistorial({ item, perfilId, perfil }) {
  const navigate = useNavigate();
  const { origen, fecha, raw } = item;

  if (origen === 'cobertura') {
    // MUVET Relevo borra el chat al finalizar (0023), así que este es el único
    // sitio donde el pago de una cobertura ya cerrada se puede registrar y
    // consultar después (0029).
    const finalizada = raw.estado === 'finalizada';
    const nombreContraparte =
      raw.autor_id === perfilId ? raw.cobertura?.nombre_completo : raw.autor?.nombre_completo;
    return (
      <div className="flex flex-col gap-2">
        <SolicitudCard solicitud={raw}>
          <div className="flex flex-col gap-2 border-t border-[#E1E8ED] pt-2">
            {finalizada && (
              <div>
                <PagoBadge estado={raw.pago_estado} />
              </div>
            )}
            <OrigenTag origen={origen} fecha={fecha} />
          </div>
        </SolicitudCard>
        {finalizada && perfil && (
          <PanelPagoServicio
            modulo="cobertura"
            servicioId={raw.id}
            fila={raw}
            perfil={perfil}
            nombreContraparte={nombreContraparte}
          />
        )}
      </div>
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

  // apoyo_conversacion — un servicio médico↔auxiliar ya cerrado (0028). A
  // diferencia de Cobertura, su chat NO se borró al finalizar: el enlace abre
  // el hilo completo en solo lectura.
  if (origen === 'apoyo_conversacion') {
    const badgeApoyo = ESTADO_CONVERSACION_BADGE[raw.estado] ?? { label: raw.estado, tone: 'neutral' };
    const nombre = raw.otro?.nombre_completo || raw.otro?.razon_social || 'Usuario MUVET';
    return (
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-medium text-[#0A1628]">{nombre}</p>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={badgeApoyo.tone}>{badgeApoyo.label}</Badge>
            {raw.estado === 'finalizada' && <PagoBadge estado={raw.pago_estado} />}
          </div>
        </div>
        <p className="text-[12px] text-[#5A6B7A]">{labelSubtipo(raw.servicio_subtipo)}</p>
        <p className="text-[12px] text-[#5A6B7A]">
          {raw.publicacion?.descripcion || '(sin descripción)'}
          {raw.publicacion?.zona ? ` · ${raw.publicacion.zona}` : ''}
        </p>
        <button
          type="button"
          onClick={() => navigate(`/apoyo/conversacion/${raw.id}`)}
          className="self-start text-[12px] font-medium text-[#1A7A5E]"
        >
          Ver conversación →
        </button>
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
        <div className="flex flex-col items-end gap-1">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {raw.estado === 'finalizada' && <PagoBadge estado={raw.pago_estado} />}
        </div>
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
