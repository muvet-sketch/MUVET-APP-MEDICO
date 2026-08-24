import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { uploadDocumento, useSignedUrl } from '../../lib/storage';
import { validateImageFile } from '../../lib/fileValidation';
import { Card, Input, Button, Toast } from '../../components/ui';

export default function DatosClinicaSection() {
  const { perfil, session, refreshPerfil } = useAuth();
  const [razonSocial, setRazonSocial] = useState(perfil?.razon_social ?? '');
  const [nit, setNit] = useState(perfil?.nit ?? '');
  const [direccionSede, setDireccionSede] = useState(perfil?.direccion_sede ?? '');
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  const signedLogoUrl = useSignedUrl(perfil?.foto_url);

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function handleGuardar() {
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          razon_social: razonSocial.trim() || null,
          nit: nit.trim() || null,
          direccion_sede: direccionSede.trim() || null,
          telefono: telefono.trim() || null,
        })
        .eq('id', perfil.id);
      if (updateError) throw updateError;
      await refreshPerfil();
      showToast('Datos de la clínica actualizados.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const { ok, error: validationError } = validateImageFile(file);
    if (!ok) {
      setError(validationError);
      e.target.value = '';
      return;
    }

    setUploadingLogo(true);
    setError('');
    try {
      const ext = file.name.split('.').pop();
      const path = `${perfil.id}/logo-${Date.now()}.${ext}`;
      await uploadDocumento(path, file);

      const { error: updateError } = await supabase.from('perfiles').update({ foto_url: path }).eq('id', perfil.id);
      if (updateError) throw updateError;

      await refreshPerfil();
      showToast('Logo actualizado.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo subir el logo.');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-[14px] font-semibold text-[#0A1628]">Datos de la clínica</p>

      <div className="flex items-center gap-3">
        {signedLogoUrl ? (
          <img src={signedLogoUrl} alt="Logo de la clínica" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F4F7F9] text-[12px] text-[#5A6B7A]">
            Sin logo
          </div>
        )}
        <label className="cursor-pointer text-[12px] font-medium text-[#1A7A5E] underline underline-offset-2">
          {uploadingLogo ? 'Subiendo…' : 'Cambiar logo'}
          <input type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} disabled={uploadingLogo} className="hidden" />
        </label>
      </div>

      <Input label="Razón social" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
      <Input label="NIT" value={nit} onChange={(e) => setNit(e.target.value)} />
      <Input label="Dirección del establecimiento" value={direccionSede} onChange={(e) => setDireccionSede(e.target.value)} />
      <Input label="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />

      <Input label="Correo" value={session?.user?.email ?? ''} disabled />

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button onClick={handleGuardar} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </Button>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
