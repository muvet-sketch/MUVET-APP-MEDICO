import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { uploadDocumento, useSignedUrl } from '../../lib/storage';
import { validateImageFile } from '../../lib/fileValidation';
import { verificarMatriculaComvezcol, RESULTADO_VALIDADO } from '../../lib/verificacionComvezcol';
import { Card, Badge, Input, Button, Toast } from '../../components/ui';

const ESTADO_BADGE = {
  validado: { tone: 'ok', label: '✅ Vigente' },
  pendiente: { tone: 'alert', label: '⏳ En validación (≤24h)' },
  rechazado: { tone: 'critical', label: '❌ Rechazada — contacta soporte' },
  // 0025: posible suplantación (matrícula ajena o ya registrada en otra cuenta).
  en_disputa: { tone: 'critical', label: '⚠️ En verificación — contacta soporte' },
};

// D-541: cualquier cambio de matrícula/carné vuelve el estado a 'pendiente' y requiere nueva validación manual.
export default function MatriculaSection() {
  const { perfil, refreshPerfil } = useAuth();
  const [editing, setEditing] = useState(false);
  const [matricula, setMatricula] = useState(perfil?.matricula_comvezcol ?? '');
  const [carneFile, setCarneFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  function handleCarneChange(e) {
    const file = e.target.files?.[0] ?? null;
    setError('');
    if (!file) return;
    const { ok, error: validationError } = validateImageFile(file);
    if (!ok) {
      setError(validationError);
      e.target.value = '';
      return;
    }
    setCarneFile(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!matricula.trim()) {
      setError('La matrícula COMVEZCOL es obligatoria.');
      return;
    }

    setSaving(true);
    try {
      let carneUrl = perfil.carne_url;
      if (carneFile) {
        const ext = carneFile.name.split('.').pop();
        const path = `${perfil.id}/carne-${Date.now()}.${ext}`;
        await uploadDocumento(path, carneFile);
        carneUrl = path;
      }

      // `estado_validacion` NO se manda desde el cliente: el trigger de 0025
      // lo rechaza (solo la Edge Function lo escribe) y él mismo se encarga de
      // devolverlo a 'pendiente' cuando cambia la matrícula o el carné.
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          matricula_comvezcol: matricula.trim(),
          carne_url: carneUrl,
        })
        .eq('id', perfil.id);
      if (updateError) throw updateError;

      setEditing(false);
      setCarneFile(null);

      // Verificación automática contra el registro del Consejo. Su fallo no
      // debe presentarse como fallo del guardado: la matrícula ya quedó
      // guardada y en 'pendiente', que es exactamente el estado del respaldo
      // manual.
      let resultado = null;
      try {
        resultado = (await verificarMatriculaComvezcol())?.resultado ?? null;
      } catch {
        resultado = null;
      }

      // refreshPerfil va DESPUÉS de verificar para que el badge muestre
      // 'validado' de una vez cuando la verificación automática funcionó.
      await refreshPerfil();

      showToast(
        resultado === RESULTADO_VALIDADO
          ? 'Matrícula verificada con el Consejo.'
          : 'Matrícula enviada a validación (≤24h).',
        'ok',
      );
    } catch (err) {
      setError(err.message ?? 'No se pudo actualizar la matrícula.');
    } finally {
      setSaving(false);
    }
  }

  const estado = ESTADO_BADGE[perfil?.estado_validacion] ?? ESTADO_BADGE.pendiente;
  const signedCarneUrl = useSignedUrl(perfil?.carne_url);

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">Matrícula COMVEZCOL</p>

      {!editing ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[14px] text-[#0A1628]">{perfil?.matricula_comvezcol ?? '—'}</p>
            <Badge tone={estado.tone}>{estado.label}</Badge>
          </div>

          {/* fecha_validacion la agrega la migración 0024 (resuelve el SUPUESTO que
              estaba anotado acá); la escribe tanto la verificación automática como
              una validación hecha a mano. */}
          {perfil?.estado_validacion === 'validado' && perfil?.fecha_validacion ? (
            <p className="text-[12px] text-[#5A6B7A]">
              Validada el{' '}
              {new Date(perfil.fecha_validacion).toLocaleDateString('es-CO', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          ) : null}

          {signedCarneUrl ? (
            <img src={signedCarneUrl} alt="Carné COMVEZCOL" className="w-full rounded-[10px] border border-[#E1E8ED]" />
          ) : (
            <p className="text-[12px] text-[#5A6B7A]">Sin imagen de carné.</p>
          )}

          <Button variant="outline" onClick={() => setEditing(true)}>
            Actualizar matrícula / carné
          </Button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input label="Matrícula COMVEZCOL" required value={matricula} onChange={(e) => setMatricula(e.target.value)} />
          <div className="w-full text-left">
            <label htmlFor="carne-update" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
              Nueva foto del carné (opcional)
            </label>
            <input
              id="carne-update"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleCarneChange}
              className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px]"
            />
          </div>
          <p className="text-[12px] text-[#5A6B7A]">
            Cualquier cambio vuelve tu estado a "En validación": verificamos la matrícula contra el
            registro del Consejo y, si no podemos confirmarla, la revisa una persona (plazo ≤24h).
          </p>

          {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError('');
                setCarneFile(null);
                setMatricula(perfil?.matricula_comvezcol ?? '');
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enviando…' : 'Enviar a validación'}
            </Button>
          </div>
        </form>
      )}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
