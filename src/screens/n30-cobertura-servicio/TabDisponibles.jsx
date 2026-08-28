import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Toast } from '../../components/ui';
import { fetchSolicitudesAbiertas, ofrecerCobertura } from '../../lib/coberturaServicio';
import SolicitudCard from './SolicitudCard';

// "Disponibles": solicitudes de relevo publicadas por otros médicos.
//
// 0034: ofrecerse ya NO cierra el trato. Abre la negociación ('propuesta') y
// lleva al chat, donde las dos partes tienen que marcar "Estoy de acuerdo" para
// que el servicio quede tomado — igual que Contactar en MUVET Turnos y en
// MUVET Auxiliar. Mientras dura esa negociación la solicitud sale del tablón;
// si cualquiera de los dos la descarta, vuelve acá.
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
      showToast('Te ofreciste a cubrir. Coordinen y confirmen los dos.', 'ok');
      navigate(`/cobertura-servicio/chat/${solicitud.id}`);
    } catch (err) {
      showToast(err.message ?? 'No se pudo ofrecer. Puede que otro médico se te haya adelantado.', 'critical');
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
            {ofreciendoId === s.id ? 'Abriendo…' : 'Ofrecerme y coordinar'}
          </Button>
        </SolicitudCard>
      ))}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
