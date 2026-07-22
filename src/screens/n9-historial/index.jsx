// N-9 · Historial de servicios cerrados (Fase 6, Acción 4)
//
// Lista de servicios `cerrada` del médico. Al seleccionar uno: expediente
// completo de solo lectura (SOAP, fórmula, órdenes, recomendaciones) vía
// DetalleServicio.jsx. La calificación real reemplaza el mock de N-8
// (CalificacionSection.jsx, Fase 2) — se puebla con el simulador dev-only de
// abajo (MOCK: la App Tutor no existe todavía, mismo patrón que
// src/dev/SimuladorSolicitud.jsx de Fase 3).
//
// Soporta `?servicio=<id>` para abrir un detalle directo (usado por el
// botón "Ver expediente cerrado" de N-19) sin necesitar una ruta nueva.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Badge, ScreenHeader } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { fetchServiciosCerrados, simularCalificacionTutor } from '../../lib/historial';
import { formatFechaCorta } from '../../lib/format';
import DetalleServicio from './DetalleServicio';

export default function N9Historial() {
  const { perfil } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [simulando, setSimulando] = useState(null);

  const servicioSeleccionado = searchParams.get('servicio');

  useEffect(() => {
    if (!perfil?.id) return;
    let active = true;
    setLoading(true);
    fetchServiciosCerrados(perfil.id)
      .then((data) => {
        if (active) setServicios(data);
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

  async function handleSimularCalificacion(servicioId, rating) {
    setSimulando(servicioId);
    try {
      await simularCalificacionTutor(servicioId, { rating, comentario: 'Calificación simulada (dev)' });
      const data = await fetchServiciosCerrados(perfil.id);
      setServicios(data);
    } catch (err) {
      setError(err.message ?? 'No se pudo simular la calificación.');
    } finally {
      setSimulando(null);
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

  if (loading) return null;

  return (
    <div className="flex min-h-svh flex-col pb-8">
      <ScreenHeader title="Historial" fallbackTo="/home" />

      <div className="flex flex-1 flex-col gap-3 px-5 py-5">
        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        {servicios.length === 0 && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">Sin servicios cerrados todavía.</p>
          </Card>
        )}

        {servicios.map((servicio) => {
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
