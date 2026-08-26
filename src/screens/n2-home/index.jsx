import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { signOut } from '../../lib/auth';
import {
  expirarSolicitudesVencidas,
  fetchServicioActivoEnCamino,
  fetchSolicitudPendiente,
  fetchSolicitudPreAceptacionById,
  subscribeNuevasSolicitudesPendientes,
} from '../../lib/solicitudes';
import ValidationBadge from './ValidationBadge';
import QuickAccess from './QuickAccess';
import OfertasRecientes from './OfertasRecientes';
import { Card, Button, Toast, BottomNav, NotificationBell } from '../../components/ui';
import N3Solicitudes from '../n3-solicitudes';

export default function N2Home() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [servicioActivo, setServicioActivo] = useState(null);
  const [solicitudPendiente, setSolicitudPendiente] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', tone: 'info' });

  // Mientras el médico tiene un servicio 'en_camino' activo, no debe recibir
  // ni procesar nuevas solicitudes.
  useEffect(() => {
    if (!perfil?.id || perfil.rol !== 'medico') return undefined;

    let active = true;
    fetchServicioActivoEnCamino(perfil.id)
      .then((servicio) => {
        if (active) setServicioActivo(servicio ?? null);
      })
      .catch(() => {
        if (active) setServicioActivo(null);
      });

    return () => {
      active = false;
    };
  }, [perfil?.id, perfil?.rol]);

  const mostrarToast = useCallback((message, tone = 'info') => {
    setToast({ visible: true, message, tone });
  }, []);

  useEffect(() => {
    if (!toast.visible) return undefined;
    const timeout = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 4000);
    return () => clearTimeout(timeout);
  }, [toast.visible]);

  // N-3: detección de solicitudes pendientes (Realtime + chequeo al abrir).
  // No se procesa nada si el médico no está disponible o si ya tiene un
  // servicio en camino (ver efecto anterior).
  useEffect(() => {
    if (!perfil?.id || perfil.rol !== 'medico') return undefined;
    if (!perfil.disponible || servicioActivo) {
      setSolicitudPendiente(null);
      return undefined;
    }

    let active = true;

    (async () => {
      try {
        await expirarSolicitudesVencidas();
      } catch {
        // Red de seguridad best-effort: también corre por cron y al aceptar.
      }
      try {
        const pendiente = await fetchSolicitudPendiente();
        if (active) setSolicitudPendiente(pendiente ?? null);
      } catch {
        // Sin acceso a la vista todavía (p.ej. migración no aplicada aún).
      }
    })();

    const unsubscribe = subscribeNuevasSolicitudesPendientes(async (nueva) => {
      try {
        const detalle = await fetchSolicitudPreAceptacionById(nueva.id);
        if (active && detalle) setSolicitudPendiente(detalle);
      } catch {
        // Ignorar: si falla la relectura por vista, esperamos el próximo evento.
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [perfil?.id, perfil?.rol, perfil?.disponible, servicioActivo]);

  function handleAceptada(servicio) {
    setSolicitudPendiente(null);
    navigate(`/constelacion/${servicio.id}`);
  }

  function handleRechazada() {
    setSolicitudPendiente(null);
    mostrarToast('Solicitud rechazada. Sigues disponible.', 'ok');
  }

  function handleCerradaPorEstado(mensaje) {
    setSolicitudPendiente(null);
    mostrarToast(mensaje, 'alert');
  }

  if (!perfil) return null;

  return (
    <div className="flex flex-col gap-5 px-5 py-6 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] text-[#5A6B7A]">Hola,</p>
          <h1 className="text-[18px] font-semibold text-[#0A1628]">{perfil.nombre_completo}</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell perfilId={perfil.id} />
          <button type="button" onClick={signOut} className="text-[12px] text-[#5A6B7A] underline underline-offset-2">
            Salir
          </button>
        </div>
      </div>

      <ValidationBadge estadoValidacion={perfil.estado_validacion} />

      {servicioActivo && (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-[#0A1628]">🟢 Tienes un servicio en camino</p>
          <Button
            variant="outline"
            fullWidth={false}
            onClick={() => navigate(`/constelacion/${servicioActivo.id}`)}
          >
            Ir al servicio
          </Button>
        </Card>
      )}

      <QuickAccess disponible={perfil.disponible} servicioActivo={servicioActivo} />

      {/* "Actividad reciente" (mock) se movió a N-27 · Mis Domicilios, que es
          su módulo real. Este espacio lo ocupan ahora las ofertas de Relevo
          abiertas, que sí son accionables desde la Home. */}
      <OfertasRecientes perfil={perfil} />

      {solicitudPendiente && (
        <N3Solicitudes
          solicitud={solicitudPendiente}
          onAceptada={handleAceptada}
          onRechazada={handleRechazada}
          onCerradaPorEstado={handleCerradaPorEstado}
        />
      )}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
      <BottomNav />
    </div>
  );
}
