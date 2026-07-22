// N-17 · Órdenes a exámenes externos (Fase 6, Acción 1)
//
// Laboratorio destino en texto libre — no hay buscador de red aliada (N-13
// "Órdenes MUVET" está fuera de esta fase). D-228/D-229: un ítem que
// coincida con el catálogo sustancias_controladas bloquea la orden para
// emisión y la marca para escalamiento a Comité Médico — aquí solo el
// estado 'bloqueada_comite' (sin backend de escalamiento real, eso es
// P-EPM). Fee de $500 COP/ítem es solo informativo, no hay cobro real en
// ningún punto del MVP. Carga de resultado sin OCR real — entrada manual.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Button, Badge, Toast, ScreenHeader } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { fetchServicioDetalle } from '../../lib/solicitudes';
import { fetchSustanciasControladas } from '../../lib/formula';
import { formatCOP } from '../../lib/format';
import { useSignedUrl } from '../../lib/storage';
import {
  FEE_POR_ITEM,
  fetchOrdenesExternas,
  crearOrdenExterna,
  actualizarItemsOrden,
  emitirOrdenExterna,
  cargarResultadoOrden,
  subirResultadoArchivo,
} from '../../lib/ordenes';
import OrdenFormModal from './OrdenFormModal';
import ResultadoModal from './ResultadoModal';

const ESTADO_BADGE = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  bloqueada_comite: { label: 'Bloqueada (Comité)', tone: 'critical' },
  emitida: { label: 'Emitida', tone: 'info' },
  resultado_cargado: { label: 'Resultado cargado', tone: 'ok' },
};

export default function N17OrdenesExternas() {
  const { servicioId } = useParams();
  const { perfil } = useAuth();

  const [servicio, setServicio] = useState(null);
  const [ordenes, setOrdenes] = useState([]);
  const [catalogoControladas, setCatalogoControladas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [toast, setToast] = useState('');

  const [modalOrden, setModalOrden] = useState({ open: false, orden: null });
  const [modalResultado, setModalResultado] = useState({ open: false, ordenId: null });

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchServicioDetalle(servicioId), fetchOrdenesExternas(servicioId), fetchSustanciasControladas()])
      .then(([servicioData, ordenesData, catalogo]) => {
        if (!active) return;
        setServicio(servicioData);
        setOrdenes(ordenesData);
        setCatalogoControladas(catalogo);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudieron cargar las órdenes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [servicioId]);

  function mostrarToast(mensaje) {
    setToast(mensaje);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleCrearOOrden(datos) {
    if (modalOrden.orden) {
      const actualizada = await actualizarItemsOrden(modalOrden.orden.id, datos);
      setOrdenes((prev) => prev.map((o) => (o.id === actualizada.id ? actualizada : o)));
      mostrarToast('Orden actualizada');
    } else {
      const nueva = await crearOrdenExterna(servicioId, datos);
      setOrdenes((prev) => [nueva, ...prev]);
      mostrarToast(nueva.estado === 'bloqueada_comite' ? 'Orden creada — bloqueada por sustancia controlada' : 'Orden creada');
    }
  }

  async function handleEmitir(ordenId) {
    setProcesando(true);
    setError('');
    try {
      const actualizada = await emitirOrdenExterna(ordenId);
      setOrdenes((prev) => prev.map((o) => (o.id === actualizada.id ? actualizada : o)));
      mostrarToast('Orden emitida');
    } catch (err) {
      setError(err.message ?? 'No se pudo emitir la orden.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleGuardarResultado({ file, interpretacion }) {
    const ordenId = modalResultado.ordenId;
    const url = await subirResultadoArchivo(perfil.id, ordenId, file);
    const actualizada = await cargarResultadoOrden(ordenId, { resultadoArchivoUrl: url, interpretacion });
    setOrdenes((prev) => prev.map((o) => (o.id === actualizada.id ? actualizada : o)));
    mostrarToast('Resultado cargado');
  }

  if (loading) return null;

  if (error && ordenes.length === 0) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Órdenes externas" />
        <p className="px-5 py-6 text-[13px] text-[#C63B3B]">{error}</p>
      </div>
    );
  }

  const mascota = servicio?.mascotas;

  return (
    <div className="flex min-h-svh flex-col pb-8">
      <ScreenHeader title="Órdenes externas" />

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
          <p className="text-[14px] font-semibold text-[#0A1628]">{mascota?.nombre ?? 'Sin nombre'}</p>
        </div>

        <div className="flex flex-col gap-3">
          {ordenes.length === 0 && (
            <Card>
              <p className="text-[13px] text-[#5A6B7A]">Sin órdenes creadas todavía.</p>
            </Card>
          )}
          {ordenes.map((orden) => {
            const badge = ESTADO_BADGE[orden.estado] ?? ESTADO_BADGE.borrador;
            return (
              <Card key={orden.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[#0A1628]">{orden.laboratorio_destino || 'Sin laboratorio'}</p>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                <p className="text-[12px] text-[#5A6B7A]">{(orden.items ?? []).join(' · ')}</p>
                {orden.indicaciones && <p className="text-[12px] text-[#5A6B7A]">{orden.indicaciones}</p>}
                <p className="text-[12px] text-[#5A6B7A]">
                  Fee informativo: {formatCOP((orden.items?.length ?? 0) * FEE_POR_ITEM)}
                </p>

                {orden.estado === 'resultado_cargado' && (
                  <div className="mt-1 rounded-[10px] bg-[#F4F7F9] px-3 py-2.5">
                    <p className="text-[12px] font-semibold text-[#5A6B7A]">Interpretación</p>
                    <p className="text-[13px] text-[#0A1628]">{orden.interpretacion || '—'}</p>
                    {orden.resultado_archivo_url && <EnlaceResultado path={orden.resultado_archivo_url} />}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {(orden.estado === 'borrador' || orden.estado === 'bloqueada_comite') && (
                    <>
                      <Button
                        variant="outline"
                        fullWidth={false}
                        className="!w-auto px-3 py-2 text-[12px]"
                        onClick={() => setModalOrden({ open: true, orden })}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="secondary"
                        fullWidth={false}
                        className="!w-auto px-3 py-2 text-[12px]"
                        disabled={procesando || orden.estado === 'bloqueada_comite'}
                        onClick={() => handleEmitir(orden.id)}
                      >
                        Emitir
                      </Button>
                    </>
                  )}
                  {orden.estado === 'emitida' && (
                    <Button
                      variant="secondary"
                      fullWidth={false}
                      className="!w-auto px-3 py-2 text-[12px]"
                      onClick={() => setModalResultado({ open: true, ordenId: orden.id })}
                    >
                      Cargar resultado
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <Button variant="outline" onClick={() => setModalOrden({ open: true, orden: null })}>
          + Nueva orden
        </Button>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
      </div>

      <OrdenFormModal
        open={modalOrden.open}
        ordenExistente={modalOrden.orden}
        onClose={() => setModalOrden({ open: false, orden: null })}
        onSave={handleCrearOOrden}
        catalogoControladas={catalogoControladas}
      />
      <ResultadoModal
        open={modalResultado.open}
        onClose={() => setModalResultado({ open: false, ordenId: null })}
        onSave={handleGuardarResultado}
      />
      <Toast message={toast} tone="ok" visible={Boolean(toast)} />
    </div>
  );
}

function EnlaceResultado({ path }) {
  const url = useSignedUrl(path);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-medium text-[#1A7A5E]">
      Ver archivo del resultado
    </a>
  );
}
