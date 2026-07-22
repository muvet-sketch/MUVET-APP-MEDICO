// N-21: Apertura del servicio · Check-in de llegada (D-537) + doble consentimiento (D-116)
//
// Renumerada a N-21 en la reconciliación de Fase 5 (Acción 0,
// DESP-CLAUDECODE-P-EI-AppMedico-005). Sustancias Controladas
// (antes n21-sustancias-controladas) se retiró como pantalla propia — su
// aviso (D-539) se construye dentro de N-12 · Fórmula.
//
// -- SUPUESTO (D-116): el aviso de consentimiento al tutor se dispara
// siempre al confirmar el médico (no solo cuando pide IRIS) — ver la nota
// larga en supabase/migrations/0006_apertura_consentimiento.sql. Un
// rechazo explícito del tutor bloquea la apertura (Reintentar/Cancelar);
// aceptación o falta de respuesta en 60s la habilita. Solo iris_activo
// depende de si el médico pidió IRIS.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Button, Modal, Badge, ScreenHeader } from '../../components/ui';
import { fetchServicioDetalle, cancelarServicio } from '../../lib/solicitudes';
import {
  registrarCheckinLlegada,
  registrarConsentimientoMedico,
  registrarRespuestaTutorMock,
  reintentarConsentimientoTutor,
  abrirConstelacion,
} from '../../lib/apertura';

function segundosRestantes(expiraEn) {
  if (!expiraEn) return 0;
  return Math.max(0, Math.ceil((new Date(expiraEn).getTime() - Date.now()) / 1000));
}

