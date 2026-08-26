import { useState } from 'react';
import { useAuth } from '../app/AuthContext';
import { Card, Button, Toast, ChipMultiSelect } from './ui';
import {
  HABILIDADES_PROFESIONALES,
  HABILIDADES_PERSONALES,
  guardarHabilidadesPerfil,
  normalizarHabilidades,
} from '../lib/habilidades';
import { sincronizarHabilidadesPublicaciones } from '../lib/relevo';
import { NOMBRE_TURNOS } from '../lib/nombresModulos';

// Configuración de habilidades del usuario (migración 0015). La usan médico
// (N-8) y auxiliar (perfil inline de N-28) — la clínica no la tiene, porque
// sus habilidades son expectativas sobre el candidato y viven en cada oferta.
//
// Lo guardado aquí queda activo en Relevo: se copia a las publicaciones
// existentes del usuario y se reaplica cada vez que crea o activa una oferta
// (ver activarPublicacion en lib/relevo.js).
export default function HabilidadesPerfilSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [profesionales, setProfesionales] = useState(
    normalizarHabilidades(perfil?.habilidades_profesionales, HABILIDADES_PROFESIONALES),
  );
  const [personales, setPersonales] = useState(
    normalizarHabilidades(perfil?.habilidades_personales, HABILIDADES_PERSONALES),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function handleGuardar() {
    setSaving(true);
    setError('');
    try {
      await guardarHabilidadesPerfil(perfil.id, { profesionales, personales });
      await sincronizarHabilidadesPublicaciones(perfil.id, { profesionales, personales });
      await refreshPerfil();
      showToast('Habilidades actualizadas.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (!perfil) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-[14px] font-semibold text-[#0A1628]">Habilidades</p>
        <p className="mt-1 text-[12px] text-[#5A6B7A]">
          {`Quedan activas en tu oferta de ${NOMBRE_TURNOS} cada vez que la creas o la publicas. También puedes ajustarlas al editar la oferta.`}
        </p>
      </div>

      <ChipMultiSelect
        label={`Profesionales (${profesionales.length})`}
        options={HABILIDADES_PROFESIONALES}
        value={profesionales}
        onChange={setProfesionales}
        allowCustom
      />

      <ChipMultiSelect
        label={`Personales (${personales.length})`}
        options={HABILIDADES_PERSONALES}
        value={personales}
        onChange={setPersonales}
        allowCustom
      />

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button onClick={handleGuardar} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar habilidades'}
      </Button>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
