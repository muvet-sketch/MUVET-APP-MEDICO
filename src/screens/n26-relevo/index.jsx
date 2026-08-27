// N-26 · MUVET Turnos. "Ofertas" (explorar y contactar las de otros) / "Mi
// Oferta" (publicar, activar/desactivar, editar) / "Conversaciones" (los dos
// lados de cada negociación) entre médico, auxiliar y clínica.
//
// OJO: la ruta sigue siendo /relevo y el identificador interno `relevo` — solo
// cambió el nombre de cara al usuario. Ver el bloque de lib/nombresModulos.js.
//
// D-540 modificado en 0027 y otra vez en 0028: hay hilo 1:1 privado, ahora en
// TIEMPO REAL, que sobrevive al acuerdo y se cierra al finalizar el servicio.
// El turno se cierra con el acuerdo de AMBAS partes.
//
// D-545 (revisado en 0028, ver PUBLICACIONES_PERMITIDAS_POR_ROL en
// lib/relevo.js): toda publicación de este módulo involucra a una clínica —
// médico y auxiliar ofrecen disponibilidad a clínicas, y la clínica busca
// médico o auxiliar. El matching médico↔auxiliar se mudó a MUVET Auxiliar
// (N-32, ruta /apoyo).
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScreenHeader, BottomNav } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { NOMBRE_TURNOS } from '../../lib/nombresModulos';
import TabMiOferta from './TabMiOferta';
import TabOfertas from './TabOfertas';
import TabConversaciones from './TabConversaciones';

// La clave de la tercera pestaña sigue siendo 'mensajes' aunque la etiqueta
// cambie: hay notificaciones anteriores a 0027 con `/relevo?tab=mensajes`
// guardado en su `url`, y deben seguir aterrizando acá.
const TABS = [
  { key: 'ofertas', label: 'Ofertas' },
  { key: 'mi-oferta', label: 'Mi Oferta' },
  { key: 'mensajes', label: 'Conversaciones' },
];

export default function N26Relevo() {
  const { perfil } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'ofertas');

  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title={NOMBRE_TURNOS} fallbackTo={perfil.rol === 'medico' ? '/home' : '/home-simplificado'} conCampana />

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
      {tab === 'mensajes' && <TabConversaciones perfil={perfil} />}
      <BottomNav />
    </div>
  );
}
