import { useMemo, useState, useEffect } from 'react';
import { Modal, Input, Button, Badge } from '../../components/ui';
import { esSustanciaControlada } from '../../lib/formula';
import { formatCOP } from '../../lib/format';
import { FEE_POR_ITEM } from '../../lib/ordenes';

const VACIO = { laboratorioDestino: '', items: [''], indicaciones: '' };

export default function OrdenFormModal({ open, onClose, onSave, catalogoControladas, ordenExistente }) {
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (ordenExistente) {
      setForm({
        laboratorioDestino: ordenExistente.laboratorio_destino ?? '',
        items: ordenExistente.items?.length ? ordenExistente.items : [''],
        indicaciones: ordenExistente.indicaciones ?? '',
      });
    } else {
      setForm(VACIO);
    }
    setError('');
  }, [open, ordenExistente]);

  const itemsLimpios = useMemo(() => form.items.map((i) => i.trim()).filter(Boolean), [form.items]);

  const itemsBloqueados = useMemo(
    () => itemsLimpios.filter((item) => esSustanciaControlada(item, catalogoControladas)),
    [itemsLimpios, catalogoControladas],
  );

  function setItem(index, value) {
    setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => (i === index ? value : it)) }));
  }

  function agregarItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, ''] }));
  }

  function quitarItem(index) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }

  function resetAndClose() {
    setForm(VACIO);
    setError('');
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.laboratorioDestino.trim()) {
      setError('El laboratorio destino es obligatorio.');
      return;
    }
    if (itemsLimpios.length === 0) {
      setError('Agrega al menos un ítem a ordenar.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        laboratorioDestino: form.laboratorioDestino.trim(),
        items: itemsLimpios,
        indicaciones: form.indicaciones.trim(),
      });
      resetAndClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la orden.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={ordenExistente ? 'Editar orden' : 'Nueva orden externa'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Laboratorio destino"
          placeholder="Nombre del laboratorio (texto libre)"
          value={form.laboratorioDestino}
          onChange={(e) => setForm((prev) => ({ ...prev, laboratorioDestino: e.target.value }))}
        />

        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-[#5A6B7A]">Ítems a ordenar</p>
          {form.items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder={`Ítem ${index + 1} (ej. Hemograma completo)`}
                value={item}
                onChange={(e) => setItem(index, e.target.value)}
              />
              {form.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarItem(index)}
                  aria-label="Quitar ítem"
                  className="text-[12px] text-[#C63B3B]"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" fullWidth={false} className="!w-auto self-start px-0 text-[12px]" onClick={agregarItem}>
            + Agregar ítem
          </Button>
        </div>

        {itemsBloqueados.length > 0 && (
          <div className="rounded-[10px] border border-[#C63B3B] bg-[#C63B3B1A] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[#C63B3B]">
              ⚠ Esta orden quedará bloqueada para emisión (D-228/D-229): coincide con sustancia controlada en{' '}
              {itemsBloqueados.join(', ')}. Escalado a Comité Médico.
            </p>
          </div>
        )}

        <div className="w-full text-left">
          <label htmlFor="orden-indicaciones" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
            Indicaciones (opcional)
          </label>
          <textarea
            id="orden-indicaciones"
            rows={2}
            value={form.indicaciones}
            onChange={(e) => setForm((prev) => ({ ...prev, indicaciones: e.target.value }))}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>

        <div className="flex items-center justify-between rounded-[10px] bg-[#F4F7F9] px-3 py-2.5">
          <p className="text-[12px] text-[#5A6B7A]">Fee informativo ({itemsLimpios.length} ítem{itemsLimpios.length === 1 ? '' : 's'} × {formatCOP(FEE_POR_ITEM)})</p>
          <Badge tone="neutral">{formatCOP(itemsLimpios.length * FEE_POR_ITEM)}</Badge>
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={resetAndClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : ordenExistente ? 'GUARDAR CAMBIOS' : 'CREAR ORDEN'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
