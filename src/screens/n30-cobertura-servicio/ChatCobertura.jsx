// Chat en tiempo real de MUVET Relevo (N-30) — EXCEPCIÓN EXPLÍCITA a D-540
// / "no incluir chat en tiempo real" (CLAUDE.md), confirmada con el fundador
// y acotada a este módulo (ver supabase/migrations/0023_cobertura_servicio.sql).
//
// Ciclo de vida del hilo tras la migración 0034:
//
//   propuesta   alguien se ofreció · el chat SE ABRE acá, que es donde se
//               negocia · cada parte marca "Estoy de acuerdo" y el backend
//               deriva el paso a 'cubierta' de las dos banderas
//   cubierta    servicio tomado por ambas partes · se revela el punto de
//               encuentro y aparece "Finalizar servicio"
//   finalizada  el chat sigue abierto 24 HORAS y después se cierra y se purga
//
// La ventana de 24 h la impone la RLS (`cobertura_chat_abierto`, 0034 §5), no
// esta pantalla: `chatAbierto` de lib/coberturaServicio.js es solo su espejo
// para no pintar un composer que el servidor va a rechazar.
//
// Sin panel de pago (0034): en este módulo el médico que releva le cobra
// directamente al tutor, así que no hay pago entre las dos partes que marcar.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { ScreenHeader, Button, Toast, BottomNav } from '../../components/ui';
import { validateResultFile } from '../../lib/fileValidation';
import DireccionEncuentroCobertura from './DireccionEncuentroCobertura';
import {
  fetchSolicitud,
  fetchMensajesChat,
  enviarMensajeChat,
  subscribeMensajesChat,
  subscribeSolicitud,
  acordarCobertura,
  descartarPropuesta,
  finalizarServicio,
  purgarChatsVencidos,
  getSignedChatFileUrl,
  fetchDireccionCobertura,
  chatAbierto,
  textoVentanaChat,
  acuerdosCobertura,
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
  const [direccion, setDireccion] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [acordando, setAcordando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });
  // Solo existe para forzar el repintado cuando vence la ventana de 24 h con la
  // pantalla abierta: nada en el servidor cambia en ese instante, así que sin
  // este latido el composer se quedaría visible hasta la próxima interacción.
  const [, setLatido] = useState(0);
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

  // Purga perezosa de los chats ya vencidos (0034 §4.6). Best-effort, igual que
  // `expirarSolicitudesVencidas` en la Home: si falla, la RLS ya tiene cerrada
  // la ventana y no se ve nada de todos modos.
  useEffect(() => {
    purgarChatsVencidos().catch(() => {});
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
      if (nueva.estado === 'cubierta') {
        showToast('✓ Relevo confirmado por ambas partes.', 'ok');
      }
      if (nueva.estado === 'finalizada') {
        showToast('El otro médico finalizó el servicio. El chat sigue abierto 24 h.', 'info');
      }
      if (nueva.estado === 'abierta') {
        setMensajes([]);
        showToast('La propuesta se descartó. La solicitud volvió al tablón.', 'alert');
      }
    });
    return unsubscribe;
  }, [solicitudId]);

  // Un tic por minuto mientras la ventana de 24 h corre. Se apaga solo en
  // cualquier otro estado, para no dejar un intervalo vivo sin motivo.
  useEffect(() => {
    if (solicitud?.estado !== 'finalizada') return undefined;
    const id = setInterval(() => setLatido((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [solicitud?.estado]);

  // Se vuelve a pedir cuando cambia el estado (es cuando el backend empieza a
  // devolvérsela al que cubre) y cuando llega el latido `direccion_actualizada_at`
  // de 0032 (el autor la escribió o la editó). Sin lo segundo, una dirección
  // puesta después de tomar el servicio no llegaría nunca — el mismo fallo que
  // 0031 arregla en MUVET Auxiliar. El dato viaja por PostgREST, no por el
  // websocket: por ahí solo va la marca de tiempo.
  useEffect(() => {
    if (!solicitudId) return undefined;
    let active = true;
    fetchDireccionCobertura(solicitudId)
      .then((d) => {
        if (active) setDireccion(d);
      })
      .catch(() => {
        if (active) setDireccion(null);
      });
    return () => {
      active = false;
    };
  }, [solicitudId, solicitud?.estado, solicitud?.direccion_actualizada_at]);

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

  // "Estoy de acuerdo": marca solo MI bandera. El paso a 'cubierta' lo deriva el
  // backend cuando están las dos, así que acá no se decide nada — se refleja.
  async function handleAcordar() {
    setAcordando(true);
    try {
      const actualizada = await acordarCobertura(solicitudId);
      if (actualizada) setSolicitud((prev) => ({ ...prev, ...actualizada }));
      showToast(
        actualizada?.estado === 'cubierta'
          ? '✓ Relevo confirmado por ambas partes.'
          : 'Registramos tu acuerdo. Falta la confirmación de la otra parte.',
        'ok',
      );
    } catch (err) {
      showToast(err.message ?? 'No se pudo registrar tu acuerdo.', 'critical');
    } finally {
      setAcordando(false);
    }
  }

  async function handleDescartar() {
    setDescartando(true);
    try {
      await descartarPropuesta(solicitudId);
      showToast('Propuesta descartada. La solicitud volvió al tablón.', 'ok');
      navigate('/cobertura-servicio');
    } catch (err) {
      showToast(err.message ?? 'No se pudo descartar.', 'critical');
    } finally {
      setDescartando(false);
    }
  }

  async function handleFinalizar() {
    setFinalizando(true);
    try {
      await finalizarServicio(solicitudId);
      showToast('Servicio finalizado. El chat sigue abierto 24 h.', 'ok');
      const actualizada = await fetchSolicitud(solicitudId);
      if (actualizada) setSolicitud(actualizada);
    } catch (err) {
      showToast(err.message ?? 'No se pudo finalizar.', 'critical');
    } finally {
      setFinalizando(false);
    }
  }

  if (!perfil) return null;
  // La barra inferior también mientras carga: es persistente, no debe
  // parpadear al entrar al chat.
  if (!solicitud) {
    return (
      <div className="flex min-h-svh flex-col pb-16">
        <BottomNav />
      </div>
    );
  }

  const contraparte = solicitud.autor_id === perfil.id ? solicitud.cobertura : solicitud.autor;
  const { soyAutor, miAcuerdo, suAcuerdo } = acuerdosCobertura(solicitud, perfil.id);
  const enNegociacion = solicitud.estado === 'propuesta';
  const tomada = solicitud.estado === 'cubierta';
  const finalizada = solicitud.estado === 'finalizada';
  const puedeEscribir = chatAbierto(solicitud);
  const nombreOtro = contraparte?.nombre_completo || 'la otra parte';

  return (
    // pb-16 reserva el alto de la barra inferior, que es `fixed`: sin él el
    // composer quedaría debajo de ella.
    <div className="flex min-h-svh flex-col pb-16">
      <ScreenHeader
        title={contraparte?.nombre_completo ? `Chat con ${contraparte.nombre_completo}` : 'Chat del relevo'}
        fallbackTo="/cobertura-servicio"
        conCampana
      />

      <div className="border-b border-[#E1E8ED] px-5 py-2">
        <p className="text-[12px] text-[#5A6B7A]">{solicitud.tipo_servicio}</p>

        {enNegociacion && (
          <p className="mt-1 text-[12px] text-[#5A6B7A]">
            Aún sin confirmar. Coordinen acá y marquen los dos «Estoy de acuerdo».
          </p>
        )}

        {tomada && (
          <Button variant="danger" fullWidth={false} disabled={finalizando} onClick={handleFinalizar} className="mt-2">
            {finalizando ? 'Finalizando…' : 'Finalizar servicio'}
          </Button>
        )}

        {finalizada && (
          <p className={`mt-1 text-[12px] font-medium ${puedeEscribir ? 'text-[#8A5E17]' : 'text-[#C63B3B]'}`}>
            🏁 Servicio finalizado. {textoVentanaChat(solicitud)}
          </p>
        )}

        {solicitud.estado === 'abierta' && (
          <p className="mt-1 text-[12px] font-medium text-[#C63B3B]">
            Esta solicitud volvió al tablón. El hilo se cerró.
          </p>
        )}
      </div>

      {/* El punto de encuentro (0032). El autor lo ve y lo edita siempre; al que
          releva el backend no le manda nada hasta que HAY acuerdo de las dos
          partes ('cubierta'), no desde que se ofreció — con 0034 el criterio de
          D-064 quedó más estricto que antes, no menos. */}
      {(tomada || finalizada || soyAutor) && (
        <div className="px-5 pt-3">
          <DireccionEncuentroCobertura
            solicitudId={solicitud.id}
            direccion={direccion}
            soyElAutor={soyAutor}
            tomada={tomada || finalizada}
            editable={soyAutor && (enNegociacion || tomada)}
            onGuardada={setDireccion}
            showToast={showToast}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {mensajes.length === 0 && (
          <p className="py-8 text-center text-[13px] text-[#5A6B7A]">
            {puedeEscribir ? 'Todavía no hay mensajes. Coordina el servicio acá.' : 'No hay mensajes que mostrar.'}
          </p>
        )}

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

      {puedeEscribir && (
        <div className="sticky bottom-16 flex flex-col gap-2 border-t border-[#E1E8ED] bg-white px-5 py-3">
          {/* Barra de acuerdo: es donde vive "si ambas partes están de acuerdo,
              el servicio queda tomado". El estado lo deriva el RPC de 0034 de
              las dos banderas — acá solo se marca la propia. */}
          {enNegociacion && (
            <p className="text-[11px] text-[#5A6B7A]">
              Tú: <span className="font-medium text-[#0A1628]">{miAcuerdo ? '✓ de acuerdo' : 'sin confirmar'}</span> ·{' '}
              {nombreOtro}: <span className="font-medium text-[#0A1628]">{suAcuerdo ? '✓ de acuerdo' : 'sin confirmar'}</span>
            </p>
          )}

          {tomada && (
            <p className="text-[12px] font-medium text-[#1A7A5E]">
              ✓ Relevo confirmado por ambas partes. Sigan coordinando por acá hasta finalizarlo.
            </p>
          )}

          <form onSubmit={handleEnviar} className="flex flex-col gap-2">
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

          {enNegociacion && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth={false}
                className="!w-auto flex-1 px-3 py-2 text-[13px]"
                disabled={acordando || miAcuerdo}
                onClick={handleAcordar}
              >
                {miAcuerdo ? 'Ya confirmaste' : acordando ? 'Guardando…' : 'Estoy de acuerdo'}
              </Button>
              <Button
                variant="danger"
                fullWidth={false}
                className="!w-auto px-3 py-2 text-[13px]"
                disabled={descartando}
                onClick={handleDescartar}
              >
                {descartando ? 'Descartando…' : 'Descartar'}
              </Button>
            </div>
          )}
        </div>
      )}

      {!puedeEscribir && finalizada && (
        <div className="sticky bottom-16 border-t border-[#E1E8ED] bg-white px-5 py-3">
          <p className="text-[13px] font-medium text-[#0A1628]">🏁 Servicio finalizado.</p>
          <p className="mt-1 text-[11px] text-[#5A6B7A]">
            Pasaron las 24 horas: el chat se cerró y sus mensajes se borraron. El servicio queda en tu
            historial con el detalle y el punto de encuentro.
          </p>
        </div>
      )}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
      <BottomNav />
    </div>
  );
}
