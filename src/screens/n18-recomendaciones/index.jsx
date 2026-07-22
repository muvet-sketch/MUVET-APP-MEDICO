// N-18 · Recomendaciones al tutor (Fase 6, Acción 2)
//
// Documento separado del SOAP (D-043: nunca expone contenido clínico
// interno, solo lo que el médico redacta explícitamente aquí para el
// tutor). No usa IA para generar el borrador — el médico escribe desde
// cero (P3: nada se guarda ni aprueba sin acción explícita). La sección
// "Medicamentos" es de solo lectura, tomada de la fórmula del servicio
// (src/lib/formula.js) — no se duplica esa lógica.
//
// D-552: se estampa el logo/firma del médico (o iniciales + nombre +
// matrícula si no hay imagen), igual que en la sección de perfil (N-8).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Button, Badge, Toast, ScreenHeader } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { fetchServicioDetalle } from '../../lib/solicitudes';
import { fetchFormulaConItems } from '../../lib/formula';
import { fetchRecomendaciones, guardarRecomendaciones, aprobarRecomendaciones } from '../../lib/recomendaciones';
import { getInitials } from '../../lib/format';
import { useSignedUrl } from '../../lib/storage';

const VACIO = { cuidadosCasa: '', signosAlarma: '', proximaCita: '', seccionPersonalizada: '' };

const ESTADO_BADGE = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  en_edicion: { label: 'En edición', tone: 'alert' },
  aprobado: { label: 'Aprobado', tone: 'ok' },
};

function recomendacionAFormulario(rec) {
  if (!rec) return VACIO;
  return {
    cuidadosCasa: rec.cuidados_casa ?? '',
    signosAlarma: rec.signos_alarma ?? '',
    proximaCita: rec.proxima_cita ?? '',
    seccionPersonalizada: rec.seccion_personalizada ?? '',
  };
}

export default function N18Recomendaciones() {
  const { servicioId } = useParams();
  const { perfil } = useAuth();
  const signedLogoUrl = useSignedUrl(perfil?.logo_firma_url);

  const [servicio, setServicio] = useState(null);
  const [formula, setFormula] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [estado, setEstado] = useState('borrador');
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchServicioDetalle(servicioId), fetchFormulaConItems(servicioId), fetchRecomendaciones(servicioId)])
      .then(([servicioData, formulaData, recData]) => {
        if (!active) return;
        setServicio(servicioData);
        setFormula(formulaData);
        setForm(recomendacionAFormulario(recData));
        setEstado(recData?.estado ?? 'borrador');
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudieron cargar las recomendaciones.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [servicioId]);

  function setCampo(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function mostrarToast(mensaje) {
    setToast(mensaje);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleGuardar() {
    setGuardando(true);
    setError('');
    try {
      const rec = await guardarRecomendaciones(servicioId, form);
      setEstado(rec.estado);
      mostrarToast('Borrador guardado');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar el borrador.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleAprobar() {
    setGuardando(true);
    setError('');
    try {
      await guardarRecomendaciones(servicioId, form);
      const rec = await aprobarRecomendaciones(servicioId);
      setEstado(rec.estado);
      mostrarToast('Recomendaciones aprobadas');
    } catch (err) {
      setError(err.message ?? 'No se pudo aprobar el documento.');
    } finally {
      setGuardando(false);
    }
  }

  if (loading) return null;

  const mascota = servicio?.mascotas;
  const badge = ESTADO_BADGE[estado] ?? ESTADO_BADGE.borrador;

  return (
    <div className="flex min-h-svh flex-col pb-8">
      <ScreenHeader title="Recomendaciones" />

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
            <p className="text-[14px] font-semibold text-[#0A1628]">{mascota?.nombre ?? 'Sin nombre'}</p>
          </div>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>

        <Card className="flex flex-col gap-2">
          <label htmlFor="rec-cuidados" className="text-[14px] font-semibold text-[#0A1628]">
            Cuidados en casa
          </label>
          <textarea
            id="rec-cuidados"
            rows={3}
            placeholder="Alimentación, reposo, curaciones, higiene…"
            value={form.cuidadosCasa}
            onChange={(e) => setCampo('cuidadosCasa', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </Card>

        <Card className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold text-[#0A1628]">Medicamentos</p>
          <p className="text-[12px] text-[#5A6B7A]">Referencia de solo lectura, tomada de la fórmula del servicio.</p>
          {(!formula || formula.items.length === 0) && (
            <p className="text-[13px] text-[#5A6B7A]">Sin medicamentos en la fórmula todavía.</p>
          )}
          {formula?.items.map((item) => (
            <div key={item.id} className="rounded-[10px] bg-[#F4F7F9] px-3 py-2">
              <p className="text-[13px] font-medium text-[#0A1628]">{item.dci}</p>
              <p className="text-[12px] text-[#5A6B7A]">
                {[item.dosis, item.via, item.frecuencia, item.duracion].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-2">
          <label htmlFor="rec-signos" className="text-[14px] font-semibold text-[#0A1628]">
            Signos de alarma
          </label>
          <textarea
            id="rec-signos"
            rows={3}
            placeholder="Cuándo debe contactar al médico o llevar a la mascota a urgencias…"
            value={form.signosAlarma}
            onChange={(e) => setCampo('signosAlarma', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </Card>

        <Card className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold text-[#0A1628]">Próxima cita</p>
          <input
            placeholder="Ej. Control en 7 días"
            value={form.proximaCita}
            onChange={(e) => setCampo('proximaCita', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </Card>

        <Card className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold text-[#0A1628]">Sección personalizada (opcional)</p>
          <textarea
            rows={2}
            value={form.seccionPersonalizada}
            onChange={(e) => setCampo('seccionPersonalizada', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </Card>

        <Card className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E1E8ED] bg-[#F4F7F9]">
            {signedLogoUrl ? (
              <img src={signedLogoUrl} alt="Logo/firma" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[12px] font-semibold text-[#0A1628]">{getInitials(perfil?.nombre_completo) || '—'}</span>
            )}
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#0A1628]">{perfil?.nombre_completo}</p>
            <p className="text-[11px] text-[#5A6B7A]">Matrícula {perfil?.matricula_comvezcol ?? '—'}</p>
          </div>
        </Card>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar borrador'}
          </Button>
          <Button onClick={handleAprobar} disabled={guardando || estado === 'aprobado'}>
            {estado === 'aprobado' ? 'Aprobado' : 'Aprobar'}
          </Button>
        </div>
      </div>

      <Toast message={toast} tone="ok" visible={Boolean(toast)} />
    </div>
  );
}
