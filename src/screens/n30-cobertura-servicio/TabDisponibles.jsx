import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Toast } from '../../components/ui';
import { fetchSolicitudesAbiertas, ofrecerCobertura } from '../../lib/coberturaServicio';
import SolicitudCard from './SolicitudCard';

// "Disponibles": solicitudes de cobertura publicadas por otros médicos.
// Ofrecerse a cubrir es una acción directa (sin paso de confirmación del
// solicitante) — así se pidió: "el médico que visualiza las solicitudes
// puede... ofrecerse para cubrir el servicio".
export default function TabDisponibles({ perfil }) {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ofreciendoId, setOfreciendoId] = useState(null);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }

  async function cargar() {
    setLoading(true);
    try {
      const data = await fetchSolicitudesAbiertas(perfil.id);
      setSolicitudes(data);
    } catch (err) {
      showToast(err.message ?? 'No se pudo cargar el listado.', 'critical');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  async function handleOfrecerse(solicitud) {
    setOfreciendoId(solicitud.id);
    try {
      await ofrecerCobertura(solicitud.id);
      showToast('Te ofreciste a cubrir. Abriendo el chat…', 'ok');
      navigate(`/cobertura-servicio/chat/${solicitud.id}`);
    } catch (err) {
      showToast(err.message ?? 'No se pudo confirmar. Puede que ya la haya cubierto otro médico.', 'critical');
      cargar();
    } finally {
      setOfreciendoId(null);
    }
  }

  if (loading) return <p className="px-5 py-6 text-center text-[13px] text-[#5A6B7A]">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3 px-5 py-4 pb-24">
      {solicitudes.length === 0 && (
        <p className="py-8 text-center text-[13px] text-[#5A6B7A]">
          No hay solicitudes de cobertura abiertas por ahora.
        </p>
      )}

      {solicitudes.map((s) => (
        <SolicitudCard key={s.id} solicitud={s}>
          <Button onClick={() => handleOfrecerse(s)} disabled={ofreciendoId === s.id} fullWidth={false} className="mt-1">
            {ofreciendoId === s.id ? 'Confirmando…' : 'Ofrecerme a cubrir'}
          </Button>
        </SolicitudCard>
      ))}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
