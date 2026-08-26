// Cobertura de Servicio — función nueva, médico↔médico (distinta de MUVET
// Relevo/N-26 y de la pestaña "Apoyo Médico" del auxiliar en Relevo, que es
// auxiliar→médico). Un médico que no puede atender un servicio ya agendado
// publica los detalles (tipo, zona/perímetro, especie, raza, temperamento) y
// otro médico se ofrece a cubrirlo; ambos acceden entonces a un chat en
// tiempo real (excepción explícita a D-540, confirmada con el fundador —
// ver supabase/migrations/0023_cobertura_servicio.sql) activo solo mientras
// dura el servicio. Historial de apoyos prestados/solicitados sin el chat.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader, BottomNav } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import TabDisponibles from './TabDisponibles';
import TabMisSolicitudes from './TabMisSolicitudes';

// La pestaña "Historial" que vivía aquí se retiró: los apoyos finalizados y
// cancelados están ahora en el historial único de /historial (N-9), junto al
// historial de Relevo. Ver lib/historialUnificado.js.
const TABS = [
  { key: 'disponibles', label: 'Disponibles' },
  { key: 'mis-solicitudes', label: 'Mis Solicitudes' },
];

export default function N30CoberturaServicio() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('disponibles');

  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Cobertura de Servicio" fallbackTo="/home" />

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
