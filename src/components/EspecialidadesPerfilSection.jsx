import { useState } from 'react';
import { useAuth } from '../app/AuthContext';
import { Card, Button, Toast, ChipMultiSelect, Badge } from './ui';
import {
  ESPECIALIDADES_VETERINARIAS,
  guardarEspecialidadesPerfil,
  normalizarEspecialidades,
  esVisibleEnDirectorio,
  faltaParaDirectorio,
} from '../lib/especialidades';
import { NOMBRE_ESPECIALISTAS } from '../lib/nombresModulos';

// Especialidades del médico (migración 0039). Solo N-8: el auxiliar y la
// clínica no tienen especialidades — el directorio es de médicos.
//
// A diferencia de HabilidadesPerfilSection, de la que copia la forma:
//
//   · `allowCustom={false}` — el catálogo es CERRADO. El directorio se filtra
//     por especialidad y un valor libre volvería inencontrable a quien lo
//     escribiera.
//   · No hay paso de sincronización con publicaciones. Las habilidades se
//     copian a cada oferta de Turnos; las especialidades no se copian a
//     ninguna parte: la vista `especialistas_directorio` lee el perfil en vivo,
//     así que guardar acá ya cambia lo que ve el resto del mundo.
//
// El aviso de arriba es lo que evita que el médico quede adivinando por qué no
// aparece listado: son DOS condiciones (matrícula validada + ≥1 especialidad) y
// la primera no depende de él.
export default function EspecialidadesPerfilSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [especialidades, setEspecialidades] = useState(
    normalizarEspecialidades(perfil?.especialidades),
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
      await guardarEspecialidadesPerfil(perfil.id, especialidades);
      await refreshPerfil();
      showToast('Especialidades actualizadas.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (!perfil || perfil.rol !== 'medico') return null;

  const visible = esVisibleEnDirectorio(perfil);
  const falta = faltaParaDirectorio(perfil);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-semibold text-[#0A1628]">Especialidades</p>
          {visible ? (
            <Badge tone="ok">En el directorio</Badge>
          ) : (
            <Badge tone="alert">Sin listar</Badge>
          )}
        </div>
        <p className="mt-1 text-[12px] text-[#5A6B7A]">
          {visible
            ? `Apareces en ${NOMBRE_ESPECIALISTAS}: otros médicos y clínicas pueden encontrarte y contratarte.`
            : `Para aparecer en ${NOMBRE_ESPECIALISTAS} necesitas matrícula COMVEZCOL validada y al menos una especialidad.`}
        </p>
        {falta && <p className="mt-1 text-[12px] font-medium text-[#E8A23D]">Falta: {falta}</p>}
      </div>

      <ChipMultiSelect
        label={`Mis especialidades (${especialidades.length})`}
        hint="Elige solo las que ejerces. Es lo que se usa para filtrar el directorio."
        options={ESPECIALIDADES_VETERINARIAS}
        value={especialidades}
        onChange={setEspecialidades}
        collapsible
        searchable
      />

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button onClick={handleGuardar} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar especialidades'}
      </Button>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
