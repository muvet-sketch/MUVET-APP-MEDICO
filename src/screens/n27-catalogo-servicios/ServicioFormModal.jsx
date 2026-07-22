import { useState } from 'react';
import { Modal, Input, Button } from '../../components/ui';

export default function ServicioFormModal({ open, initial, onClose, onSave }) {
  const [nombre, setNombre] = useState(initial?.nombre_servicio ?? '');
  const [precio, setPrecio] = useState(initial?.precio != null ? String(initial.precio) : '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetAndClose() {
    setNombre('');
    setPrecio('');
    setDescripcion('');
    setError('');
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!nombre.trim()) {
      setError('El nombre del servicio es obligatorio.');
      return;
    }
    const precioNum = Number(precio);
    if (!precioNum || precioNum <= 0) {
      setError('El precio debe ser mayor a $0.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        nombre_servicio: nombre.trim(),
        precio: precioNum,
        descripcion: descripcion.trim() || null,
      });
      resetAndClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar el servicio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={initial ? 'Editar servicio' : 'Agregar servicio'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nombre del servicio" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Input
          label="Precio (COP)"
          type="number"
          min="1"
          step="1"
          required
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
        />
        <div className="w-full text-left">
          <label htmlFor="descripcion-servicio" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
            Descripción (opcional)
          </label>
          <textarea
            id="descripcion-servicio"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={resetAndClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'GUARDAR'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
