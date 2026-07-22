import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { Card, Input, Button, Toast } from '../../components/ui';

// SUPUESTO: el Auxiliar no tiene una pantalla de perfil propia con número de
// pantalla asignado (a diferencia de N-29 para Clínica) — el despacho de
// Fase 7 (Acción 4) solo dice "acceso a perfil" para N-28 sin más detalle.
// Se resuelve como sección editable inline, decisión confirmada con el
// fundador durante esta fase (no como pantalla nueva).
export default function PerfilAuxiliarInline({ onClose }) {
  const { perfil, refreshPerfil } = useAuth();
  const [nombreCompleto, setNombreCompleto] = useState(perfil?.nombre_completo ?? '');
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '');
  const [zonaCobertura, setZonaCobertura] = useState(perfil?.zona_cobertura ?? '');
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
          zona_cobertura: zonaCobertura.trim(),
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
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Mi perfil</p>
        <button type="button" onClick={onClose} className="text-[12px] text-[#5A6B7A] underline underline-offset-2">
          Cerrar
        </button>
      </div>

      <form onSubmit={handleGuardar} className="flex flex-col gap-3">
        <Input label="Nombre completo" required value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} />
        <Input label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <Input label="Zona de cobertura" required value={zonaCobertura} onChange={(e) => setZonaCobertura(e.target.value)} />

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
