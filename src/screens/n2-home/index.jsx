import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import {
  expirarSolicitudesVencidas,
  fetchServicioActivoEnCamino,
  fetchSolicitudPendiente,
  fetchSolicitudPreAceptacionById,
  subscribeNuevasSolicitudesPendientes,
} from '../../lib/solicitudes';
import ValidationBadge from './ValidationBadge';
import QuickAccess from './QuickAccess';
import OfertasRecientes from '../../components/home/OfertasRecientes';
import ApoyoDisponibles from '../../components/home/ApoyoDisponibles';
import EspecialistasPreview from '../../components/home/EspecialistasPreview';
import RelevosDisponibles from '../../components/home/RelevosDisponibles';
import MisPublicaciones from '../../components/home/MisPublicaciones';
import HistorialReciente from '../../components/home/HistorialReciente';
import ServiciosAceptados from '../../components/home/ServiciosAceptados';
import { Card, Button, Toast, BottomNav, NotificationBell, AppMenu } from '../../components/ui';
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
        {/* 0028: "Salir" y "Mi perfil" viven ahora en el menú hamburguesa —
            la pestaña "Perfil" de la barra inferior cedió su lugar a
            MUVET Auxiliar. */}
        <div className="flex items-center gap-1">
          <NotificationBell perfilId={perfil.id} />
          <AppMenu />
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

      <QuickAccess />

      {/* Lo acordado en MUVET Turnos y MUVET Auxiliar que sigue en curso: con
          quién, dónde, y la puerta al chat (0028). */}
      <ServiciosAceptados perfil={perfil} />

      {/* Lo propio antes que lo ajeno: lo que YO tengo publicado en los tres
          módulos, con el interruptor de publicada/pausada acá mismo. */}
      <MisPublicaciones perfil={perfil} mostrarToast={mostrarToast} />

      {/* "Actividad reciente" (mock) se movió a N-27 · Mis Domicilios, que es
          su módulo real. Este espacio lo ocupan ahora los TRES tablones
          abiertos —Turnos, Relevo y Auxiliar—, que sí son accionables desde la
          Home, y al fondo la vista previa del historial único. N-28 lleva el
          mismo orden, menos Relevo: ese módulo es solo médico↔médico. */}
      <OfertasRecientes perfil={perfil} />

      <RelevosDisponibles perfil={perfil} />

      <ApoyoDisponibles perfil={perfil} />

      {/* N-35 (0039): el médico no tiene pestaña en la barra inferior para este
          módulo (está llena con los otros tres), así que la Home y el menú
          hamburguesa son sus dos accesos. */}
      <EspecialistasPreview perfil={perfil} />

      <HistorialReciente perfil={perfil} />

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
