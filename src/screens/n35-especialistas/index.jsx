// N-35 · MUVET Especialistas. Directorio de médicos especialistas + tablón de
// ofertas entre auxiliares y especialistas.
//
// ✅ Este es el ÚNICO de los cuatro módulos gremiales cuya ruta e
// identificadores coinciden con su nombre visible (/especialistas,
// especialista_*). Ver el bloque de lib/nombresModulos.js.
//
// Dos mitades en un solo módulo, con una sola negociación por detrás:
//
//   DIRECTORIO — todo médico con matrícula validada (D-541) y al menos una
//     especialidad aparece solo, sin activar nada. Lo consultan médicos y
//     clínicas.
//   TABLÓN — auxiliares y médicos-especialistas publican ofertas; solo los
//     médicos-especialistas responden.
//
// Las pestañas visibles dependen del rol Y de si el médico está en el
// directorio: un médico sin especialidades puede BUSCAR especialistas, pero no
// publicar ni responder en el tablón, porque para este módulo todavía no es uno.
// Eso lo cierran igual las policies de 0039 — acá solo se evita mostrar
// pestañas que fallarían al usarlas.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScreenHeader, BottomNav, Card } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { NOMBRE_ESPECIALISTAS } from '../../lib/nombresModulos';
import { faltaParaDirectorio } from '../../lib/especialidades';
import { puedeVerDirectorio, puedePublicarTablon, puedeResponderTablon } from '../../lib/especialistas';
import TabDirectorio from './TabDirectorio';
import TabTablon from './TabTablon';
import TabMiOferta from './TabMiOferta';
import TabConversaciones from './TabConversaciones';

export default function N35Especialistas() {
  const { perfil } = useAuth();
  const [searchParams] = useSearchParams();

  const tabs = useMemo(() => {
    if (!perfil) return [];
    const disponibles = [];
    if (puedeVerDirectorio(perfil.rol)) disponibles.push({ key: 'directorio', label: 'Directorio' });
    if (puedeResponderTablon(perfil)) disponibles.push({ key: 'tablon', label: 'Ofertas' });
    if (puedePublicarTablon(perfil)) disponibles.push({ key: 'mi-oferta', label: 'Mi Oferta' });
    disponibles.push({ key: 'conversaciones', label: 'Conversaciones' });
    return disponibles;
  }, [perfil]);

  // `tab` guarda lo elegido, pero la pestaña que se PINTA se deriva de las
  // disponibles. Dos razones para no confiar solo en el estado:
  //   · en el primer render `perfil` todavía puede ser null, así que `tabs`
  //     está vacío y cualquier inicializador se quedaría fijado en un valor que
  //     luego no existe;
  //   · el juego de pestañas cambia en vivo (un médico que acaba de marcar sus
  //     especialidades gana el tablón), y un deep link `?tab=` puede apuntar a
  //     una pestaña que este rol no tiene.
  const [tab, setTab] = useState(searchParams.get('tab'));
  const tabActiva = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'conversaciones');

  if (!perfil) return null;

  const falta = faltaParaDirectorio(perfil);

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader
        title={NOMBRE_ESPECIALISTAS}
        fallbackTo={perfil.rol === 'medico' ? '/home' : '/home-simplificado'}
        conCampana
      />

      <div className="sticky top-[57px] z-10 flex border-b border-[#E1E8ED] bg-white px-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 border-b-2 px-2 py-3 text-[13px] font-medium ${
              tabActiva === t.key ? 'border-[#1A7A5E] text-[#0A1628]' : 'border-transparent text-[#5A6B7A]'
            }`}
          >
            {tabActiva === t.key ? '● ' : '○ '}
            {t.label}
          </button>
        ))}
      </div>

      {/* Un médico que aún no está en el directorio no ve las pestañas del
          tablón. Decírselo acá evita que lo lea como un error de la app. */}
      {falta && (
        <div className="px-5 pt-4">
          <Card className="text-[12px] text-[#5A6B7A]">
            Todavía no apareces en el directorio ni puedes publicar en el tablón. Falta: <b>{falta}</b> Lo configuras
            en tu perfil.
          </Card>
        </div>
      )}

      {tabActiva === 'directorio' && <TabDirectorio perfil={perfil} />}
      {tabActiva === 'tablon' && <TabTablon perfil={perfil} />}
      {tabActiva === 'mi-oferta' && <TabMiOferta perfil={perfil} />}
      {tabActiva === 'conversaciones' && <TabConversaciones perfil={perfil} />}

      <BottomNav />
    </div>
  );
}
