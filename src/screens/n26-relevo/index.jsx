// N-26 · MUVET Relevo (Fase 7). Publicar/buscar/contactar entre médico,
// auxiliar y clínica. D-540: mensaje único de contacto, sin chat en tiempo
// real. D-545: clínica solo publica "busco médico/auxiliar"; médico/auxiliar
// solo "ofrezco disponibilidad". Esquema y RLS ya existían desde 0001.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScreenHeader } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import TabPublicar from './TabPublicar';
import TabBuscar from './TabBuscar';
import TabMensajes from './TabMensajes';

const TABS = [
  { key: 'buscar', label: 'Buscar' },
  { key: 'publicar', label: 'Publicar' },
  { key: 'mensajes', label: 'Mensajes' },
];

export default function N26Relevo() {
  const { perfil } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('rol') || searchParams.get('tipo') ? 'buscar' : 'buscar');

  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="MUVET Relevo" fallbackTo={perfil.rol === 'medico' ? '/home' : '/home-simplificado'} />

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

      {tab === 'buscar' && (
        <TabBuscar
          perfil={perfil}
          rolInicial={searchParams.get('rol') || ''}
          tipoInicial={searchParams.get('tipo') || ''}
        />
      )}
      {tab === 'publicar' && <TabPublicar perfil={perfil} />}
      {tab === 'mensajes' && <TabMensajes perfil={perfil} />}
    </div>
  );
}
