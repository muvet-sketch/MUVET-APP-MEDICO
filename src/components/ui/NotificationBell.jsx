import { useNavigate } from 'react-router-dom';
import useNotificacionesNoLeidas from './useNotificacionesNoLeidas';

// Campana de notificaciones. Hasta 0026 armaba el badge sumando dos consultas
// a `relevo_mensajes` (mensajes recibidos sin leer + decisiones sin ver) y
// elegía a qué pestaña de /relevo saltar según cuál de las dos tuviera algo.
// Ahora hay una tabla `notificaciones` real: el badge es un solo contador y el
// toque siempre lleva a N-31, que es donde se ve qué pasó y desde donde cada
// notificación navega a su destino.
export default function NotificationBell({ perfilId }) {
  const navigate = useNavigate();
  const count = useNotificacionesNoLeidas(perfilId);

  return (
    <button
      type="button"
      onClick={() => navigate('/notificaciones')}
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
