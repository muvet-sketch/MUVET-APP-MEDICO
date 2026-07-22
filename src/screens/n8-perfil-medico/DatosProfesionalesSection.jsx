import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { uploadDocumento, useSignedUrl } from '../../lib/storage';
import { validateImageFile } from '../../lib/fileValidation';
import { getInitials } from '../../lib/format';
import { Card, Input, Button, Toast } from '../../components/ui';

const BIO_MAX = 200;

// SUPUESTO: zona_cobertura es una sola columna de texto en `perfiles` (no un
// array). Para poder editarla como chips sin extender el esquema fuera del
// alcance de esta fase (la migración 0002 solo agrega columnas de
// notificaciones), las zonas se guardan como texto separado por comas.
function parseZonas(zonaCobertura) {
  return (zonaCobertura ?? '')
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);
}

export default function DatosProfesionalesSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [especialidad, setEspecialidad] = useState(perfil?.especialidad ?? '');
  const [bio, setBio] = useState(perfil?.bio ?? '');
  const [zonas, setZonas] = useState(parseZonas(perfil?.zona_cobertura));
  const [nuevaZona, setNuevaZona] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  function addZona() {
    const value = nuevaZona.trim();
    if (value && !zonas.includes(value)) {
      setZonas([...zonas, value]);
    }
    setNuevaZona('');
  }

  function removeZona(zona) {
    setZonas(zonas.filter((z) => z !== zona));
  }

  async function handleGuardar() {
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          especialidad: especialidad.trim() || null,
          bio: bio.trim() || null,
          zona_cobertura: zonas.join(', ') || null,
        })
        .eq('id', perfil.id);
      if (updateError) throw updateError;
      await refreshPerfil();
      showToast('Datos profesionales actualizados.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFotoChange(e) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const { ok, error: validationError } = validateImageFile(file);
    if (!ok) {
      setError(validationError);
      e.target.value = '';
      return;
    }

    setUploadingFoto(true);
    setError('');
    try {
      const ext = file.name.split('.').pop();
      const path = `${perfil.id}/foto-${Date.now()}.${ext}`;
      await uploadDocumento(path, file);

      const { error: updateError } = await supabase
        .from('perfiles')
        .update({ foto_url: path })
        .eq('id', perfil.id);
      if (updateError) throw updateError;

      await refreshPerfil();
      showToast('Foto de perfil actualizada.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo subir la foto.');
    } finally {
      setUploadingFoto(false);
      e.target.value = '';
    }
  }

  const signedFotoUrl = useSignedUrl(perfil?.foto_url);

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-[14px] font-semibold text-[#0A1628]">Datos profesionales</p>

      <div className="flex items-center gap-3">
        {signedFotoUrl ? (
          <img src={signedFotoUrl} alt="Foto de perfil" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F4F7F9] text-[14px] font-semibold text-[#0A1628]">
            {getInitials(perfil?.nombre_completo) || '—'}
          </div>
        )}
        <label className="cursor-pointer text-[12px] font-medium text-[#1A7A5E] underline underline-offset-2">
          {uploadingFoto ? 'Subiendo…' : 'Cambiar foto'}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFotoChange}
            disabled={uploadingFoto}
            className="hidden"
          />
        </label>
      </div>

      <Input label="Especialidad" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} />

      <div className="w-full text-left">
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="bio" className="text-[12px] font-medium text-[#5A6B7A]">
            Bio breve
          </label>
          <span className="text-[11px] text-[#5A6B7A]">
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id="bio"
          rows={3}
          maxLength={BIO_MAX}
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
        />
      </div>

      <div className="w-full text-left">
        <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Zonas de cobertura</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {zonas.map((zona) => (
            <span
              key={zona}
              className="flex items-center gap-1 rounded-full bg-[#F4F7F9] px-3 py-1 text-[12px] text-[#0A1628]"
            >
              {zona}
              <button
                type="button"
                aria-label={`Quitar ${zona}`}
                onClick={() => removeZona(zona)}
                className="text-[#5A6B7A]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={nuevaZona}
            onChange={(e) => setNuevaZona(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addZona();
              }
            }}
            placeholder="Agregar zona"
          />
          <Button variant="outline" fullWidth={false} onClick={addZona}>
            Agregar
          </Button>
        </div>
      </div>

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button onClick={handleGuardar} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </Button>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
