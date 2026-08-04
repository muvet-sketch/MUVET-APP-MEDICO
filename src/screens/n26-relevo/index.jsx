// N-26 · MUVET Relevo (Fase 7). "Ofertas" (explorar y aceptar de otros +
// solicitudes recibidas sobre mis propias ofertas) / "Mi Oferta" (publicar,
// activar/desactivar, editar, mis postulaciones) / "Mensajes" entre médico,
// auxiliar y clínica. D-540: mensaje único de contacto, sin
// chat en tiempo real. D-545 (revisado, ver PUBLICACIONES_PERMITIDAS_POR_ROL
// en lib/relevo.js): médico ofrece a clínicas o solicita apoyo a un
// auxiliar; auxiliar ofrece a clínicas y a médicos; clínica busca médico o
// auxiliar. Esquema y RLS desde 0001, estado de aceptación de solicitudes
// agregado en 0011.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScreenHeader, BottomNav } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import TabMiOferta from './TabMiOferta';
import TabOfertas from './TabOfertas';
import TabMensajes from './TabMensajes';

const TABS = [
  { key: 'ofertas', label: 'Ofertas' },
  { key: 'mi-oferta', label: 'Mi Oferta' },
  { key: 'mensajes', label: 'Mensajes' },
];

export default function N26Relevo() {
  const { perfil } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'ofertas');

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

      {tab === 'ofertas' && (
        <TabOfertas perfil={perfil} rolInicial={searchParams.get('rol') || ''} />
      )}
      {tab === 'mi-oferta' && <TabMiOferta perfil={perfil} />}
      {tab === 'mensajes' && <TabMensajes perfil={perfil} />}
      <BottomNav />
    </div>
  );
}
