// N-26 · MUVET Turnos — hilo de negociación 1:1.
//
// OJO: el identificador interno de este módulo sigue siendo `relevo` (ruta
// /relevo, lib/relevo.js, tablas relevo_*) pero de cara al usuario se llama
// "MUVET Turnos"; "MUVET Relevo" es ahora el módulo médico↔médico de N-30.
// Ver el bloque de lib/nombresModulos.js.
//
// MODIFICACIÓN A D-540 confirmada con el fundador (ver migración 0027): este
// módulo deja de ser "un mensaje único de contacto" y pasa a tener un hilo
// privado entre las DOS partes de una postulación, que vive SOLO mientras dura
// la negociación. Al aceptarse o descartarse, el hilo se cierra a mensajes nuevos
// — y no es una condición de esta pantalla: la policy de insert de 0027 exige
// `conversacion.estado = 'abierta'`.
//
// Sin adjuntos y sin tiempo real, a diferencia de ChatCobertura (0023), de
// donde sí se toma la estructura visual (burbujas + composer sticky).
//
// El relevo se cierra con el acuerdo de AMBAS partes: cada una pulsa "Estoy de
// acuerdo" y el trigger de 0027 deriva `estado` de las dos banderas. Es el
// espíritu de la confirmación doble de 0016 —que 0020 había quitado por
// fricción— pero ahora sí tiene contenido que ratificar.
//
// SUPUESTO: el hilo se cierra al aceptar, que es lo decidido con el fundador,
// pero deja a las dos partes sin canal dentro de la app justo cuando empiezan a
// coordinar el turno. Lo compensa que el teléfono se revele en ese mismo
// momento (relevo_ficha_contacto, 0027). Confirmar tras usarlo si conviene
// mantenerlo abierto hasta finalizarPublicacion.
//
// SUPUESTO: sin realtime ni límite de mensajes. El hilo refresca al montar y
// tras enviar; `relevo_mensajes` ya está en la publicación `supabase_realtime`
// (0013), así que activarlo después no exige migración.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { ScreenHeader, Card, Badge, Button, Modal, Toast } from '../../components/ui';
import { formatCOP, formatFechaCorta } from '../../lib/format';
import {
  fetchConversacion,
  fetchMensajesConversacion,
  enviarMensajeConversacion,
  acordarConversacion,
  descartarConversacion,
  marcarConversacionLeida,
  fetchFichaContacto,
  esParteAutora,
  formatFranjaHoraria,
} from '../../lib/relevo';
import FichaContacto from './FichaContacto';

const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

const ESTADO_BADGE = {
  abierta: { label: 'En conversación', tone: 'info' },
  aceptada: { label: 'Turno confirmado', tone: 'ok' },
  descartada: { label: 'Descartada', tone: 'critical' },
};

