import { useState } from 'react';
import { Modal, Button } from '../../components/ui';
import { formatCOP } from '../../lib/format';
import { MOCK_CSV_IMPORT_PREVIEW } from '../../mocks/mockData';

// TODO Fase posterior: parseo real de CSV/Excel. Por ahora, seleccionar cualquier
// archivo solo dispara una vista previa // MOCK — no se persiste nada real.
export default function ImportarCsvModal({ open, onClose, onDone }) {
  const [fileName, setFileName] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? '');
    setShowPreview(Boolean(file));
  }

  function reset() {
    setFileName('');
    setShowPreview(false);
    onClose();
  }

  function handleConfirm() {
    reset();
    onDone('Función de importación en desarrollo.');
  }

  return (
    <Modal open={open} onClose={reset} title="Importar desde archivo">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-[#5A6B7A]">
          Selecciona un archivo CSV o Excel con tus servicios y tarifas. Esta función está en desarrollo — por ahora
          solo puedes ver una vista previa de ejemplo.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px]"
        />

        {showPreview && (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-medium text-[#0A1628]">
              Vista previa {fileName && `de "${fileName}"`} <span className="text-[#5A6B7A]">(datos de ejemplo)</span>
            </p>
            <div className="flex flex-col gap-2">
              {MOCK_CSV_IMPORT_PREVIEW.map((row, i) => (
                <div key={i} className="rounded-[10px] border border-[#E1E8ED] px-3 py-2">
                  <p className="text-[13px] font-medium text-[#0A1628]">{row.nombre_servicio}</p>
                  <p className="text-[13px] text-[#1A7A5E]">{formatCOP(row.precio)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!showPreview} onClick={handleConfirm}>
            Confirmar importación
          </Button>
        </div>
      </div>
    </Modal>
  );
}
