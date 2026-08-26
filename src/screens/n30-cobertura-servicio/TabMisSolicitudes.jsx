import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Toast } from '../../components/ui';
import { fetchMisSolicitudesActivas, cancelarSolicitud, finalizarServicio } from '../../lib/coberturaServicio';
import SolicitudCard from './SolicitudCard';
import SolicitudForm from './SolicitudForm';

// "Mis Solicitudes": lo que publiqué (con opción de cancelar mientras nadie
// se ofrezca) y lo que estoy cubriendo de otro médico, mientras el servicio
// siga activo (abierta/cubierta). Una vez finalizado o cancelado sale de esta
// pestaña y pasa al historial único de /historial (N-9), donde convive con el
// historial de Relevo — ver lib/historialUnificado.js.
export default function TabMisSolicitudes({ perfil }) {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }

  async function cargar() {
    setLoading(true);
    try {
      const data = await fetchMisSolicitudesActivas(perfil.id);
      setSolicitudes(data);
    } catch (err) {
      showToast(err.message ?? 'No se pudo cargar tus solicitudes.', 'critical');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  async function handleCancelar(id) {
    setProcesandoId(id);
    try {
      await cancelarSolicitud(id, perfil.id);
      showToast('Solicitud cancelada.', 'ok');
      cargar();
    } catch (err) {
      showToast(err.message ?? 'No se pudo cancelar.', 'critical');
    } finally {
      setProcesandoId(null);
    }
  }

  async function handleFinalizar(id) {
    setProcesandoId(id);
    try {
      await finalizarServicio(id);
      showToast('Servicio finalizado. El chat quedó cerrado y pasó a tu historial.', 'ok');
      cargar();
    } catch (err) {
      showToast(err.message ?? 'No se pudo finalizar.', 'critical');
    } finally {
      setProcesandoId(null);
    }
  }

  if (loading) return <p className="px-5 py-6 text-center text-[13px] text-[#5A6B7A]">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3 px-5 py-4 pb-24">
      {!mostrarForm && (
        <Button onClick={() => setMostrarForm(true)}>+ Solicitar cobertura</Button>
      )}

      {mostrarForm && (
        <SolicitudForm
          perfil={perfil}
          showToast={showToast}
          onCancel={() => setMostrarForm(false)}
          onCreated={() => {
            setMostrarForm(false);
            cargar();
          }}
        />
      )}

      {solicitudes.length === 0 && !mostrarForm && (
        <p className="py-8 text-center text-[13px] text-[#5A6B7A]">
          No tienes solicitudes activas. Publica una si necesitas que otro médico te cubra un servicio.
        </p>
      )}

      {solicitudes.map((s) => {
        const soyAutor = s.autor_id === perfil.id;
        return (
          <SolicitudCard key={s.id} solicitud={s}>
            <div className="mt-1 flex gap-2">
              {s.estado === 'abierta' && soyAutor && (
                <Button
                  variant="danger"
                  fullWidth={false}
                  disabled={procesandoId === s.id}
                  onClick={() => handleCancelar(s.id)}
                >
                  Cancelar
                </Button>
              )}
              {s.estado === 'cubierta' && (
                <>
                  <Button
                    variant="outline"
                    fullWidth={false}
                    onClick={() => navigate(`/cobertura-servicio/chat/${s.id}`)}
                  >
                    Abrir chat
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    disabled={procesandoId === s.id}
                    onClick={() => handleFinalizar(s.id)}
                  >
                    Finalizar servicio
                  </Button>
                </>
              )}
            </div>
          </SolicitudCard>
        );
      })}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
