import { useEffect, useState } from 'react';
import { fetchHistorial } from '../../lib/coberturaServicio';
import SolicitudCard from './SolicitudCard';

// Historial de apoyos prestados y solicitados: detalle del servicio + el
// otro médico involucrado, SIN el historial del chat (los mensajes ya se
// borraron al finalizar — ver cobertura_finalizar_servicio en 0023).
export default function TabHistorial({ perfil }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchHistorial(perfil.id)
      .then((data) => {
        if (active) setSolicitudes(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil.id]);

  if (loading) return <p className="px-5 py-6 text-center text-[13px] text-[#5A6B7A]">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3 px-5 py-4 pb-24">
      {solicitudes.length === 0 && (
        <p className="py-8 text-center text-[13px] text-[#5A6B7A]">Todavía no tienes apoyos finalizados.</p>
      )}

      {solicitudes.map((s) => (
        <SolicitudCard key={s.id} solicitud={s} />
      ))}
    </div>
  );
}
