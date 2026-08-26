// N-9 · Historial único: Cobertura de Servicio + MUVET Relevo, en una sola
// lista cronológica.
//
// Antes esta pantalla era el historial de DOMICILIOS (servicios cerrados +
// expediente de solo lectura). Ese contenido se movió completo a su propio
// módulo, N-27 · Mis Domicilios → "Actividad reciente", porque el lanzamiento
// inicial va con Cobertura y Relevo y domicilios queda para más adelante: nada
// de domicilios debe aparecer en los demás módulos. El `?servicio=<id>` que
// esta pantalla aceptaba ahora lo atiende /servicios (ver N-19, "Ver
// expediente cerrado").
//
// Las dos fuentes se agregan en lib/historialUnificado.js; aquí solo se
// filtran por origen y se listan.
import { useEffect, useState } from 'react';
import { Card, ScreenHeader, BottomNav } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { fetchHistorialUnificado, ORIGENES_HISTORIAL } from '../../lib/historialUnificado';
import ItemHistorial from './ItemHistorial';

export default function N9Historial() {
  const { perfil } = useAuth();
  const [items, setItems] = useState([]);
  const [familia, setFamilia] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    setLoading(true);
    fetchHistorialUnificado(perfil.id)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar el historial.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  const visibles = familia ? items.filter((i) => i.familia === familia) : items;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Historial" fallbackTo={perfil?.rol === 'medico' ? '/home' : '/home-simplificado'} />

      <div className="flex flex-1 flex-col gap-3 px-5 py-5 pb-24">
        <div className="flex gap-2">
          {ORIGENES_HISTORIAL.map((o) => (
            <button
              key={o.value || 'todo'}
              type="button"
              onClick={() => setFamilia(o.value)}
              className={`flex-1 whitespace-nowrap rounded-[10px] border px-1 py-2 text-[11px] ${
                familia === o.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

        {!loading && visibles.length === 0 && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">
              {familia ? 'Nada finalizado todavía en esta categoría.' : 'Todavía no tienes actividad finalizada.'}
            </p>
          </Card>
        )}

        {!loading && visibles.map((item) => <ItemHistorial key={item.id} item={item} perfilId={perfil?.id} />)}
      </div>

      <BottomNav />
    </div>
  );
}
