import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import {
  CORTO_RELEVO,
  CORTO_TURNOS,
  ICONO_RELEVO,
  ICONO_TURNOS,
} from '../../lib/nombresModulos';

// Barra inferior persistente, cuatro pestañas por rol (D-543: auxiliar y
// clínica no tienen flujo clínico ni ruta de perfil dedicada — "Perfil" para
// auxiliar reabre el panel inline de N-28 vía ?perfil=1, ver
// src/screens/n28-home-simplificado/index.jsx).
//
// El tercer lugar lo ocupaba "Alertas" (N-31). Ahora lo ocupa el módulo
// médico↔médico, que es trabajo accionable; las notificaciones se alcanzan por
// la campana, que está en el header de los dos Home y en el ScreenHeader de
// las pantallas no clínicas (ver ScreenHeader, prop `conCampana`).
//
// Cobertura/"MUVET Relevo" es exclusiva de médicos (la ruta tiene
// allowedRoles=['medico']), así que auxiliar y clínica reciben "Historial" en
// ese lugar. Recordar que los nombres visibles están intercambiados respecto a
// las rutas: ver lib/nombresModulos.js.
const TABS_POR_ROL = {
  medico: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home', activo: (p) => p.startsWith('/home') && p !== '/home-simplificado' },
    { key: 'turnos', label: CORTO_TURNOS, icon: ICONO_TURNOS, to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'relevo', label: CORTO_RELEVO, icon: ICONO_RELEVO, to: '/cobertura-servicio', activo: (p) => p.startsWith('/cobertura-servicio') },
    { key: 'perfil', label: 'Perfil', icon: '👤', to: '/perfil', activo: (p) => p === '/perfil' },
  ],
  auxiliar: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home-simplificado', activo: (p) => p === '/home-simplificado' },
    { key: 'turnos', label: CORTO_TURNOS, icon: ICONO_TURNOS, to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'historial', label: 'Historial', icon: '📋', to: '/historial', activo: (p) => p.startsWith('/historial') },
    { key: 'perfil', label: 'Perfil', icon: '👤', to: '/home-simplificado?perfil=1', activo: () => false },
  ],
  clinica: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home-simplificado', activo: (p) => p === '/home-simplificado' },
    { key: 'turnos', label: CORTO_TURNOS, icon: ICONO_TURNOS, to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'historial', label: 'Historial', icon: '📋', to: '/historial', activo: (p) => p.startsWith('/historial') },
    { key: 'perfil', label: 'Perfil', icon: '👤', to: '/perfil-clinica', activo: (p) => p.startsWith('/perfil-clinica') },
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
