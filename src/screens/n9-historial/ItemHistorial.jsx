import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Avatar } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import { enlaceUbicacion } from '../../lib/mapas';
import { chatAbierto, fetchDireccionCobertura, textoVentanaChat } from '../../lib/coberturaServicio';
import {
  NOMBRE_AUXILIAR,
  NOMBRE_ESPECIALISTAS,
  NOMBRE_RELEVO,
  NOMBRE_TURNOS,
  ICONO_AUXILIAR,
  ICONO_ESPECIALISTAS,
  ICONO_RELEVO,
  ICONO_TURNOS,
} from '../../lib/nombresModulos';
import { labelSubtipo } from '../../lib/apoyo';
import { asuntoConversacion } from '../../lib/especialistas';
import SolicitudCard from '../n30-cobertura-servicio/SolicitudCard';

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
  especialista_conversacion: `${ICONO_ESPECIALISTAS} ${NOMBRE_ESPECIALISTAS} · servicio`,
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

// Punto de encuentro de un relevo ya cerrado (0032). Es el único lugar donde
// queda una vez vence la ventana de 24 h del chat (0034): los mensajes se
// borran, pero `cobertura_direccion` sobrevive a propósito — dónde se prestó el
// servicio no es parte del historial de mensajes que se pidió no conservar.
function DireccionCobertura({ solicitudId }) {
  const [direccion, setDireccion] = useState(null);

  useEffect(() => {
    let activo = true;
    fetchDireccionCobertura(solicitudId)
      .then((d) => {
        if (activo) setDireccion(d);
      })
      .catch(() => {
        if (activo) setDireccion(null);
      });
    return () => {
      activo = false;
    };
  }, [solicitudId]);

  if (!direccion) return null;

  const enlace = enlaceUbicacion({
    direccion: direccion.direccion_encuentro,
    linkMaps: direccion.link_maps,
  });

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[12px] text-[#0A1628]">
        📍 {direccion.direccion_encuentro}
        {direccion.referencia ? ` · ${direccion.referencia}` : ''}
      </p>
      {enlace && (
        <a
          href={enlace}
          target="_blank"
          rel="noreferrer"
          className="self-start text-[12px] font-medium text-[#1A7A5E]"
        >
          Abrir en la app de mapas →
        </a>
      )}
    </div>
  );
}

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
    // Sin badge ni panel de pago: 0034 sacó MUVET Relevo del control de pagos
    // porque acá el médico que releva le cobra directamente al tutor.
    //
    // El chat sigue accesible durante 24 h desde la finalización (0034), así que
    // mientras la ventana corre este ítem lleva al hilo; después ya no hay hilo
    // al que llevar y queda solo el detalle del servicio.
    const conChat = chatAbierto(raw);
    return (
      <div className="flex flex-col gap-2">
        <SolicitudCard solicitud={raw}>
          <div className="flex flex-col gap-2 border-t border-[#E1E8ED] pt-2">
            <DireccionCobertura solicitudId={raw.id} />
            {conChat && (
              <button
                type="button"
                onClick={() => navigate(`/cobertura-servicio/chat/${raw.id}`)}
                className="self-start text-[12px] font-medium text-[#1A7A5E]"
              >
                Abrir chat → <span className="font-normal text-[#5A6B7A]">{textoVentanaChat(raw)}</span>
              </button>
            )}
            <OrigenTag origen={origen} fecha={fecha} />
          </div>
        </SolicitudCard>
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

  // especialista_conversacion — un servicio de MUVET Especialistas ya cerrado
  // (0039), venga del directorio o del tablón. Como en Auxiliar, el chat y sus
  // adjuntos NO se borraron: el enlace abre el hilo completo en solo lectura.
  //
  // Sin PagoBadge a propósito: este módulo no tiene control de pagos (el
  // especialista le cobra directo a quien lo contrata).
  if (origen === 'especialista_conversacion') {
    const badgeEsp = ESTADO_CONVERSACION_BADGE[raw.estado] ?? { label: raw.estado, tone: 'neutral' };
    const nombre = raw.otro?.nombre_completo || raw.otro?.razon_social || 'Usuario MUVET';
    return (
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar
              fotoUrl={raw.otro?.foto_url}
              nombre={nombre}
              rol={raw.otro?.rol}
              semilla={raw.otro?.id}
              size={32}
            />
            <p className="text-[14px] font-medium text-[#0A1628]">{nombre}</p>
          </div>
          <Badge tone={badgeEsp.tone}>{badgeEsp.label}</Badge>
        </div>
        <p className="text-[12px] text-[#5A6B7A]">
          {raw.origen === 'directorio' ? 'Desde el directorio' : 'Desde el tablón de ofertas'} ·{' '}
          {asuntoConversacion(raw)}
        </p>
        <button
          type="button"
          onClick={() => navigate(`/especialistas/conversacion/${raw.id}`)}
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
        <div className="flex items-center gap-2">
          <Avatar
            fotoUrl={raw.otro?.foto_url}
            nombre={nombreOtro}
            rol={raw.otro?.rol}
            semilla={raw.otro?.id}
            size={32}
          />
          <p className="text-[14px] font-medium text-[#0A1628]">{nombreOtro}</p>
        </div>
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
