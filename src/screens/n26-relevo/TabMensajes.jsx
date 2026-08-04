import { useEffect, useState } from 'react';
import { Card, Modal } from '../../components/ui';
import { fetchMensajesRecibidos, marcarMensajesLeidos } from '../../lib/relevo';
import { formatFechaCorta } from '../../lib/format';

const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

export default function TabMensajes({ perfil }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    let active = true;
    fetchMensajesRecibidos(perfil.id)
      .then((data) => {
        if (active) setMensajes(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil.id]);

  // Al abrir la pestaña se dan por vistos (limpia el badge de la campana).
  // No afecta la lista ya renderizada: usamos el `leido` original de cada
  // fila (capturado en el fetch de arriba) para el punto de "no leído".
  useEffect(() => {
    marcarMensajesLeidos(perfil.id).catch(() => {});
  }, [perfil.id]);

  // Historial (solo lectura): todos los mensajes que ESE remitente envió sobre
  // ESA publicación, ordenados cronológicamente. D-540 sigue vigente: son
  // filas independientes de "mensaje único de contacto", no un hilo de chat
  // — aquí solo se listan una al lado de la otra, sin posibilidad de responder.
  const historial = seleccionado
    ? mensajes
        .filter((m) => m.remitente_id === seleccionado.remitente_id && m.publicacion_id === seleccionado.publicacion_id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];
  const nombreSeleccionado =
    seleccionado?.remitente?.razon_social || seleccionado?.remitente?.nombre_completo || 'Usuario MUVET';

  return (
    <div className="flex flex-col gap-3 px-5 py-5 pb-24">
      <p className="text-[12px] text-[#5A6B7A]">Mensajes recibidos sobre tus publicaciones.</p>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
      {!loading && mensajes.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">Aún no tienes mensajes.</Card>
      )}

      {!loading &&
        mensajes.map((m) => {
          const nombreRemitente = m.remitente?.razon_social || m.remitente?.nombre_completo || 'Usuario MUVET';
          return (
            <button key={m.id} type="button" onClick={() => setSeleccionado(m)} className="w-full text-left">
              <Card className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0A1628]">
                    {!m.leido && <span className="h-2 w-2 rounded-full bg-[#C63B3B]" aria-label="Sin leer" />}
                    {nombreRemitente}
                  </p>
                  <span className="text-[11px] text-[#5A6B7A]">{ACTOR_LABEL[m.remitente?.rol] ?? ''}</span>
                </div>
                <p className="text-[12px] text-[#5A6B7A]">Sobre: {m.publicacion?.descripcion || '(sin descripción)'}</p>
                <p className="text-[13px] text-[#0A1628]">{m.mensaje}</p>
              </Card>
            </button>
          );
        })}

      <Modal open={!!seleccionado} onClose={() => setSeleccionado(null)} title={nombreSeleccionado}>
        <p className="mb-3 text-[12px] text-[#5A6B7A]">
          Sobre: {seleccionado?.publicacion?.descripcion || '(sin descripción)'}
        </p>
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {historial.map((m) => (
            <div key={m.id} className="rounded-[10px] bg-[#F3F6F8] p-3">
              <p className="text-[13px] text-[#0A1628]">{m.mensaje}</p>
              <p className="mt-1 text-[11px] text-[#5A6B7A]">{formatFechaCorta(m.created_at)}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
