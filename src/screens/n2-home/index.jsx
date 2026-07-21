import { useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';
import ValidationBadge from './ValidationBadge';
import DisponibleToggle from './DisponibleToggle';
import QuickAccess from './QuickAccess';
import ActivityFeed from './ActivityFeed';

export default function N2Home() {
  const { perfil, refreshPerfil } = useAuth();
  const [tieneServiciosConPrecio, setTieneServiciosConPrecio] = useState(false);
  const [loadingServicios, setLoadingServicios] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return;

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

  if (!perfil) return null;

  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] text-[#5A6B7A]">Hola,</p>
          <h1 className="text-[18px] font-semibold text-[#0A1628]">{perfil.nombre_completo}</h1>
        </div>
        <button type="button" onClick={signOut} className="text-[12px] text-[#5A6B7A] underline underline-offset-2">
          Salir
        </button>
      </div>

      <ValidationBadge estadoValidacion={perfil.estado_validacion} />

      {!loadingServicios && (
        <DisponibleToggle
          estadoValidacion={perfil.estado_validacion}
          tieneServiciosConPrecio={tieneServiciosConPrecio}
          disponible={perfil.disponible}
          onToggle={handleToggleDisponible}
        />
      )}

      <QuickAccess />

      <ActivityFeed />
    </div>
  );
}
