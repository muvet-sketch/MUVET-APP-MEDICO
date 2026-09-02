import { useCallback, useEffect, useState } from 'react';
import { Card, Button, Badge, Modal, Toast } from '../../components/ui';
import {
  fetchMisOfertasEspecialista,
  crearOfertaEspecialista,
  actualizarOfertaEspecialista,
  activarOfertaEspecialista,
  desactivarOfertaEspecialista,
  cancelarOfertaEspecialista,
} from '../../lib/especialistas';
import OfertaCard from './OfertaCard';
import OfertaFormModal from './OfertaFormModal';

// Mitad B · El tablón, del lado de quien PUBLICA. La ven auxiliares y médicos
// especialistas (`puedePublicarTablon`). A diferencia de los otros módulos acá
// se pueden tener VARIAS ofertas vivas a la vez: un especialista puede ofrecer
// cardiología los martes y buscar quien le cubra una cirugía el jueves.
const ESTADO_BADGE = {
  cancelada: { label: 'Cancelada', tone: 'critical' },
  finalizada: { label: 'Finalizada', tone: 'ok' },
};

export default function TabMiOferta({ perfil }) {
  const [ofertas, setOfertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  const recargar = useCallback(async () => {
    const data = await fetchMisOfertasEspecialista(perfil.id);
    setOfertas(data);
  }, [perfil.id]);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    fetchMisOfertasEspecialista(perfil.id)
      .then((data) => {
        if (activo) setOfertas(data);
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar tus ofertas.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil.id]);

  async function handleGuardar(datos) {
    if (editando) {
      await actualizarOfertaEspecialista(editando.id, perfil.id, datos);
      showToast('Oferta actualizada.');
    } else {
      await crearOfertaEspecialista({ ...datos, autorId: perfil.id, autorRol: perfil.rol });
      showToast('Oferta publicada.');
    }
    setFormAbierto(false);
    setEditando(null);
    await recargar();
  }

  async function handleToggleActiva(oferta) {
    try {
      if (oferta.activa) {
        await desactivarOfertaEspecialista(oferta.id, perfil.id);
        showToast('Oferta pausada. No la ve nadie hasta que la reactives.');
      } else {
        await activarOfertaEspecialista(oferta.id, perfil.id);
        showToast('Oferta activa de nuevo.');
      }
      await recargar();
    } catch (err) {
      showToast(err.message ?? 'No se pudo cambiar el estado.', 'critical');
    }
  }

  async function handleCancelar() {
    try {
      await cancelarOfertaEspecialista(cancelando.id, perfil.id);
      setCancelando(null);
      showToast('Oferta cancelada.');
      await recargar();
    } catch (err) {
      showToast(err.message ?? 'No se pudo cancelar.', 'critical');
    }
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-5 pb-24">
      <p className="text-[12px] text-[#5A6B7A]">
        Publica lo que ofreces o lo que necesitas. Solo los médicos especialistas ven este tablón y pueden responderte.
      </p>

      <Button
        onClick={() => {
          setEditando(null);
          setFormAbierto(true);
        }}
      >
        + Publicar oferta
      </Button>

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && ofertas.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">Todavía no has publicado ninguna oferta.</Card>
      )}

      {!loading &&
        ofertas.map((o) => {
          const terminal = o.estado !== 'abierta';
          const badge = ESTADO_BADGE[o.estado];
          return (
            <OfertaCard key={o.id} oferta={o}>
              <div className="flex flex-col gap-2 border-t border-[#E1E8ED] pt-2">
                <div className="flex items-center gap-2">
                  {badge ? (
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  ) : (
                    <Badge tone={o.activa ? 'ok' : 'neutral'}>{o.activa ? 'Activa' : 'Pausada'}</Badge>
                  )}
                </div>

                {!terminal && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      fullWidth={false}
                      className="!w-auto flex-1 px-3 py-2 text-[13px]"
                      onClick={() => handleToggleActiva(o)}
                    >
                      {o.activa ? 'Pausar' : 'Activar'}
                    </Button>
                    <Button
                      variant="outline"
                      fullWidth={false}
                      className="!w-auto flex-1 px-3 py-2 text-[13px]"
                      onClick={() => {
                        setEditando(o);
                        setFormAbierto(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      fullWidth={false}
                      className="!w-auto px-3 py-2 text-[13px]"
                      onClick={() => setCancelando(o)}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            </OfertaCard>
          );
        })}

      {formAbierto && (
        <OfertaFormModal
          // `key` fuerza el remontado al pasar de crear a editar (y entre
          // ofertas distintas): el formulario inicializa su estado en useState.
          key={editando?.id ?? 'nueva'}
          open={formAbierto}
          oferta={editando}
          onClose={() => {
            setFormAbierto(false);
            setEditando(null);
          }}
          onGuardar={handleGuardar}
        />
      )}

      <Modal open={Boolean(cancelando)} onClose={() => setCancelando(null)} title="Cancelar oferta">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#0A1628]">
            La oferta se cierra y no se puede reabrir. Las conversaciones que sigan abiertas se descartan; las que ya
            estén acordadas quedan intactas.
          </p>
          <Button variant="danger" onClick={handleCancelar}>
            Sí, cancelar oferta
          </Button>
          <Button variant="ghost" onClick={() => setCancelando(null)}>
            Volver
          </Button>
        </div>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
