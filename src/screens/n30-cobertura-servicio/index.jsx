// N-30 · MUVET Relevo — médico↔médico. Un médico que no puede atender un
// servicio ya agendado publica los detalles (tipo, zona/perímetro, especie,
// raza, temperamento) y otro médico se ofrece a cubrirlo; ambos acceden
// entonces a un chat en tiempo real (excepción explícita a D-540, confirmada
// con el fundador — ver supabase/migrations/0023_cobertura_servicio.sql)
// activo solo mientras dura el servicio.
//
// OJO: este módulo se llamaba "Cobertura de Servicio" y sus identificadores
// internos siguen diciendo `cobertura` (ruta /cobertura-servicio, tablas
// cobertura_*, lib/coberturaServicio.js). "MUVET Relevo" en la UI = este
// módulo; el de la ruta /relevo es MUVET Turnos, la bolsa gremial (N-26).
// Ver el bloque de lib/nombresModulos.js.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScreenHeader, BottomNav } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { NOMBRE_RELEVO } from '../../lib/nombresModulos';
import { purgarChatsVencidos } from '../../lib/coberturaServicio';
import TabDisponibles from './TabDisponibles';
import TabMisSolicitudes from './TabMisSolicitudes';

// La pestaña "Historial" que vivía aquí se retiró: los apoyos finalizados y
// cancelados están ahora en el historial único de /historial (N-9), junto al
// historial de MUVET Turnos. Ver lib/historialUnificado.js.
const TABS = [
  { key: 'disponibles', label: 'Disponibles' },
  { key: 'mis-solicitudes', label: 'Mis Solicitudes' },
];

const TABS_VALIDAS = TABS.map((t) => t.key);

export default function N30CoberturaServicio() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // La pestaña inicial puede venir por deep link (/cobertura-servicio?tab=...),
  // que es como entra la sección de este módulo en la Home. Mismo patrón que
  // /relevo?tab=ofertas y /apoyo?tab=disponibles.
  const tabInicial = searchParams.get('tab');
  const [tab, setTab] = useState(
    TABS_VALIDAS.includes(tabInicial) ? tabInicial : 'disponibles',
  );

  // Purga perezosa de los chats cuya ventana de 24 h ya venció (0034 §4.6).
  // Best-effort: la ventana la cierra la RLS, esto solo hace efectivo el
  // borrado. Mismo criterio que `expirarSolicitudesVencidas` en la Home.
  useEffect(() => {
    if (!perfil?.id) return;
    purgarChatsVencidos().catch(() => {});
  }, [perfil?.id]);

  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title={NOMBRE_RELEVO} fallbackTo="/home" conCampana />

      <div className="sticky top-[57px] z-10 flex border-b border-[#E1E8ED] bg-white px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 border-b-2 px-2 py-3 text-[13px] font-medium ${
              tab === t.key ? 'border-[#1A7A5E] text-[#0A1628]' : 'border-transparent text-[#5A6B7A]'
            }`}
          >
            {tab === t.key ? '● ' : '○ '}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end px-5 pt-3">
        <button
          type="button"
          onClick={() => navigate('/historial')}
          className="text-[12px] font-medium text-[#1A7A5E]"
        >
          Ver historial →
        </button>
      </div>

      {tab === 'disponibles' && <TabDisponibles perfil={perfil} />}
      {tab === 'mis-solicitudes' && <TabMisSolicitudes perfil={perfil} />}
      <BottomNav />
    </div>
  );
}
