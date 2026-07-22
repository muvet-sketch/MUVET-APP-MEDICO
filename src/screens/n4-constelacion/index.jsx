// N-4 · En camino · Estado de tránsito
//
// D-536: sin GPS ni mapa interno. Única navegación permitida: deep link a la
// app de mapas nativa del dispositivo.
// D-537: el check-in de llegada (apertura de la Constelación real) se
// conecta en Fase 4 — aquí solo existe la ruta placeholder.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Button, Modal, Badge, ScreenHeader } from '../../components/ui';
import { fetchServicioDetalle, cancelarServicio } from '../../lib/solicitudes';

function mapsUrl(direccion) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(direccion ?? '')}`;
}

function telUrl(telefono) {
  return `tel:${(telefono ?? '').replace(/\s+/g, '')}`;
}

export default function N4Constelacion() {
  const { servicioId } = useParams();
  const navigate = useNavigate();
  const [servicio, setServicio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmandoCancelacion, setConfirmandoCancelacion] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchServicioDetalle(servicioId)
      .then((data) => {
        if (active) setServicio(data);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar el servicio.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [servicioId]);

  async function handleCancelar() {
    setCancelando(true);
    try {
      // TODO: la App Tutor no existe aún — no hay notificación real al tutor.
      await cancelarServicio(servicioId);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.message ?? 'No se pudo cancelar el servicio.');
      setCancelando(false);
      setConfirmandoCancelacion(false);
    }
  }

  if (loading) return null;

  if (error && !servicio) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Servicio" />
        <p className="px-5 py-6 text-[13px] text-[#C63B3B]">{error}</p>
      </div>
    );
  }

  if (!servicio) return null;

  const mascota = servicio.mascotas;
  const solicitud = servicio.solicitudes;
  const tutor = solicitud?.tutores;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Servicio en camino" />

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <Card className="flex items-center justify-between">
          <div>
            <Badge tone="ok">🟢 Servicio aceptado · En camino</Badge>
            <p className="mt-2 text-[16px] font-semibold text-[#0A1628]">
              {mascota?.nombre} {mascota?.raza ? `(${mascota.raza})` : ''}
            </p>
          </div>
        </Card>

        <Card className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Destino</p>
          <p className="text-[14px] text-[#0A1628]">{solicitud?.direccion_exacta || 'Dirección no disponible.'}</p>
          {servicio.referenciaDireccion && (
            <p className="text-[12px] text-[#5A6B7A]">{servicio.referenciaDireccion}</p>
          )}
          <Button
            variant="outline"
            onClick={() => window.open(mapsUrl(solicitud?.direccion_exacta), '_blank', 'noopener,noreferrer')}
          >
            🗺 Abrir en Google Maps / Waze
          </Button>
        </Card>

        <Card className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Contacto</p>
          <p className="text-[14px] text-[#0A1628]">{tutor?.nombre_completo ?? 'Tutor sin nombre registrado'}</p>
          <p className="text-[14px] text-[#0A1628]">{tutor?.telefono ?? 'Sin teléfono registrado'}</p>
          {tutor?.telefono && (
            <a href={telUrl(tutor.telefono)}>
              <Button variant="secondary">Llamar</Button>
            </a>
          )}
        </Card>

        <Button
          variant="ghost"
          onClick={() =>
            mascota?.id
              ? navigate(`/mascotas/${mascota.id}?modo=lectura`)
              : navigate(
                  `/mascotas/nuevo?tutorId=${tutor?.id ?? ''}&volver=constelacion&servicioId=${servicioId}&modo=lectura`,
                )
          }
        >
          📋 Ver expediente del paciente
        </Button>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <Button onClick={() => navigate(`/servicio/${servicioId}/apertura`)}>CONFIRMAR LLEGADA</Button>
          <Button variant="ghost" onClick={() => setConfirmandoCancelacion(true)}>
            Cancelar servicio
          </Button>
        </div>
      </div>

      <Modal
        open={confirmandoCancelacion}
        onClose={() => setConfirmandoCancelacion(false)}
        title="¿Seguro que cancelas?"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#5A6B7A]">El tutor será notificado.</p>
          <Button variant="secondary" onClick={handleCancelar} disabled={cancelando}>
            {cancelando ? 'Cancelando…' : 'Sí, cancelar'}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmandoCancelacion(false)} disabled={cancelando}>
            No
          </Button>
        </div>
      </Modal>
    </div>
  );
}
