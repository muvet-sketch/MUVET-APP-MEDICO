// N-32 · MUVET Auxiliar — médico↔auxiliar (migración 0028).
//
// El auxiliar publica su disponibilidad y el médico busca auxiliares
// disponibles o publica el servicio que necesita, en dos modalidades:
// ACOMPAÑAMIENTO (el auxiliar lo acompaña en su jornada) o TAREA EN DOMICILIO
// (el auxiliar va solo, sin el médico presente).
//
// ⚠️ El identificador interno es `apoyo`, no `auxiliar`: `auxiliar` ya es un
// valor de perfiles.rol. Ver el bloque de lib/nombresModulos.js.
//
// Este matching salió de MUVET Turnos (N-26), donde vivía como las
// combinaciones (busco, auxiliar) y (ofrezco, medico). Turnos queda para lo
// que involucra a una clínica.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScreenHeader, BottomNav, Toast } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { NOMBRE_AUXILIAR } from '../../lib/nombresModulos';
import TabDisponibles from './TabDisponibles';
import TabMiPublicacion from './TabMiPublicacion';
import TabConversacionesApoyo from './TabConversacionesApoyo';

const TABS = [
  { key: 'disponibles', label: 'Disponibles' },
  { key: 'mi-publicacion', label: 'Mi publicación' },
  { key: 'conversaciones', label: 'Conversaciones' },
];

export default function N32Auxiliar() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  // El tab sale de la URL para que los deep links de las notificaciones
  // (/apoyo?tab=conversaciones) caigan donde corresponde.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabUrl = searchParams.get('tab');
  const tab = TABS.some((t) => t.key === tabUrl) ? tabUrl : 'disponibles';
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }

  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title={NOMBRE_AUXILIAR} fallbackTo="/home" conCampana />

      <div className="sticky top-[57px] z-10 flex border-b border-[#E1E8ED] bg-white px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSearchParams({ tab: t.key })}
            className={`flex-1 border-b-2 px-1 py-3 text-[12px] font-medium ${
              tab === t.key ? 'border-[#1A7A5E] text-[#0A1628]' : 'border-transparent text-[#5A6B7A]'
            }`}
          >
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

      {tab === 'disponibles' && <TabDisponibles perfil={perfil} showToast={showToast} />}
      {tab === 'mi-publicacion' && <TabMiPublicacion perfil={perfil} showToast={showToast} />}
      {tab === 'conversaciones' && <TabConversacionesApoyo perfil={perfil} />}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
      <BottomNav />
    </div>
  );
}
