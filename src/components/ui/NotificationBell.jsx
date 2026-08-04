import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMensajesNoLeidosCount,
  subscribeNuevosMensajesRelevo,
  fetchPostulacionesNoLeidasCount,
  subscribeDecisionesRelevo,
} from '../../lib/relevo';

// Campana de notificaciones de MUVET Relevo (D-540: mensaje único de
// contacto). Combina dos avisos independientes, porque cualquier perfil
// puede estar en ambos lados a la vez: mensajes recibidos sobre mis propias
// publicaciones (lado autor, pestaña "Mensajes") y decisiones (aceptada /
// rechazada, 0020) sobre ofertas que validé (lado interesado, "Mi Oferta ›
// Mis postulaciones").
export default function NotificationBell({ perfilId }) {
  const navigate = useNavigate();
  const [mensajesCount, setMensajesCount] = useState(0);
  const [decisionesCount, setDecisionesCount] = useState(0);

  const refrescarMensajes = useCallback(() => {
    if (!perfilId) return;
    fetchMensajesNoLeidosCount(perfilId)
      .then(setMensajesCount)
      .catch(() => {});
  }, [perfilId]);

  const refrescarDecisiones = useCallback(() => {
    if (!perfilId) return;
    fetchPostulacionesNoLeidasCount(perfilId)
      .then(setDecisionesCount)
      .catch(() => {});
  }, [perfilId]);

  useEffect(() => {
    refrescarMensajes();
  }, [refrescarMensajes]);

  useEffect(() => {
    refrescarDecisiones();
  }, [refrescarDecisiones]);

  useEffect(() => {
    if (!perfilId) return undefined;
    const unsubscribe = subscribeNuevosMensajesRelevo(perfilId, () => {
      setMensajesCount((c) => c + 1);
    });
    return unsubscribe;
  }, [perfilId]);

  useEffect(() => {
    if (!perfilId) return undefined;
    const unsubscribe = subscribeDecisionesRelevo(perfilId, () => {
      setDecisionesCount((c) => c + 1);
    });
    return unsubscribe;
  }, [perfilId]);

  const count = mensajesCount + decisionesCount;

  // Un solo destino posible por toque: si hay mensajes sin leer se prioriza
  // esa pestaña (es la más urgente, puede ser una postulación nueva sobre mi
  // oferta); si no, y hay decisiones sin ver, va a "Mi Oferta".
  function handleClick() {
    if (mensajesCount > 0) navigate('/relevo?tab=mensajes');
    else if (decisionesCount > 0) navigate('/relevo?tab=mi-oferta');
    else navigate('/relevo?tab=mensajes');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={count > 0 ? `Notificaciones: ${count} sin leer` : 'Notificaciones'}
      className="relative px-1 text-[18px] text-[#0A1628]"
    >
      <span aria-hidden="true">🔔</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#C63B3B] px-1 text-[9px] font-semibold leading-none text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
