import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { crearTicket, fetchMisTickets } from '../../lib/soporte';
import { estaEnDisputa } from '../../lib/verificacionComvezcol';
import { Card, Button, Badge, Toast, ScreenHeader } from '../../components/ui';

const ESTADO_TICKET = {
  abierto: { tone: 'alert', label: 'Abierto' },
  en_proceso: { tone: 'info', label: 'En proceso' },
  cerrado: { tone: 'ok', label: 'Cerrado' },
};

// Pantalla de soporte. Cumple dos funciones a la vez:
//   · Es donde aterriza quien quedó bloqueado por posible suplantación
//     ('en_disputa', ver 0025): le explica por qué no puede usar la app y le
//     da el canal para resolver la controversia.
//   · Para cualquier otro perfil es simplemente el canal de soporte.
export default function Soporte() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const bloqueado = estaEnDisputa(perfil);

  const [mensaje, setMensaje] = useState('');
  const [tickets, setTickets] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    fetchMisTickets(perfil.id)
      .then((filas) => {
        if (active) setTickets(filas);
      })
      .catch(() => {
        if (active) setTickets([]);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!mensaje.trim()) {
      setError('Escribe una descripción del caso.');
      return;
    }

    setEnviando(true);
    try {
      const nuevo = await crearTicket({ perfilId: perfil.id, mensaje: mensaje.trim() });
      setTickets((prev) => [nuevo, ...prev]);
      setMensaje('');
      showToast('Mensaje enviado a soporte.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#F7F9FB]">
      {/* Quien está bloqueado no tiene a dónde "volver": el resto de la app le
          está vedado, así que el header con flecha atrás solo se muestra a
          quien entró a soporte por su cuenta. */}
      {!bloqueado ? (
        <ScreenHeader title="Soporte" />
      ) : (
        <div className="sticky top-0 z-10 border-b border-[#E1E8ED] bg-white px-5 py-4">
          <h1 className="text-[16px] font-semibold text-[#0A1628]">Soporte</h1>
        </div>
      )}

      <div className="flex flex-col gap-4 px-5 py-5">
        {bloqueado && (
          <Card className="flex flex-col gap-3 border-l-4 border-l-[#C63B3B]">
            <p className="text-[14px] font-semibold text-[#0A1628]">
              Tu cuenta está temporalmente restringida
            </p>
            <p className="text-[14px] leading-relaxed text-[#5A6B7A]">
              La matrícula COMVEZCOL <strong>{perfil?.matricula_comvezcol}</strong> figura a nombre de
              otro profesional o ya está registrada en otra cuenta de MUVET. Mientras se resuelve, solo
              puedes actualizar tus datos y escribirnos por acá.
            </p>
            <p className="text-[12px] text-[#5A6B7A]">
              Si fue un error al escribir tu matrícula, corrígela en tu perfil y la verificamos de nuevo.
            </p>
            <Button variant="outline" onClick={() => navigate('/perfil')}>
              Ir a mi perfil
            </Button>
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#0A1628]">
            {bloqueado ? 'Explícanos tu caso' : '¿En qué te ayudamos?'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="w-full text-left">
              <label htmlFor="mensaje-soporte" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
                Mensaje
              </label>
              <textarea
                id="mensaje-soporte"
                rows={5}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder={
                  bloqueado
                    ? 'Cuéntanos quién eres y cómo podemos confirmar tu matrícula.'
                    : 'Describe tu solicitud.'
                }
                className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628]"
              />
            </div>

            {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

            <Button type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar a soporte'}
            </Button>
          </form>
        </Card>

        {tickets.length > 0 && (
          <Card className="flex flex-col gap-3">
            <p className="text-[14px] font-semibold text-[#0A1628]">Mis mensajes</p>
            {tickets.map((t) => {
              const estado = ESTADO_TICKET[t.estado] ?? ESTADO_TICKET.abierto;
              return (
                <div key={t.id} className="flex flex-col gap-1 border-b border-[#E1E8ED] pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-[#5A6B7A]">
                      {new Date(t.created_at).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <Badge tone={estado.tone}>{estado.label}</Badge>
                  </div>
                  <p className="text-[14px] text-[#0A1628]">{t.mensaje}</p>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
