// N-12 · Fórmula médica (Fase 5, Acción 2)
//
// Nomenclatura DCI (denominación común internacional) como campo principal
// — nunca marca comercial. Aviso de sustancia controlada (D-539) contra el
// catálogo semilla real `sustancias_controladas` (0001); no bloquea la
// prescripción. P3: el médico redacta y aprueba cada ítem — nada se
// autogenera ni se envía sin acción explícita.
//
// Estado BORRADOR/APROBADA/DESCARTADA queda listo para que Fase 6 lo
// consuma como bloqueo de cierre de servicio (N-19) — ese bloqueo no se
// implementa en esta fase.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Button, Badge, Toast, ScreenHeader } from '../../components/ui';
import { fetchServicioDetalle } from '../../lib/solicitudes';
import {
  fetchSustanciasControladas,
  fetchFormulaConItems,
  obtenerOCrearFormula,
  agregarFormulaItem,
  eliminarFormulaItem,
  actualizarEstadoFormula,
} from '../../lib/formula';
import FormularioItem from './FormularioItem';

const ESTADOS = [
  { key: 'borrador', label: 'Borrador', tone: 'neutral' },
  { key: 'aprobada', label: 'Aprobada', tone: 'ok' },
  { key: 'descartada', label: 'Descartada', tone: 'critical' },
];

export default function N12Formula() {
  const { servicioId } = useParams();

  const [servicio, setServicio] = useState(null);
  const [formula, setFormula] = useState(null);
  const [catalogoControladas, setCatalogoControladas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [servicioData, catalogo] = await Promise.all([
          fetchServicioDetalle(servicioId),
          fetchSustanciasControladas(),
        ]);
        await obtenerOCrearFormula(servicioId);
        const formulaData = await fetchFormulaConItems(servicioId);
        if (!active) return;
        setServicio(servicioData);
        setCatalogoControladas(catalogo);
        setFormula(formulaData);
      } catch (err) {
        if (active) setError(err.message ?? 'No se pudo cargar la fórmula.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [servicioId]);

  function mostrarToast(mensaje) {
    setToast(mensaje);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleAgregarItem(item) {
    const nuevoItem = await agregarFormulaItem(formula.id, item);
    setFormula((prev) => ({ ...prev, items: [...prev.items, nuevoItem] }));
    mostrarToast('Medicamento agregado');
  }

  async function handleEliminarItem(itemId) {
    setProcesando(true);
    setError('');
    try {
      await eliminarFormulaItem(itemId);
      setFormula((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
    } catch (err) {
      setError(err.message ?? 'No se pudo quitar el medicamento.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleCambiarEstado(estado) {
    setProcesando(true);
    setError('');
    try {
      const actualizada = await actualizarEstadoFormula(formula.id, estado);
      setFormula((prev) => ({ ...prev, estado: actualizada.estado }));
      mostrarToast(`Fórmula marcada como ${estado.toUpperCase()}`);
    } catch (err) {
      setError(err.message ?? 'No se pudo actualizar el estado de la fórmula.');
    } finally {
      setProcesando(false);
    }
  }

  if (loading) return null;

  if (error && !formula) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Fórmula" />
        <p className="px-5 py-6 text-[13px] text-[#C63B3B]">{error}</p>
      </div>
    );
  }

  const mascota = servicio?.mascotas;
  const estadoActual = ESTADOS.find((e) => e.key === formula?.estado) ?? ESTADOS[0];

  return (
    <div className="flex min-h-svh flex-col pb-8">
      <ScreenHeader title="Fórmula" />

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
            <p className="text-[14px] font-semibold text-[#0A1628]">{mascota?.nombre ?? 'Sin nombre'}</p>
          </div>
          <Badge tone={estadoActual.tone}>{estadoActual.label}</Badge>
        </div>

        <div className="flex flex-col gap-3">
          {formula?.items.length === 0 && (
            <Card>
              <p className="text-[13px] text-[#5A6B7A]">Sin medicamentos agregados todavía.</p>
            </Card>
          )}
          {formula?.items.map((item) => (
            <Card key={item.id} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-semibold text-[#0A1628]">{item.dci}</p>
                {item.contiene_controlada && <Badge tone="alert">⚠ Controlada</Badge>}
              </div>
              <p className="text-[12px] text-[#5A6B7A]">
                {[item.dosis, item.via, item.frecuencia, item.duracion].filter(Boolean).join(' · ') || '—'}
              </p>
              {item.instrucciones && <p className="text-[12px] text-[#5A6B7A]">{item.instrucciones}</p>}
              <Button
                variant="ghost"
                fullWidth={false}
                className="!w-auto self-start px-0 text-[12px] text-[#C63B3B]"
                onClick={() => handleEliminarItem(item.id)}
                disabled={procesando}
              >
                Quitar
              </Button>
            </Card>
          ))}
        </div>

        <Button variant="outline" onClick={() => setModalOpen(true)}>
          + Agregar medicamento
        </Button>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Card className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Estado de la fórmula</p>
          <div className="flex gap-2">
            {ESTADOS.map((estado) => (
              <Button
                key={estado.key}
                variant={formula?.estado === estado.key ? 'secondary' : 'outline'}
                onClick={() => handleCambiarEstado(estado.key)}
                disabled={procesando || formula?.estado === estado.key}
              >
                {estado.label}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      <FormularioItem
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleAgregarItem}
        catalogoControladas={catalogoControladas}
      />
      <Toast message={toast} tone="ok" visible={Boolean(toast)} />
    </div>
  );
}
