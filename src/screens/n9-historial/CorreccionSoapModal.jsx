import { useState } from 'react';
import { Modal, Button } from '../../components/ui';

const CAMPO_LABEL = { s: 'S · Subjetivo', o: 'O · Objetivo', a: 'A · Assessment', p: 'P · Plan' };

// D-507: nunca edita soap_notas — solicita una corrección que queda como
// anexo con trazabilidad (quién, cuándo, qué campo, motivo), sin
// sobrescribir el SOAP original.
export default function CorreccionSoapModal({ open, campo, onClose, onSave }) {
  const [valorCorregido, setValorCorregido] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetAndClose() {
    setValorCorregido('');
    setMotivo('');
    setError('');
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!valorCorregido.trim() || !motivo.trim()) {
      setError('El valor corregido y el motivo son obligatorios.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ campo, valorCorregido: valorCorregido.trim(), motivo: motivo.trim() });
      resetAndClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo registrar la corrección.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={`Reportar corrección — ${CAMPO_LABEL[campo] ?? campo}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[12px] text-[#5A6B7A]">
          El SOAP original queda intacto. Esta corrección se guarda como anexo con trazabilidad (D-507) y no es una
          revisión automática por Comité — solo queda registrada la solicitud.
        </p>
        <div className="w-full text-left">
          <label htmlFor="correccion-valor" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
            Valor corregido
          </label>
          <textarea
            id="correccion-valor"
            rows={3}
            value={valorCorregido}
            onChange={(e) => setValorCorregido(e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>
        <div className="w-full text-left">
          <label htmlFor="correccion-motivo" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
            Motivo de la corrección
          </label>
          <textarea
            id="correccion-motivo"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={resetAndClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Enviando…' : 'REPORTAR CORRECCIÓN'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
