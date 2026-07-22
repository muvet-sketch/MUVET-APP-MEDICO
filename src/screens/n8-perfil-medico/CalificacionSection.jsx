import { useEffect, useState } from 'react';
import { Card, Badge } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { fetchCalificacionPromedio } from '../../lib/historial';

// Fase 6: calificación real, calculada desde calificaciones_servicio
// (reemplaza el mock de Fase 2). Se puebla vía el simulador dev-only de N-9
// hasta que exista la App Tutor real.
export default function CalificacionSection() {
  const { perfil } = useAuth();
  const [calificacion, setCalificacion] = useState({ promedio: null, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return;
    let active = true;
    fetchCalificacionPromedio(perfil.id)
      .then((data) => {
        if (active) setCalificacion(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Calificación</p>
        {loading && <Badge tone="neutral">Cargando…</Badge>}
      </div>
      {!loading && calificacion.promedio === null && (
        <p className="text-[13px] text-[#5A6B7A]">Sin calificaciones aún.</p>
      )}
      {!loading && calificacion.promedio !== null && (
        <>
          <p className="text-[18px] font-semibold text-[#0A1628]">⭐ {calificacion.promedio.toFixed(1)} / 5.0</p>
          <p className="text-[12px] text-[#5A6B7A]">
            Basada en {calificacion.total} servicio{calificacion.total === 1 ? '' : 's'} completado
            {calificacion.total === 1 ? '' : 's'}
          </p>
        </>
      )}
    </Card>
  );
}
