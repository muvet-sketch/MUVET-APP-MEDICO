// N-27 · Mis Domicilios. Módulo autocontenido de la atención domiciliaria:
// disponibilidad, servicios en curso, actividad reciente, historial de
// servicios cerrados (con su expediente de solo lectura) y catálogo de
// tarifas. El lanzamiento inicial va con Cobertura y Relevo, así que todo lo
// de domicilios vive aquí y no aparece en los demás módulos — el historial de
// domicilios salió de N-9 (ahora historial único de Cobertura + Relevo) y
// quedó agrupado bajo "Actividad reciente" en la pestaña "Activos".
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { ScreenHeader } from '../../components/ui';
import DisponibleToggle from '../n2-home/DisponibleToggle';
import TabActivos from './TabActivos';
import TabServicios from './TabServicios';
import DetalleServicio from './DetalleServicio';

const TABS = [
  { key: 'activos', label: 'Activos' },
  { key: 'servicios', label: 'Mis Servicios y Tarifas' },
];

export default function N27CatalogoServicios() {
  const { perfil, refreshPerfil } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState('activos');
  const [tieneServiciosConPrecio, setTieneServiciosConPrecio] = useState(false);
  const [loadingServicios, setLoadingServicios] = useState(true);

  // `?servicio=<id>` abre el expediente cerrado directo, sin ruta nueva —
  // mismo patrón que usaba N-9 antes de la reorganización. Lo usa el botón
  // "Ver expediente cerrado" de N-19 (cierre de servicio).
  const servicioSeleccionado = searchParams.get('servicio');

  useEffect(() => {
    if (!perfil?.id) return undefined;

    let active = true;
    setLoadingServicios(true);
    supabase
      .from('catalogo_servicios_medico')
      .select('id', { count: 'exact', head: true })
      .eq('medico_id', perfil.id)
      .gt('precio', 0)
      .then(({ count }) => {
        if (active) {
          setTieneServiciosConPrecio(Boolean(count && count > 0));
          setLoadingServicios(false);
        }
      });

    return () => {
      active = false;
    };
  }, [perfil?.id]);

  async function handleToggleDisponible(nuevoValor) {
    if (!perfil?.id) return;
    const { error } = await supabase.from('perfiles').update({ disponible: nuevoValor }).eq('id', perfil.id);
    if (!error) {
      await refreshPerfil();
    }
  }

  if (servicioSeleccionado) {
    return (
      <DetalleServicio
        servicioId={servicioSeleccionado}
        onVolver={() => setSearchParams({}, { replace: true })}
      />
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Mis Domicilios" />

      {!loadingServicios && perfil && (
        <div className="px-5 pt-4">
          <DisponibleToggle
            estadoValidacion={perfil.estado_validacion}
            tieneServiciosConPrecio={tieneServiciosConPrecio}
            disponible={perfil.disponible}
            onToggle={handleToggleDisponible}
          />
        </div>
      )}

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

      {tab === 'activos' ? <TabActivos perfil={perfil} /> : <TabServicios />}
    </div>
  );
}
