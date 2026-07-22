// N-3 · Solicitud recibida · Pre-aceptación
//
// Overlay sobre N-2 (no es una ruta propia: se monta condicionalmente desde
// N2Home mientras hay una solicitud pendiente y el médico está disponible).
// No tiene botón de "atrás" del navegador que lo cierre porque no empuja
// entradas de historial — la única forma de cerrarlo es aceptar, rechazar,
// o que la solicitud expire.
//
// D-064: todo lo que se muestra aquí viene de la vista `solicitudes_pre_aceptacion`,
// que nunca incluye direccion_exacta ni teléfono del tutor. Tampoco se
// renderiza cuenta regresiva — el timer de 60s es enteramente de backend.
import { useEffect, useState } from 'react';
import { Badge, Button, Modal } from '../../components/ui';
import { formatCOP, truncarTexto } from '../../lib/format';
import { aceptarSolicitud, rechazarSolicitud, subscribeSolicitudEstado } from '../../lib/solicitudes';

const EMOJI_ESPECIE = {
  canino: '🐶',
  felino: '🐱',
};

function emojiEspecie(especie) {
  return EMOJI_ESPECIE[(especie ?? '').trim().toLowerCase()] ?? '🐾';
}

export default function N3Solicitudes({ solicitud, onAceptada, onRechazada, onCerradaPorEstado }) {
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!solicitud?.id) return undefined;

    const unsubscribe = subscribeSolicitudEstado(solicitud.id, (row) => {
      if (row.estado === 'expirada') {
        onCerradaPorEstado?.('Solicitud expirada. Sigues disponible.');
      }
    });

    return unsubscribe;
  }, [solicitud?.id, onCerradaPorEstado]);

  if (!solicitud) return null;

  async function handleAceptar() {
    setProcesando(true);
    setError('');
    try {
      const servicio = await aceptarSolicitud(solicitud.id);
      onAceptada(servicio);
    } catch (err) {
      onCerradaPorEstado?.(err.message ?? 'Ya no fue posible aceptar esta solicitud.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleConfirmarRechazo() {
    setProcesando(true);
    setError('');
    try {
      await rechazarSolicitud(solicitud.id);
      setConfirmandoRechazo(false);
      onRechazada();
    } catch (err) {
      setError(err.message ?? 'No se pudo rechazar la solicitud.');
      setProcesando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#1A7A5E]">
          Nueva solicitud de consulta
        </p>
        <h1 className="mb-5 text-[20px] font-semibold text-[#0A1628]">
          {emojiEspecie(solicitud.mascota_especie)} {solicitud.mascota_nombre}
        </h1>

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] text-[#5A6B7A]">Mascota</p>
            <p className="text-[14px] text-[#0A1628]">
              {solicitud.mascota_especie ?? '—'} · {solicitud.mascota_raza ?? 'Raza no especificada'} ·{' '}
              {solicitud.mascota_nombre ?? '—'}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-[#5A6B7A]">Tutor</p>
            <p className="text-[14px] text-[#0A1628]">{solicitud.tutor_primer_nombre || 'Sin nombre'}</p>
          </div>

          <div>
            <p className="text-[11px] text-[#5A6B7A]">Motivo de consulta</p>
            <p className="text-[14px] text-[#0A1628] line-clamp-4">
              {truncarTexto(solicitud.motivo_consulta, 200) || 'Sin motivo especificado.'}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-[#5A6B7A]">Zona aproximada</p>
            <p className="text-[14px] text-[#0A1628]">📍 {solicitud.zona_aproximada ?? '—'}</p>
          </div>

          <div>
            <p className="text-[11px] text-[#5A6B7A]">Tarifa estimada</p>
            <p className="text-[16px] font-semibold text-[#0A1628]">{formatCOP(solicitud.tarifa_estimada)}</p>
          </div>

          {solicitud.primera_vez_paciente && <Badge tone="info">🆕 Primera vez en MUVET</Badge>}

          {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[#E1E8ED] px-5 py-5">
        <Button onClick={handleAceptar} disabled={procesando}>
          {procesando ? 'Procesando…' : 'ACEPTAR SERVICIO'}
        </Button>
        <Button variant="outline" onClick={() => setConfirmandoRechazo(true)} disabled={procesando}>
          Rechazar
        </Button>
      </div>

      <Modal open={confirmandoRechazo} onClose={() => setConfirmandoRechazo(false)} title="¿Seguro que rechazas este servicio?">
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={handleConfirmarRechazo} disabled={procesando}>
            {procesando ? 'Rechazando…' : 'Sí, rechazar'}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmandoRechazo(false)} disabled={procesando}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
