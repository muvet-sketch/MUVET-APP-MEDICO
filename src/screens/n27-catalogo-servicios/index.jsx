import { useState } from 'react';
import { ScreenHeader } from '../../components/ui';
import TabActivos from './TabActivos';
import TabServicios from './TabServicios';

const TABS = [
  { key: 'activos', label: 'Activos' },
  { key: 'servicios', label: 'Mis Servicios y Tarifas' },
];

export default function N27CatalogoServicios() {
  const [tab, setTab] = useState('activos');

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Mis Domicilios" />

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

      {tab === 'activos' ? <TabActivos /> : <TabServicios />}
    </div>
  );
}
