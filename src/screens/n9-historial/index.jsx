// N-9 · Historial único: MUVET Relevo (N-30) + MUVET Turnos (N-26), en una
// sola lista cronológica. Los identificadores internos van al revés que los
// nombres — ver el bloque de lib/nombresModulos.js.
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
import { fetchHistorialUnificado, ORIGENES_HISTORIAL, estaPendienteDePago } from '../../lib/historialUnificado';
import ItemHistorial from './ItemHistorial';

export default function N9Historial() {
  const { perfil } = useAuth();
  const [items, setItems] = useState([]);
  const [familia, setFamilia] = useState('');
  const [soloPendientesPago, setSoloPendientesPago] = useState(false);
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

  const visibles = items
    .filter((i) => (familia ? i.familia === familia : true))
    .filter((i) => (soloPendientesPago ? estaPendienteDePago(i) : true));

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Historial" fallbackTo={perfil?.rol === 'medico' ? '/home' : '/home-simplificado'} conCampana />

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

        <button
          type="button"
          onClick={() => setSoloPendientesPago((v) => !v)}
          className={`self-start rounded-[10px] border px-3 py-2 text-[11px] ${
            soloPendientesPago
              ? 'border-[#B26A00] bg-[#F5A62333] text-[#0A1628]'
              : 'border-[#E1E8ED] text-[#5A6B7A]'
          }`}
        >
          {soloPendientesPago ? '✓ Solo pendientes de pago' : 'Pendientes de pago'}
        </button>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

        {!loading && visibles.length === 0 && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">
              {soloPendientesPago
                ? 'No tienes servicios pendientes de pago.'
                : familia
                  ? 'Nada finalizado todavía en esta categoría.'
                  : 'Todavía no tienes actividad finalizada.'}
            </p>
          </Card>
        )}

        {!loading &&
          visibles.map((item) => (
            <ItemHistorial key={item.id} item={item} perfilId={perfil?.id} perfil={perfil} />
          ))}
      </div>

      <BottomNav />
    </div>
  );
}
