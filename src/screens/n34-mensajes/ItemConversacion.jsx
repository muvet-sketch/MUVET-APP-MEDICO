import { useNavigate } from 'react-router-dom';
import { Card, Badge } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import { textoVentanaChat, formatFechaHoraServicio } from '../../lib/coberturaServicio';
import { labelSubtipo } from '../../lib/apoyo';
import { MODULOS_MENSAJES } from '../../lib/mensajesUnificados';

// Una conversación dentro de la ficha de un contacto (N-34). Espejo de
// n9-historial/ItemHistorial.jsx, pero acá el nombre de la persona ya está en
// el encabezado de la pantalla: lo que cada tarjeta tiene que decir es DE QUÉ
// se habló, en qué módulo y en qué estado quedó.
//
// Los `origen` son identificadores internos y van al revés que los nombres
// visibles: `relevo` es "MUVET Turnos" y `cobertura` es "MUVET Relevo". No es
// un error de copia — ver lib/nombresModulos.js.

// Cada módulo tiene su propio vocabulario de estados; se respeta el de su
// bandeja de origen para que nadie lea dos nombres distintos para lo mismo.
const ESTADO_BADGE = {
  relevo: {
    abierta: { label: 'En conversación', tone: 'info' },
    aceptada: { label: 'Turno confirmado', tone: 'ok' },
    finalizada: { label: 'Servicio finalizado', tone: 'neutral' },
    descartada: { label: 'Descartada', tone: 'critical' },
  },
  apoyo: {
    abierta: { label: 'En conversación', tone: 'info' },
    aceptada: { label: 'Servicio confirmado', tone: 'ok' },
    finalizada: { label: 'Finalizado', tone: 'neutral' },
    descartada: { label: 'Descartada', tone: 'critical' },
  },
  cobertura: {
    abierta: { label: 'Abierta', tone: 'alert' },
    propuesta: { label: 'Por confirmar', tone: 'info' },
    cubierta: { label: 'Confirmada · servicio en curso', tone: 'ok' },
    finalizada: { label: 'Finalizada', tone: 'neutral' },
    cancelada: { label: 'Cancelada', tone: 'critical' },
  },
};

// De qué se habló, en una línea. Cada módulo guarda el asunto en otro lado:
// Turnos y Auxiliar en la publicación embebida, MUVET Relevo en la propia
// solicitud.
function asuntoDe({ origen, raw }) {
  if (origen === 'cobertura') {
    return [raw.tipo_servicio, formatFechaHoraServicio(raw)].filter(Boolean).join(' · ');
  }
  const descripcion = raw.publicacion?.descripcion || '(sin descripción)';
  if (origen === 'apoyo') {
    return [labelSubtipo(raw.servicio_subtipo), descripcion].filter(Boolean).join(' · ');
  }
  return descripcion;
}

export default function ItemConversacion({ conversacion, perfilId }) {
  const navigate = useNavigate();
  const { origen, estado, raw, fecha, activa, chatDisponible, ruta, noLeido } = conversacion;

  const modulo = MODULOS_MENSAJES[origen];
  const badge = ESTADO_BADGE[origen]?.[estado] ?? { label: estado, tone: 'neutral' };
  const soyAutor = raw.autor_id === perfilId;

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#5A6B7A]">
          {noLeido && <span className="h-2 w-2 shrink-0 rounded-full bg-[#C63B3B]" aria-label="Sin leer" />}
          {modulo.icono} {modulo.label}
        </p>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <p className="text-[13px] text-[#0A1628]">{asuntoDe(conversacion)}</p>
      <p className="text-[11px] text-[#5A6B7A]">
        {soyAutor ? 'Lo publiqué yo' : 'Lo publicó esta persona'}
        {fecha ? ` · ${formatFechaCorta(fecha)}` : ''}
      </p>

      {chatDisponible ? (
        <button
          type="button"
          onClick={() => navigate(ruta)}
          className="self-start text-[12px] font-medium text-[#1A7A5E]"
        >
          {activa ? 'Abrir conversación →' : 'Ver conversación →'}
          {/* MUVET Relevo purga el chat 24 h después de finalizar (0034): mientras
              la ventana corre conviene decir cuánto queda. */}
          {origen === 'cobertura' && !activa && (
            <span className="font-normal text-[#5A6B7A]"> {textoVentanaChat(raw)}</span>
          )}
        </button>
      ) : (
        // Sin hilo al que llevar: en MUVET Relevo los mensajes ya se borraron.
        <p className="text-[11px] text-[#5A6B7A]">El chat de este servicio ya se cerró.</p>
      )}
    </Card>
  );
}
