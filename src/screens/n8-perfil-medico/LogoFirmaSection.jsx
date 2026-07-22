import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { uploadDocumento, useSignedUrl } from '../../lib/storage';
import { validateImageFile } from '../../lib/fileValidation';
import { getInitials } from '../../lib/format';
import { Card, Button, Toast } from '../../components/ui';

// D-552: logo/firma del médico, estampado en Fórmula (N-12) y Recomendaciones (N-18).
export default function LogoFirmaSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null;
    setError('');
    if (!file) return;

    const { ok, error: validationError } = validateImageFile(file);
    if (!ok) {
      setError(validationError);
      e.target.value = '';
      return;
    }

    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function cancelPreview() {
    setPendingFile(null);
    setPreviewUrl(null);
    setError('');
  }

  async function handleConfirmUpload() {
    if (!pendingFile || !perfil?.id) return;
    setUploading(true);
    setError('');
    try {
      const ext = pendingFile.name.split('.').pop();
      const path = `${perfil.id}/logo-${Date.now()}.${ext}`;
      await uploadDocumento(path, pendingFile);

      const { error: updateError } = await supabase
        .from('perfiles')
        .update({ logo_firma_url: path })
        .eq('id', perfil.id);
      if (updateError) throw updateError;

      await refreshPerfil();
      cancelPreview();
      showToast('Logo actualizado.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo subir el logo.');
    } finally {
      setUploading(false);
    }
  }

  const signedLogoUrl = useSignedUrl(perfil?.logo_firma_url);
  const displayUrl = previewUrl ?? signedLogoUrl;

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">Logo / firma</p>

      <div className="mx-auto flex aspect-square w-32 items-center justify-center overflow-hidden rounded-[12px] border border-[#E1E8ED] bg-[#F4F7F9]">
        {displayUrl ? (
          <img src={displayUrl} alt="Logo/firma" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 text-center">
            <span className="text-[16px] font-semibold text-[#0A1628]">
              {getInitials(perfil?.nombre_completo) || '—'}
            </span>
            <span className="text-[10px] text-[#5A6B7A]">{perfil?.nombre_completo}</span>
            <span className="text-[10px] text-[#5A6B7A]">{perfil?.matricula_comvezcol}</span>
          </div>
        )}
      </div>

      <p className="text-center text-[12px] text-[#5A6B7A]">
        Se estampa en tus fórmulas y recomendaciones. Sin logo: tus documentos muestran tus iniciales + nombre
        completo + matrícula COMVEZCOL.
      </p>

      {error && <p className="text-center text-[12px] text-[#C63B3B]">{error}</p>}

      {!pendingFile ? (
        <label className="w-full">
          <span className="block w-full cursor-pointer rounded-[10px] border border-[#0A1628] bg-transparent px-4 py-3 text-center text-[14px] font-medium text-[#0A1628]">
            📷 Subir logo
          </span>
          <input type="file" accept="image/png,image/jpeg" onChange={handleFileChange} className="hidden" />
        </label>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" onClick={cancelPreview} disabled={uploading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirmUpload} disabled={uploading}>
            {uploading ? 'Subiendo…' : 'Confirmar'}
          </Button>
        </div>
      )}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
