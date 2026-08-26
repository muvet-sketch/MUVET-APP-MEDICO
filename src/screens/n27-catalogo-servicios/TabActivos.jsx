import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Badge, Button } from '../../components/ui';
import { fetchServiciosCerrados, simularCalificacionTutor } from '../../lib/historial';
import { formatFechaCorta } from '../../lib/format';
import { MOCK_ACTIVOS_HOY, MOCK_ACTIVIDAD_RECIENTE } from '../../mocks/mockData';

// MOCK — aún no hay servicios reales conectados aquí (N-3/N-4/N-21 se construyen en Fase 3).
function ActivoCard({ item }) {
  const enCurso = item.estado === 'en_curso';
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1">
          {enCurso ? <Badge tone="ok">🟢 EN CURSO</Badge> : <Badge tone="neutral">✅ Completado</Badge>}
        </div>
        <p className="truncate text-[14px] font-medium text-[#0A1628]">
          {item.mascota} ({item.especie})
        </p>
        <p className="truncate text-[12px] text-[#5A6B7A]">
          {item.tutor} · {item.fecha ? `${item.fecha} · ` : ''}
          {item.hora}
        </p>
      </div>
      <Button variant="outline" fullWidth={false} onClick={() => {} /* TODO Fase 4/6: navegación real */}>
        {enCurso ? 'Ir →' : 'Ver →'}
      </Button>
    </Card>
  );
}

// "Actividad reciente" — trasladada aquí desde la Home (N-2), que ahora usa
// ese espacio para las ofertas recientes de Relevo. Es actividad de
// domicilios, así que su lugar es este módulo. Sigue siendo mock (mismo
// contenido que tenía en la Home); debajo va el historial real de servicios
// cerrados, que salió de N-9 al volverse esa pantalla el historial único de
// Cobertura + Relevo.
export default function TabActivos({ perfil }) {
  const [, setSearchParams] = useSearchParams();
  const [cerrados, setCerrados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [simulando, setSimulando] = useState(null);

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    setLoading(true);
    fetchServiciosCerrados(perfil.id)
      .then((data) => {
        if (active) setCerrados(data);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar la actividad reciente.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  async function handleSimularCalificacion(servicioId, rating) {
    setSimulando(servicioId);
    try {
      await simularCalificacionTutor(servicioId, { rating, comentario: 'Calificación simulada (dev)' });
      setCerrados(await fetchServiciosCerrados(perfil.id));
    } catch (err) {
      setError(err.message ?? 'No se pudo simular la calificación.');
    } finally {
      setSimulando(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-5 pb-24">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Hoy</p>
        <Badge tone="neutral">Datos de ejemplo</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {MOCK_ACTIVOS_HOY.length === 0 && (
          <Card className="text-center text-[12px] text-[#5A6B7A]">Sin servicios hoy.</Card>
        )}
        {MOCK_ACTIVOS_HOY.map((item) => (
          <ActivoCard key={item.id} item={item} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Actividad reciente</p>
        <Badge tone="neutral">Datos de ejemplo</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {MOCK_ACTIVIDAD_RECIENTE.map((item) => (
          <Card key={item.id} className="flex flex-col gap-0.5">
            <p className="text-[14px] font-medium text-[#0A1628]">{item.titulo}</p>
            <p className="text-[12px] text-[#5A6B7A]">{item.descripcion}</p>
          </Card>
        ))}

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

        {!loading && cerrados.length === 0 && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">Sin servicios cerrados todavía.</p>
          </Card>
        )}

        {!loading &&
          cerrados.map((servicio) => {
            const calificacion = servicio.calificaciones_servicio?.[0];
            return (
              <Card key={servicio.id} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setSearchParams({ servicio: servicio.id })}
                  className="flex flex-col gap-1 text-left"
                >
                  <p className="text-[14px] font-semibold text-[#0A1628]">{servicio.mascotas?.nombre ?? 'Sin nombre'}</p>
                  <p className="text-[12px] text-[#5A6B7A]">{formatFechaCorta(servicio.cerrado_at)}</p>
                  {calificacion ? (
                    <Badge tone="ok">⭐ {calificacion.rating} / 5</Badge>
                  ) : (
                    <Badge tone="neutral">Sin calificación</Badge>
                  )}
                </button>

                {import.meta.env.DEV && !calificacion && (
                  <div className="flex items-center gap-2 border-t border-[#E1E8ED] pt-2">
                    <p className="text-[11px] text-[#8A5E17]">🧪 Simular calificación del tutor:</p>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={simulando === servicio.id}
                        onClick={() => handleSimularCalificacion(servicio.id, n)}
                        className="text-[14px] disabled:opacity-50"
                        aria-label={`Calificar con ${n} estrellas`}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
