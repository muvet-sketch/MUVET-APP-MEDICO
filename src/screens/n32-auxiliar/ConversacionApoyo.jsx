// N-32 · MUVET Auxiliar — negociación 1:1 médico↔auxiliar.
//
// Reúne las tres cosas que el fundador pidió y que ningún módulo tenía juntas:
//
//   1. Chat EN TIEMPO REAL (sin refrescar) — subscribeMensajesApoyo.
//   2. El chat sigue ABIERTO tras el acuerdo y se cierra al FINALIZAR el
//      servicio, no al aceptarlo. Lo impone la policy de insert de 0028
//      (`estado in ('abierta','aceptada')`), no esta pantalla.
//   3. Al haber acuerdo mutuo se comparte la DIRECCIÓN DE ENCUENTRO. También
//      es backend: la policy de select de `apoyo_direccion` no le devuelve
//      nada al auxiliar antes del acuerdo (D-064).
//
// Y una que se pidió por omisión: aquí NO se muestra ningún teléfono. Toda la
// comunicación se canaliza por este chat, que por eso tiene que sobrevivir al
// acuerdo.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { ScreenHeader, Card, Badge, Button, Modal, Toast } from '../../components/ui';
import BurbujasMensajes from '../../components/chat/BurbujasMensajes';
import PanelPagoServicio from '../../components/PanelPagoServicio';
import DireccionEncuentro from './DireccionEncuentro';
import { validateResultFile } from '../../lib/fileValidation';
import { formatCOP } from '../../lib/format';
import {
  fetchConversacionApoyo,
  fetchMensajesApoyo,
  fetchDireccionEncuentro,
  fetchFichaContactoApoyo,
  enviarMensajeApoyo,
  acordarConversacionApoyo,
  descartarConversacionApoyo,
  finalizarServicioApoyo,
  marcarConversacionApoyoLeida,
  subscribeMensajesApoyo,
  subscribeConversacionApoyo,
  getSignedApoyoChatFileUrl,
  esParteAutora,
  chatAbierto,
  labelSubtipo,
  formatFechaApoyo,
  formatFranjaApoyo,
} from '../../lib/apoyo';

const ESTADO_BADGE = {
  abierta: { label: 'En conversación', tone: 'info' },
  aceptada: { label: 'Servicio confirmado', tone: 'ok' },
  finalizada: { label: 'Servicio finalizado', tone: 'neutral' },
  descartada: { label: 'Descartada', tone: 'critical' },
};

