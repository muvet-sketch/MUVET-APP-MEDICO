import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import {
  CORTO_AUXILIAR,
  CORTO_RELEVO,
  CORTO_TURNOS,
  ICONO_AUXILIAR,
  ICONO_RELEVO,
  ICONO_TURNOS,
} from '../../lib/nombresModulos';

// Barra inferior persistente, hasta cuatro pestañas por rol.
//
// El tercer lugar lo ocupaba "Alertas" (N-31). Ahora lo ocupa el módulo
// médico↔médico, que es trabajo accionable; las notificaciones se alcanzan por
// la campana, que está en el header de los dos Home y en el ScreenHeader de
// las pantallas no clínicas (ver ScreenHeader, prop `conCampana`).
//
// 0028: "Perfil" SALE de la barra en los tres roles y se muda al menú
// hamburguesa del header (components/ui/AppMenu.jsx), junto con "Cerrar
// sesión". El hueco lo ocupa "MUVET Auxiliar" (/apoyo), que es trabajo
// accionable y no cabía de otro modo. La clínica no participa en ese módulo
// (es médico↔auxiliar), así que se queda con tres pestañas.
//
// N-34: "Historial" SALE de la barra de auxiliar y clínica y su lugar lo toma
// "Mensajes" (/mensajes) — conversar es trabajo accionable y el historial es
// consulta ocasional. Historial no se pierde: queda en el menú hamburguesa,
// que es por donde el médico ya llegaba (nunca tuvo la pestaña). La barra del
// médico no cambia: sus cuatro lugares son los tres módulos gremiales + Inicio,
// y a Mensajes llega por el menú.
//
// Recordar que los nombres visibles NO coinciden con las rutas en ninguno de
// los tres módulos gremiales: ver lib/nombresModulos.js.
const TABS_POR_ROL = {
  medico: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home', activo: (p) => p.startsWith('/home') && p !== '/home-simplificado' },
    { key: 'turnos', label: CORTO_TURNOS, icon: ICONO_TURNOS, to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'relevo', label: CORTO_RELEVO, icon: ICONO_RELEVO, to: '/cobertura-servicio', activo: (p) => p.startsWith('/cobertura-servicio') },
    { key: 'apoyo', label: CORTO_AUXILIAR, icon: ICONO_AUXILIAR, to: '/apoyo', activo: (p) => p.startsWith('/apoyo') },
  ],
  auxiliar: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home-simplificado', activo: (p) => p === '/home-simplificado' },
    { key: 'turnos', label: CORTO_TURNOS, icon: ICONO_TURNOS, to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'apoyo', label: CORTO_AUXILIAR, icon: ICONO_AUXILIAR, to: '/apoyo', activo: (p) => p.startsWith('/apoyo') },
    { key: 'mensajes', label: 'Mensajes', icon: '💬', to: '/mensajes', activo: (p) => p.startsWith('/mensajes') },
  ],
  clinica: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home-simplificado', activo: (p) => p === '/home-simplificado' },
    { key: 'turnos', label: CORTO_TURNOS, icon: ICONO_TURNOS, to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'mensajes', label: 'Mensajes', icon: '💬', to: '/mensajes', activo: (p) => p.startsWith('/mensajes') },
  ],
};

export default function BottomNav() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!perfil) return null;
  const tabs = TABS_POR_ROL[perfil.rol] ?? TABS_POR_ROL.medico;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[430px] border-t border-[#E1E8ED] bg-white px-2 py-2">
      {tabs.map((tab) => {
        const activo = tab.activo(location.pathname);
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => navigate(tab.to)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${
              activo ? 'text-[#1A7A5E]' : 'text-[#5A6B7A]'
            }`}
          >
            <span className="text-[18px]" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