export default function N21AperturaServicio() {
  const { servicioId } = useParams();
  const navigate = useNavigate();

  const [servicio, setServicio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [tick, setTick] = useState(0);
  const abriendoRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchServicioDetalle(servicioId)
      .then((data) => {
        if (active) setServicio(data);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar el servicio.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [servicioId]);

  useEffect(() => {
    if (!servicio) return undefined;
    if (servicio.estado === 'activa') {
      navigate(`/servicio/${servicioId}/activo`, { replace: true });
    } else if (servicio.estado === 'cancelada' || servicio.estado === 'cerrada') {
      navigate('/home', { replace: true });
    }
    return undefined;
  }, [servicio, servicioId, navigate]);

  const esperandoTutor =
    servicio?.estado === 'en_apertura' &&
    servicio.consentimiento_medico_at &&
    !servicio.consentimiento_tutor_rechazado_at;

  // Cuenta regresiva de 60s (D-116) — el servidor es quien valida el
  // vencimiento real en abrir_constelacion; esto solo actualiza la UI.
  useEffect(() => {
    if (!esperandoTutor) return undefined;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [esperandoTutor]);

  useEffect(() => {
    if (!esperandoTutor || servicio.consentimiento_tutor_at) return;
    if (segundosRestantes(servicio.consentimiento_tutor_expira_en) > 0) return;
    if (abriendoRef.current) return;
    abriendoRef.current = true;
    handleAbrirConstelacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperandoTutor, tick]);

  useEffect(() => {
    if (servicio?.consentimiento_tutor_at && !abriendoRef.current) {
      abriendoRef.current = true;
      handleAbrirConstelacion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio?.consentimiento_tutor_at]);

  async function handleCheckin() {
    setProcesando(true);
    setError('');
    try {
      const actualizado = await registrarCheckinLlegada(servicioId);
      setServicio((prev) => ({ ...prev, ...actualizado }));
    } catch (err) {
      setError(err.message ?? 'No se pudo registrar el check-in.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleConsentimientoMedico(irisSolicitado) {
    setProcesando(true);
    setError('');
    try {
      const actualizado = await registrarConsentimientoMedico(servicioId, irisSolicitado);
      setServicio((prev) => ({ ...prev, ...actualizado }));
    } catch (err) {
      setError(err.message ?? 'No se pudo registrar el consentimiento.');
    } finally {
      setProcesando(false);
    }
  }

  // MOCK — ver nota de cabecera y src/lib/apertura.js.
  async function handleRespuestaTutorMock(aceptado) {
    setProcesando(true);
    setError('');
    try {
      const actualizado = await registrarRespuestaTutorMock(servicioId, aceptado);
      setServicio((prev) => ({ ...prev, ...actualizado }));
    } catch (err) {
      setError(err.message ?? 'No se pudo registrar la respuesta del tutor.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleReintentar() {
    setProcesando(true);
    setError('');
    abriendoRef.current = false;
    try {
      const actualizado = await reintentarConsentimientoTutor(servicioId);
      setServicio((prev) => ({ ...prev, ...actualizado }));
    } catch (err) {
      setError(err.message ?? 'No se pudo reintentar el consentimiento.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleCancelar() {
    setProcesando(true);
    setError('');
    try {
      await cancelarServicio(servicioId);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.message ?? 'No se pudo cancelar el servicio.');
      setProcesando(false);
    }
  }

  async function handleAbrirConstelacion() {
    try {
      await abrirConstelacion(servicioId);
      navigate(`/servicio/${servicioId}/activo`, { replace: true });
    } catch (err) {
      abriendoRef.current = false;
      setError(err.message ?? 'No se pudo abrir la Constelación.');
    }
  }

  if (loading) return null;

  if (error && !servicio) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Apertura del servicio" />
        <p className="px-5 py-6 text-[13px] text-[#C63B3B]">{error}</p>
      </div>
    );
  }

  if (!servicio) return null;

  const mascota = servicio.mascotas;
  const restantes = segundosRestantes(servicio.consentimiento_tutor_expira_en);

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Apertura del servicio" />

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <Card>
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
          <p className="text-[16px] font-semibold text-[#0A1628]">{mascota?.nombre ?? 'Sin nombre'}</p>
        </Card>

        {servicio.estado === 'en_camino' && (
          <Card className="flex flex-col gap-3">
            <p className="text-[13px] text-[#5A6B7A]">
              Al confirmar la llegada se registra la hora de check-in. Este dato es inmutable (D-537).
            </p>
            <Button onClick={handleCheckin} disabled={procesando}>
              {procesando ? 'Registrando…' : 'Confirmar llegada'}
            </Button>
          </Card>
        )}

        {servicio.estado === 'en_apertura' && !servicio.consentimiento_medico_at && (
          <Card className="flex flex-col gap-3">
            <Badge tone="ok">🟢 Llegada registrada</Badge>
            <p className="text-[14px] font-semibold text-[#0A1628]">Consentimiento IRIS</p>
            <p className="text-[13px] text-[#5A6B7A]">
              IRIS puede ayudar a redactar un borrador de la nota SOAP durante la consulta, a partir de lo que se
              dicte o registre. El médico siempre revisa y aprueba cada nota antes de guardarla — IRIS nunca escribe
              el registro clínico final por sí sola.
            </p>
            <Button onClick={() => handleConsentimientoMedico(true)} disabled={procesando}>
              ACEPTO · ACTIVAR IRIS
            </Button>
            <Button variant="outline" onClick={() => handleConsentimientoMedico(false)} disabled={procesando}>
              No activar IRIS
            </Button>
          </Card>
        )}

        {esperandoTutor && !servicio.consentimiento_tutor_at && (
          <Card className="flex flex-col gap-3">
            <Badge tone="info">Esperando confirmación del tutor</Badge>
            <p className="text-[13px] text-[#5A6B7A]">
              Se notificó al tutor (NanIA) para iniciar la consulta{servicio.iris_solicitado ? ' con IRIS activo' : ''}.
              Tiempo restante: {restantes}s.
            </p>
            {import.meta.env.DEV && (
              <div className="flex flex-col gap-2 rounded-[10px] border border-[#E8A23D] p-3">
                <p className="text-[11px] font-semibold text-[#8A5E17]">
                  ⚠ MOCK / DEV ONLY — simula la respuesta de la App Tutor (aún no existe).
                </p>
                <Button
                  variant="secondary"
                  onClick={() => handleRespuestaTutorMock(true)}
                  disabled={procesando}
                >
                  🧪 (DEV) Tutor acepta
                </Button>
                <Button variant="outline" onClick={() => handleRespuestaTutorMock(false)} disabled={procesando}>
                  🧪 (DEV) Tutor rechaza
                </Button>
              </div>
            )}
          </Card>
        )}

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
      </div>

      <Modal
        open={Boolean(servicio.consentimiento_tutor_rechazado_at)}
        onClose={() => {}}
        title="El tutor no confirmó"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#5A6B7A]">
            El tutor rechazó el consentimiento. Sin este paso la Constelación no puede abrir (D-116).
          </p>
          <Button onClick={handleReintentar} disabled={procesando}>
            Reintentar
          </Button>
          <Button variant="ghost" onClick={handleCancelar} disabled={procesando}>
            Cancelar servicio
          </Button>
        </div>
      </Modal>
    </div>
  );
}
