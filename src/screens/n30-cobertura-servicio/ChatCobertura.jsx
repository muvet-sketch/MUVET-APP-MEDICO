// Chat en tiempo real de MUVET Relevo (N-30) — EXCEPCIÓN EXPLÍCITA a D-540
// / "no incluir chat en tiempo real" (CLAUDE.md), confirmada con el fundador
// y acotada a este módulo (ver supabase/migrations/0023_cobertura_servicio.sql).
// Activo solo mientras la solicitud está en estado 'cubierta' — al finalizar
// (por cualquiera de los dos médicos) el backend borra los mensajes y los
// archivos adjuntos (cobertura_finalizar_servicio), así que el historial no
// conserva rastro del chat, tal como se pidió.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { ScreenHeader, Button, Toast } from '../../components/ui';
import { validateResultFile } from '../../lib/fileValidation';
import {
  fetchSolicitud,
  fetchMensajesChat,
  enviarMensajeChat,
  subscribeMensajesChat,
  subscribeSolicitud,
  finalizarServicio,
  getSignedChatFileUrl,
} from '../../lib/coberturaServicio';

function ArchivoAdjunto({ path, tipo, nombre }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    getSignedChatFileUrl(path)
      .then((signed) => {
        if (active) setUrl(signed);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [path]);

  const esImagen = tipo?.startsWith('image/');

  if (!url) return <p className="text-[12px] text-[#5A6B7A]">Cargando adjunto…</p>;
  if (esImagen) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={nombre || 'Adjunto'} className="max-h-48 rounded-[10px] object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[13px] underline">
      📎 {nombre || 'Archivo adjunto'}
    </a>
  );
}

export default function ChatCobertura() {
  const { solicitudId } = useParams();
  const { perfil } = useAuth();
  const navigate = useNavigate();

  const [solicitud, setSolicitud] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });
  const bottomRef = useRef(null);

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }

  useEffect(() => {
    let active = true;
    Promise.all([fetchSolicitud(solicitudId), fetchMensajesChat(solicitudId)]).then(([s, m]) => {
      if (!active) return;
      setSolicitud(s);
      setMensajes(m);
    });
    return () => {
      active = false;
    };
  }, [solicitudId]);

  useEffect(() => {
    const unsubscribe = subscribeMensajesChat(solicitudId, (nuevo) => {
      setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]));
    });
    return unsubscribe;
  }, [solicitudId]);

  useEffect(() => {
    const unsubscribe = subscribeSolicitud(solicitudId, (nueva) => {
      setSolicitud((prev) => (prev ? { ...prev, ...nueva } : nueva));
      if (nueva.estado === 'finalizada') {
        showToast('El otro médico finalizó el servicio. El chat quedó cerrado.', 'info');
      }
    });
    return unsubscribe;
  }, [solicitudId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null;
    setError('');
    if (!file) return;
    const { ok, error: validationError } = validateResultFile(file);
    if (!ok) {
      setError(validationError);
      e.target.value = '';
      return;
    }
    setArchivo(file);
  }

  async function handleEnviar(e) {
    e.preventDefault();
    if (!texto.trim() && !archivo) return;
    setEnviando(true);
    setError('');
    try {
      await enviarMensajeChat({ solicitudId, remitenteId: perfil.id, mensaje: texto.trim() || null, archivo });
      setTexto('');
      setArchivo(null);
    } catch (err) {
      setError(err.message ?? 'No se pudo enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleFinalizar() {
    setFinalizando(true);
    try {
      await finalizarServicio(solicitudId);
      showToast('Servicio finalizado. El chat quedó cerrado.', 'ok');
      navigate('/cobertura-servicio');
    } catch (err) {
      showToast(err.message ?? 'No se pudo finalizar.', 'critical');
    } finally {
      setFinalizando(false);
    }
  }

  if (!perfil || !solicitud) return null;

  const contraparte = solicitud.autor_id === perfil.id ? solicitud.cobertura : solicitud.autor;
  const chatActivo = solicitud.estado === 'cubierta';

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title={contraparte?.nombre_completo ? `Chat con ${contraparte.nombre_completo}` : 'Chat de cobertura'} fallbackTo="/cobertura-servicio" conCampana />

      <div className="border-b border-[#E1E8ED] px-5 py-2">
        <p className="text-[12px] text-[#5A6B7A]">{solicitud.tipo_servicio}</p>
        {chatActivo && (
          <Button variant="danger" fullWidth={false} disabled={finalizando} onClick={handleFinalizar} className="mt-2">
            {finalizando ? 'Finalizando…' : 'Finalizar servicio'}
          </Button>
        )}
        {!chatActivo && <p className="mt-1 text-[12px] font-medium text-[#C63B3B]">Este servicio ya fue finalizado. El chat está cerrado.</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {mensajes.length === 0 && <p className="py-8 text-center text-[13px] text-[#5A6B7A]">Todavía no hay mensajes. Coordina el servicio acá.</p>}

        <div className="flex flex-col gap-2">
          {mensajes.map((m) => {
            const esMio = m.remitente_id === perfil.id;
            return (
              <div key={m.id} className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[80%] rounded-[12px] px-3 py-2 ${esMio ? 'bg-[#0A1628] text-white' : 'bg-[#F4F7F9] text-[#0A1628]'}`}>
                  {m.mensaje && <p className="text-[13px]">{m.mensaje}</p>}
                  {m.archivo_path && <ArchivoAdjunto path={m.archivo_path} tipo={m.archivo_tipo} nombre={m.archivo_nombre} />}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {chatActivo && (
        <form onSubmit={handleEnviar} className="sticky bottom-0 flex flex-col gap-2 border-t border-[#E1E8ED] bg-white px-5 py-3">
          {archivo && (
            <p className="text-[12px] text-[#5A6B7A]">
              📎 {archivo.name}{' '}
              <button type="button" onClick={() => setArchivo(null)} className="text-[#C63B3B] underline">
                quitar
              </button>
            </p>
          )}
          {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
          <div className="flex items-center gap-2">
            <label className="cursor-pointer text-[20px]">
              📎
              <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={handleFileChange} className="hidden" />
            </label>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe un mensaje…"
              className="flex-1 rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
            />
            <Button type="submit" fullWidth={false} disabled={enviando || (!texto.trim() && !archivo)}>
              Enviar
            </Button>
          </div>
        </form>
      )}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