export default function ConversacionRelevo() {
  const { conversacionId } = useParams();
  const { perfil } = useAuth();
  const navigate = useNavigate();

  const [conversacion, setConversacion] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [ficha, setFicha] = useState(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [acordando, setAcordando] = useState(false);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });
  const bottomRef = useRef(null);

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;
    setLoading(true);
    Promise.all([fetchConversacion(conversacionId, perfil.id), fetchMensajesConversacion(conversacionId)])
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

  // Al abrir se da por vista: apaga el punto rojo de la bandeja. La campana es
  // otra cosa (tabla `notificaciones`, 0026) y se apaga en /notificaciones.
  useEffect(() => {
    if (!conversacion || !perfil?.id) return;
    marcarConversacionLeida(conversacion, perfil.id).catch(() => {});
  }, [conversacion?.id, perfil?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // La ficha ampliada (0027) depende del estado: los datos profesionales
  // llegan desde que hay conversación, el teléfono solo cuando está aceptada.
  // Por eso se vuelve a pedir cuando cambia `estado`.
  useEffect(() => {
    const otroId = conversacion?.otro?.id;
    if (!otroId) return undefined;
    let activo = true;
    setCargandoFicha(true);
    fetchFichaContacto(otroId)
      .then((f) => {
        if (activo) setFicha(f);
      })
      .catch(() => {
        if (activo) setFicha(null);
      })
      .finally(() => {
        if (activo) setCargandoFicha(false);
      });
    return () => {
      activo = false;
    };
  }, [conversacion?.otro?.id, conversacion?.estado]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  async function handleEnviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError('');
    try {
      const nuevo = await enviarMensajeConversacion({
        conversacionId,
        remitenteId: perfil.id,
        mensaje: texto,
      });
      setMensajes((prev) => [...prev, nuevo]);
      setTexto('');
    } catch (err) {
      setError(err.message ?? 'No se pudo enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }

  async function handleAcordar() {
    setAcordando(true);
    try {
      const actualizada = await acordarConversacion(conversacion, perfil.id);
      setConversacion((prev) => ({ ...prev, ...actualizada }));
      showToast(
        actualizada.estado === 'aceptada'
          ? '¡Turno confirmado! Ya pueden coordinar por teléfono.'
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
      const actualizada = await descartarConversacion(conversacionId);
      setConversacion((prev) => ({ ...prev, ...actualizada }));
      setConfirmandoDescarte(false);
      showToast('Conversación descartada.', 'ok');
    } catch (err) {
      showToast(err.message ?? 'No se pudo descartar la conversación.', 'critical');
    } finally {
      setDescartando(false);
    }
  }

  if (!perfil) return null;

  if (loading) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Conversación" fallbackTo="/relevo?tab=mensajes" />
        <p className="px-5 py-5 text-[12px] text-[#5A6B7A]">Cargando…</p>
      </div>
    );
  }

  if (!conversacion) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Conversación" fallbackTo="/relevo?tab=mensajes" />
        <div className="px-5 py-5">
          <Card className="text-center text-[12px] text-[#5A6B7A]">
            Esta conversación no existe o ya no tienes acceso a ella.
          </Card>
          <Button className="mt-3" onClick={() => navigate('/relevo?tab=mensajes')}>
            Volver a mis conversaciones
          </Button>
        </div>
      </div>
    );
  }

  const soyAutora = esParteAutora(conversacion, perfil.id);
  const nombreOtro = conversacion.otro?.razon_social || conversacion.otro?.nombre_completo || 'Usuario MUVET';
  const abierta = conversacion.estado === 'abierta';
  const miAcuerdo = soyAutora ? conversacion.acuerdo_autor : conversacion.acuerdo_interesado;
  const suAcuerdo = soyAutora ? conversacion.acuerdo_interesado : conversacion.acuerdo_autor;
  const estadoBadge = ESTADO_BADGE[conversacion.estado] ?? ESTADO_BADGE.abierta;
  const publicacion = conversacion.publicacion;
  const franja = formatFranjaHoraria(publicacion);

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title={nombreOtro} fallbackTo="/relevo?tab=mensajes" conCampana />

      <div className="flex flex-col gap-3 px-5 py-4">
        <Card className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#0A1628]">{nombreOtro}</p>
            <Badge tone={estadoBadge.tone}>{estadoBadge.label}</Badge>
          </div>
          <p className="text-[11px] text-[#5A6B7A]">{ACTOR_LABEL[conversacion.otro?.rol] ?? ''}</p>
          <p className="text-[13px] text-[#0A1628]">Sobre: {publicacion?.descripcion || '(sin descripción)'}</p>
          <p className="text-[12px] text-[#5A6B7A]">
            {publicacion?.zona ? `📍 ${publicacion.zona}` : ''}
            {publicacion?.tipo_jornada ? ` · ${publicacion.tipo_jornada}` : ''}
            {franja ? ` · ${franja}` : ''}
          </p>
          {publicacion?.tarifa != null && (
            <p className="text-[13px] font-semibold text-[#1A7A5E]">{formatCOP(publicacion.tarifa)}</p>
          )}
          <FichaContacto ficha={ficha} cargando={cargandoFicha} />
        </Card>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {mensajes.length === 0 && (
          <p className="py-8 text-center text-[13px] text-[#5A6B7A]">Todavía no hay mensajes.</p>
        )}
        <div className="flex flex-col gap-2 pb-4">
          {mensajes.map((m) => {
            const esMio = m.remitente_id === perfil.id;
            return (
              <div key={m.id} className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[80%] rounded-[12px] px-3 py-2 ${
                    esMio ? 'bg-[#0A1628] text-white' : 'bg-[#F4F7F9] text-[#0A1628]'
                  }`}
                >
                  <p className="text-[13px]">{m.mensaje}</p>
                </div>
                <p className="mt-0.5 text-[11px] text-[#5A6B7A]">{formatFechaCorta(m.created_at)}</p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Barra de acuerdo: es donde vive "si ambas partes están de acuerdo se
          acepta la oferta". El estado lo deriva el trigger de 0027 de las dos
          banderas — acá solo se marca la propia. */}
      {abierta && (
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[#E1E8ED] bg-white px-5 py-3">
          <p className="text-[11px] text-[#5A6B7A]">
            Tú: <span className="font-medium text-[#0A1628]">{miAcuerdo ? '✓ de acuerdo' : 'sin confirmar'}</span> ·{' '}
            {nombreOtro}: <span className="font-medium text-[#0A1628]">{suAcuerdo ? '✓ de acuerdo' : 'sin confirmar'}</span>
          </p>

          {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

          <form onSubmit={handleEnviar} className="flex items-center gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe un mensaje…"
              className="flex-1 rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
            />
            <Button type="submit" fullWidth={false} disabled={enviando || !texto.trim()}>
              Enviar
            </Button>
          </form>

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
        </div>
      )}

      {conversacion.estado === 'aceptada' && (
        <div className="sticky bottom-0 border-t border-[#E1E8ED] bg-white px-5 py-3">
          <p className="text-[13px] font-medium text-[#1A7A5E]">
            ✓ Turno confirmado por ambas partes. Coordinen los detalles por teléfono.
          </p>
          <p className="mt-1 text-[11px] text-[#5A6B7A]">
            La conversación queda cerrada a mensajes nuevos y pasa a tu historial.
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
          <p className="mt-1 text-[11px] text-[#5A6B7A]">No admite mensajes nuevos. Puedes buscar otras ofertas.</p>
        </div>
      )}

      <Modal open={confirmandoDescarte} onClose={() => setConfirmandoDescarte(false)} title="Descartar conversación">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#0A1628]">
            Esta acción es permanente: la conversación se cierra para las dos partes y no se puede reabrir. Si quieres
            retomar el contacto tendrás que esperar a una oferta nueva.
          </p>
          <Button variant="danger" disabled={descartando} onClick={handleDescartar}>
            {descartando ? 'Descartando…' : 'Sí, descartar'}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmandoDescarte(false)}>
            Volver
          </Button>
        </div>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
