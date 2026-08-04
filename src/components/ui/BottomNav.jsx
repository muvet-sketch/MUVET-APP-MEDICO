import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';

// Barra inferior persistente: Inicio / Relevo / Perfil. Cada rol tiene sus
// propias rutas (D-543: auxiliar/clínica no tienen flujo clínico ni ruta de
// perfil dedicada — "Perfil" para auxiliar reabre el panel inline de N-28
// vía ?perfil=1, ver src/screens/n28-home-simplificado/index.jsx).
const TABS_POR_ROL = {
  medico: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home', activo: (p) => p.startsWith('/home') && p !== '/home-simplificado' },
    { key: 'relevo', label: 'Relevo', icon: '🔄', to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'perfil', label: 'Perfil', icon: '👤', to: '/perfil', activo: (p) => p === '/perfil' },
  ],
  auxiliar: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home-simplificado', activo: (p) => p === '/home-simplificado' },
    { key: 'relevo', label: 'Relevo', icon: '🔄', to: '/relevo', activo: (p) => p.startsWith('/relevo') },
    { key: 'perfil', label: 'Perfil', icon: '👤', to: '/home-simplificado?perfil=1', activo: () => false },
  ],
  clinica: [
    { key: 'home', label: 'Inicio', icon: '🏠', to: '/home-simplificado', activo: (p) => p === '/home-simplificado' },
    { key: 'relevo', label: 'Relevo', icon: '🔄', to: '/relevo', activo: (p) => p.startsWith('/relevo') },
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
            <span className="text-[18px]" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
