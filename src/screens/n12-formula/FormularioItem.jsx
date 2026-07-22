import { useMemo, useState } from 'react';
import { Modal, Input, Button } from '../../components/ui';
import { esSustanciaControlada } from '../../lib/formula';

export default function FormularioItem({ open, onClose, onSave, catalogoControladas }) {
  const [dci, setDci] = useState('');
  const [dosis, setDosis] = useState('');
  const [via, setVia] = useState('');
  const [frecuencia, setFrecuencia] = useState('');
  const [duracion, setDuracion] = useState('');
  const [instrucciones, setInstrucciones] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const esControlada = useMemo(() => esSustanciaControlada(dci, catalogoControladas), [dci, catalogoControladas]);

  function resetAndClose() {
    setDci('');
    setDosis('');
    setVia('');
    setFrecuencia('');
    setDuracion('');
    setInstrucciones('');
    setError('');
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!dci.trim()) {
      setError('El principio activo (DCI) es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        dci: dci.trim(),
        dosis: dosis.trim(),
        via: via.trim(),
        frecuencia: frecuencia.trim(),
        duracion: duracion.trim(),
        instrucciones: instrucciones.trim(),
        contieneControlada: esControlada,
      });
      resetAndClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo agregar el medicamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Agregar medicamento">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Principio activo (DCI)"
          placeholder="Denominación común internacional, no marca comercial"
          required
          value={dci}
          onChange={(e) => setDci(e.target.value)}
        />
        {esControlada && (
          <div className="rounded-[10px] border border-[#E8A23D] bg-[#E8A23D1A] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[#8A5E17]">
              ⚠ Sustancia controlada (Resolución 1478/2006). Verifique el manejo reglamentario — este aviso no
              bloquea la prescripción (D-539).
            </p>
          </div>
        )}
        <Input label="Dosis" value={dosis} onChange={(e) => setDosis(e.target.value)} />
        <Input label="Vía" value={via} onChange={(e) => setVia(e.target.value)} />
        <Input label="Frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} />
        <Input label="Duración" value={duracion} onChange={(e) => setDuracion(e.target.value)} />
        <div className="w-full text-left">
          <label htmlFor="formula-instrucciones" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
            Instrucciones (opcional)
          </label>
          <textarea
            id="formula-instrucciones"
            rows={2}
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={resetAndClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Agregando…' : 'AGREGAR'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
