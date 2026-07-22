const ALLOWED_TYPES = ['image/png', 'image/jpeg'];
const ALLOWED_RESULT_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

export function validateImageFile(file, maxMB = 2) {
  if (!file) return { ok: false, error: 'Selecciona un archivo.' };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Formato no válido. Usa PNG o JPG.' };
  }
  if (file.size > maxMB * 1024 * 1024) {
    return { ok: false, error: `El archivo supera el máximo de ${maxMB}MB.` };
  }
  return { ok: true, error: '' };
}

// N-17: resultado de examen externo — foto o PDF, sin OCR real (entrada
// manual del médico). TODO: OCR real — P-EI-005.
export function validateResultFile(file, maxMB = 10) {
  if (!file) return { ok: false, error: 'Selecciona un archivo.' };
  if (!ALLOWED_RESULT_TYPES.includes(file.type)) {
    return { ok: false, error: 'Formato no válido. Usa PNG, JPG o PDF.' };
  }
  if (file.size > maxMB * 1024 * 1024) {
    return { ok: false, error: `El archivo supera el máximo de ${maxMB}MB.` };
  }
  return { ok: true, error: '' };
}
