import { useState } from 'react';
import { Modal, Button } from '../../components/ui';
import { validateResultFile } from '../../lib/fileValidation';

// N-17 · Carga de resultado (foto/PDF) + interpretación manual del médico.
// Sin OCR real — TODO: OCR real — P-EI-005.
export default function ResultadoModal({ open, onClose, onSave }) {
  const [file, setFile] = useState(null);
  const [interpretacion, setInterpretacion] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetAndClose() {
    setFile(null);
    setInterpretacion('');
    setError('');
    onClose();
  }

  function handleFileChange(e) {
    const selected = e.target.files?.[0] ?? null;
    setError('');
    if (!selected) return;
    const { ok, error: validationError } = validateResultFile(selected);
    if (!ok) {
      setError(validationError);
      e.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!file) {
      setError('Sube una foto o PDF del resultado.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ file, interpretacion: interpretacion.trim() });
      resetAndClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo cargar el resultado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Cargar resultado">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="w-full">
          <span className="block w-full cursor-pointer rounded-[10px] border border-[#0A1628] bg-transparent px-4 py-3 text-center text-[14px] font-medium text-[#0A1628]">
            {file ? file.name : '📎 Subir foto o PDF'}
          </span>
          <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={handleFileChange} className="hidden" />
        </label>

        <div className="w-full text-left">
          <label htmlFor="orden-interpretacion" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
            Interpretación del médico
          </label>
          <textarea
            id="orden-interpretacion"
            rows={3}
            placeholder="Los valores extraídos son entrada manual — sin OCR en el MVP."
            value={interpretacion}
            onChange={(e) => setInterpretacion(e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={resetAndClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Subiendo…' : 'GUARDAR RESULTADO'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
