import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, Input, Button, Toast, ChipMultiSelect } from '../../components/ui';
import { ZONAS_COBERTURA, parseZonas, serializarZonas } from '../../lib/municipios';
import { NOMBRE_TURNOS } from '../../lib/nombresModulos';

// Datos básicos editables del auxiliar. Antes vivía como panel inline dentro
// de la Home (N-28) reabierto vía ?perfil=1; ahora es una sección de la
// pantalla de perfil dedicada (N-28 Perfil Auxiliar), en línea con lo que ya
// tienen médico (N-8) y clínica (N-29).
export default function DatosAuxiliarSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [nombreCompleto, setNombreCompleto] = useState(perfil?.nombre_completo ?? '');
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '');
  const [zonas, setZonas] = useState(parseZonas(perfil?.zona_cobertura));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          nombre_completo: nombreCompleto.trim(),
          telefono: telefono.trim(),
          zona_cobertura: serializarZonas(zonas),
        })
        .eq('id', perfil.id);
      if (updateError) throw updateError;
      await refreshPerfil();
      showToast('Perfil actualizado.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">Datos básicos</p>

      <form onSubmit={handleGuardar} className="flex flex-col gap-3">
        <Input label="Nombre completo" required value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} />
        <Input label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <ChipMultiSelect
          searchable
          label={`Zona de cobertura (${zonas.length})`}
          hint={`También filtra las ofertas que ves en ${NOMBRE_TURNOS}.`}
          options={ZONAS_COBERTURA}
          value={zonas}
          onChange={setZonas}
        />

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