export default function ConversacionApoyo() {
  const { conversacionId } = useParams();
  const { perfil } = useAuth();
  const navigate = useNavigate();

  const [conversacion, setConversacion] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [direccion, setDireccion] = useState(null);
  const [ficha, setFicha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [acordando, setAcordando] = useState(false);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [confirmandoFinal, setConfirmandoFinal] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;
    setLoading(true);
    Promise.all([
      fetchConversacionApoyo(conversacionId, perfil.id),
      fetchMensajesApoyo(conversacionId),
    ])
      .then(([c, m]) => {
        if (!activo) return;
        setConversacion(c);
        setMensajes(m);
      })
      .catch(() => {
        if (activo) setError('No se pudo cargar la conversación.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [conversacionId, perfil?.id]);

  // Mensajes en vivo. Se deduplica por id porque el emisor también recibe su
  // propio INSERT — por eso handleEnviar no hace append optimista.
  useEffect(() => {
    return subscribeMensajesApoyo(conversacionId, (nuevo) => {
      setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]));
    });
  }, [conversacionId]);

  // La fila de la conversación en vivo: así cada parte ve el acuerdo o la
  // finalización de la otra sin recargar.
  useEffect(() => {
    return subscribeConversacionApoyo(conversacionId, (nueva) => {
      setConversacion((prev) => (prev ? { ...prev, ...nueva } : prev));
    });
  }, [conversacionId]);

  useEffect(() => {
    if (!conversacion || !perfil?.id) return;
    marcarConversacionApoyoLeida(conversacion, perfil.id).catch(() => {});
  }, [conversacion?.id, perfil?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // La dirección se vuelve a pedir cuando cambia el estado: es exactamente el
  // momento en que el backend empieza (o deja) de devolvérsela al auxiliar.
  useEffect(() => {
    if (!conversacion?.id) return undefined;
    let activo = true;
    fetchDireccionEncuentro(conversacion.id)
      .then((d) => {
        if (activo) setDireccion(d);
      })
      .catch(() => {
        if (activo) setDireccion(null);
      });
    return () => {
      activo = false;
    };
  }, [conversacion?.id, conversacion?.estado]);

  useEffect(() => {
    const otroId = conversacion?.otro?.id;
    if (!otroId) return undefined;
    let activo = true;
    fetchFichaContactoApoyo(otroId)
      .then((f) => {
        if (activo) setFicha(f);
      })
      .catch(() => {
        if (activo) setFicha(null);
      });
    return () => {
      activo = false;
    };
  }, [conversacion?.otro?.id]);

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
      await enviarMensajeApoyo({
        conversacionId,
        remitenteId: perfil.id,
        mensaje: texto.trim() || null,
        archivo,
      });
      setTexto('');
      setArchivo(null);
    } catch (err) {
      setError(err.message ?? 'No se pudo enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleAcordar() {
    setAcordando(true);
    try {
      const actualizada = await acordarConversacionApoyo(conversacion, perfil.id);
      setConversacion((prev) => ({ ...prev, ...actualizada }));
      showToast(
        actualizada.estado === 'aceptada'
          ? '¡Servicio confirmado! Ya pueden ver el punto de encuentro.'
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
    try {
      const actualizada = await descartarConversacionApoyo(conversacionId);
      setConversacion((prev) => ({ ...prev, ...actualizada }));
      setConfirmandoDescarte(false);
      showToast('Conversación descartada.', 'ok');
    } catch (err) {
      showToast(err.message ?? 'No se pudo descartar.', 'critical');
    }
  }

  async function handleFinalizar() {
    try {
      await finalizarServicioApoyo(conversacionId);
      const actualizada = await fetchConversacionApoyo(conversacionId, perfil.id);
      setConversacion(actualizada);
      setConfirmandoFinal(false);
      showToast('Servicio finalizado. El historial del chat queda guardado.', 'ok');
    } catch (err) {
      showToast(err.message ?? 'No se pudo finalizar el servicio.', 'critical');
    }
  }

  const resolverUrlAdjunto = useCallback((path) => getSignedApoyoChatFileUrl(path), []);

  if (!perfil) return null;

  if (loading) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Conversación" fallbackTo="/apoyo?tab=conversaciones" />
        <p className="px-5 py-5 text-[12px] text-[#5A6B7A]">Cargando…</p>
      </div>
    );
  }

  if (!conversacion) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Conversación" fallbackTo="/apoyo?tab=conversaciones" />
        <div className="px-5 py-5">
          <Card className="text-center text-[13px] text-[#5A6B7A]">
            Esta conversación no existe o ya no tienes acceso a ella.
          </Card>
          <Button className="mt-3" onClick={() => navigate('/apoyo?tab=conversaciones')}>
            Volver a mis conversaciones
          </Button>
        </div>
      </div>
    );
  }

  const soyAutora = esParteAutora(conversacion, perfil.id);
  const nombreOtro = conversacion.otro?.nombre_completo || conversacion.otro?.razon_social || 'Usuario MUVET';
  const abierta = conversacion.estado === 'abierta';
  const aceptada = conversacion.estado === 'aceptada';
  const puedeEscribir = chatAbierto(conversacion);
  const miAcuerdo = soyAutora ? conversacion.acuerdo_autor : conversacion.acuerdo_interesado;
  const suAcuerdo = soyAutora ? conversacion.acuerdo_interesado : conversacion.acuerdo_autor;
  const badge = ESTADO_BADGE[conversacion.estado] ?? ESTADO_BADGE.abierta;
  const publicacion = conversacion.publicacion;
  const soyElMedico = perfil.rol === 'medico';
  const fecha = formatFechaApoyo(publicacion);
  const franja = formatFranjaApoyo(publicacion);

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title={nombreOtro} fallbackTo="/apoyo?tab=conversaciones" conCampana />

      <div className="flex flex-col gap-3 px-5 py-4">
        <Card className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#0A1628]">{nombreOtro}</p>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          <p className="text-[12px] text-[#5A6B7A]">
            {conversacion.otro?.rol === 'medico' ? '🩺 Médico' : '🧰 Auxiliar'}
            {ficha?.especialidad ? ` · ${ficha.especialidad}` : ''}
          </p>
          {ficha?.matricula_comvezcol && (
            <p className="text-[11px] text-[#5A6B7A]">
              Matrícula COMVEZCOL {ficha.matricula_comvezcol}
              {ficha.estado_validacion === 'validado' ? ' · ✅ validada' : ''}
            </p>
          )}
          <p className="text-[13px] font-medium text-[#0A1628]">
            {labelSubtipo(conversacion.servicio_subtipo)}
          </p>
          <p className="text-[13px] text-[#0A1628]">{publicacion?.descripcion || '(sin descripción)'}</p>
          <p className="text-[12px] text-[#5A6B7A]">
            {publicacion?.zona ? `📍 ${publicacion.zona}` : ''}
            {fecha ? ` · ${fecha}` : ''}
            {franja ? ` · ${franja}` : ''}
          </p>
          {publicacion?.tarifa != null && (
            <p className="text-[13px] font-semibold text-[#1A7A5E]">{formatCOP(publicacion.tarifa)}</p>
          )}
        </Card>

        {/* El punto de encuentro. Antes del acuerdo el auxiliar recibe null
            desde el backend; el médico ve y edita su borrador. */}
        {(aceptada || conversacion.estado === 'finalizada' || soyElMedico) && (
          <DireccionEncuentro
            conversacionId={conversacion.id}
            direccion={direccion}
            soyElMedico={soyElMedico}
            editable={puedeEscribir}
            onGuardada={setDireccion}
            showToast={showToast}
          />
        )}

        {(aceptada || conversacion.estado === 'finalizada') && (
          <PanelPagoServicio
            modulo="apoyo"
            servicioId={conversacion.id}
            fila={conversacion}
            perfil={perfil}
            nombreContraparte={nombreOtro}
            onCambio={async () => {
              const actualizada = await fetchConversacionApoyo(conversacionId, perfil.id);
              setConversacion(actualizada);
            }}
          />
        )}
      </div>

      <BurbujasMensajes
        mensajes={mensajes}
        perfilId={perfil.id}
        resolverUrlAdjunto={resolverUrlAdjunto}
        vacio="Todavía no hay mensajes. Coordina el servicio acá."
      />

      {puedeEscribir && (
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[#E1E8ED] bg-white px-5 py-3">
          {abierta && (
            <p className="text-[11px] text-[#5A6B7A]">
              Tú: <span className="font-medium text-[#0A1628]">{miAcuerdo ? '✓ de acuerdo' : 'sin confirmar'}</span> ·{' '}
              {nombreOtro}:{' '}
              <span className="font-medium text-[#0A1628]">{suAcuerdo ? '✓ de acuerdo' : 'sin confirmar'}</span>
            </p>
          )}

          {aceptada && (
            <p className="text-[12px] font-medium text-[#1A7A5E]">
              ✓ Servicio confirmado. Sigan coordinando por acá hasta finalizarlo.
            </p>
          )}

          {archivo && (
            <p className="text-[12px] text-[#5A6B7A]">
              📎 {archivo.name}{' '}
              <button type="button" onClick={() => setArchivo(null)} className="text-[#C63B3B] underline">
                quitar
              </button>
            </p>
          )}
          {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

          <form onSubmit={handleEnviar} className="flex items-center gap-2">
            <label className="cursor-pointer text-[20px]">
              📎
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
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
          </form>

          {abierta && (
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
                onClick={() => setConfirmandoDescarte(true)}
              >
                Descartar
              </Button>
            </div>
          )}

          {aceptada && (
            <Button variant="danger" onClick={() => setConfirmandoFinal(true)}>
              Finalizar servicio
            </Button>
          )}
        </div>
      )}

      {conversacion.estado === 'finalizada' && (
        <div className="sticky bottom-0 border-t border-[#E1E8ED] bg-white px-5 py-3">
          <p className="text-[13px] font-medium text-[#0A1628]">🏁 Servicio finalizado.</p>
          <p className="mt-1 text-[11px] text-[#5A6B7A]">
            El chat quedó cerrado a mensajes nuevos, pero el historial se conserva acá.
          </p>
        </div>
      )}

      {conversacion.estado === 'descartada' && (
        <div className="sticky bottom-0 border-t border-[#E1E8ED] bg-white px-5 py-3">
          <p className="text-[13px] font-medium text-[#C63B3B]">
            {conversacion.descartada_por === perfil.id
              ? 'Descartaste esta conversación.'
              : `${nombreOtro} descartó esta conversación.`}
          </p>
          <p className="mt-1 text-[11px] text-[#5A6B7A]">No admite mensajes nuevos.</p>
        </div>
      )}

      <Modal open={confirmandoDescarte} onClose={() => setConfirmandoDescarte(false)} title="Descartar conversación">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#0A1628]">
            Se cierra para las dos partes y no se puede reabrir.
          </p>
          <Button variant="danger" onClick={handleDescartar}>
            Sí, descartar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmandoDescarte(false)}>
            Volver
          </Button>
        </div>
      </Modal>

      <Modal open={confirmandoFinal} onClose={() => setConfirmandoFinal(false)} title="Finalizar servicio">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#0A1628]">
            Da el servicio por cumplido. El chat se cierra a mensajes nuevos, pero el historial queda
            guardado y podrás consultarlo desde tu historial.
          </p>
          <Button variant="danger" onClick={handleFinalizar}>
            Sí, finalizar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmandoFinal(false)}>
            Volver
          </Button>
        </div>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
