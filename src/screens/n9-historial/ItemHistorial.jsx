import { useState } from 'react';
import { Card, Badge, Button, Modal } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import { enviarMensaje } from '../../lib/relevo';
import SolicitudCard from '../n30-cobertura-servicio/SolicitudCard';

// Cada ítem del historial único se pinta según su origen. La tarjeta de
// Cobertura se reutiliza tal cual desde N-30 (ya cubre los estados
// 'finalizada'/'cancelada' en su ESTADO_BADGE) en vez de duplicarla acá —
// mismo patrón de import entre pantallas que ya usa N-27 con DisponibleToggle.
const ORIGEN_LABEL = {
  cobertura: '🤝 Cobertura de Servicio',
  relevo_oferta: '🔄 MUVET Relevo · mi oferta',
  relevo_postulacion: '🔄 MUVET Relevo · me postulé',
};

const ESTADO_OFERTA_BADGE = {
  cancelada: { label: 'Cancelada', tone: 'critical' },
  finalizada: { label: 'Finalizada', tone: 'ok' },
};

const ESTADO_POSTULACION_BADGE = {
  aceptada: { label: 'Aceptada', tone: 'ok' },
  rechazada: { label: 'Rechazada', tone: 'critical' },
};

function OrigenTag({ origen, fecha }) {
  return (
    <p className="text-[11px] text-[#5A6B7A]">
      {ORIGEN_LABEL[origen]}
      {fecha ? ` · ${formatFechaCorta(fecha)}` : ''}
    </p>
  );
}

// Una postulación aceptada habilita el contacto directo (0020, D-540: mensaje
// único, sin hilo). Ese botón vivía en "Mis postulaciones" (N-26); al mover las
// postulaciones ya decididas al historial, la acción se mueve con ellas — si
// no, aceptar una oferta dejaría al interesado sin forma de escribir.
function ContactoPostulacion({ postulacion, perfilId }) {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  async function handleEnviar(e) {
    e.preventDefault();
    if (!mensaje.trim()) return;
    setEnviando(true);
    setError('');
    try {
      await enviarMensaje({
        publicacionId: postulacion.publicacion_id,
        remitenteId: perfilId,
        mensaje: mensaje.trim(),
      });
      setAbierto(false);
      setMensaje('');
      setEnviado(true);
    } catch {
      setError('No se pudo enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <p className="text-[11px] text-[#1A7A5E]">Aceptada — ya pueden escribirse.</p>
      {enviado && <p className="text-[11px] text-[#1A7A5E]">✓ Mensaje enviado.</p>}
      <Button
        variant="outline"
        fullWidth={false}
        className="!w-auto self-start px-3 py-2 text-[12px]"
        onClick={() => setAbierto(true)}
      >
        Enviar mensaje
      </Button>

      <Modal open={abierto} onClose={() => setAbierto(false)} title="Enviar mensaje">
        <form onSubmit={handleEnviar} className="flex flex-col gap-3">
          <p className="text-[12px] text-[#5A6B7A]">Mensaje único de contacto — sin chat en tiempo real (D-540).</p>
          <textarea
            rows={4}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Escribe tu mensaje…"
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
          <Button type="submit" disabled={enviando || !mensaje.trim()}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      </Modal>
    </>
  );
}

export default function ItemHistorial({ item, perfilId }) {
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

  // relevo_postulacion — la oferta de otro que validé y cuyo autor ya decidió.
  const badge = ESTADO_POSTULACION_BADGE[raw.estado] ?? { label: raw.estado, tone: 'neutral' };
  const autor = raw.autorPublicacion;
  const nombreAutor = autor?.razon_social || autor?.nombre_completo || 'Usuario MUVET';
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-medium text-[#0A1628]">{nombreAutor}</p>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="text-[12px] text-[#5A6B7A]">
        Sobre: {raw.publicacion?.descripcion || '(sin descripción)'}
        {raw.publicacion?.zona ? ` · ${raw.publicacion.zona}` : ''}
      </p>
      {raw.estado === 'aceptada' && <ContactoPostulacion postulacion={raw} perfilId={perfilId} />}
      <OrigenTag origen={origen} fecha={fecha} />
    </Card>
  );
}
