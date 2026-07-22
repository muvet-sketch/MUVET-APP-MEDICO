// N-15 · SOAP + constantes vitales (Fase 5, Acción 1)
//
// Notación siempre S/O/A/P (nunca S/O/T/P ni otra variante, ver CLAUDE.md).
// D-043: el SOAP es absolutamente inaccesible para el tutor — reforzado por
// RLS (soap_notas_select_medico_dueno / _write_medico_dueno, 0001) y por el
// propio RPC guardar_soap_nota (0008), que revalida medico_id = auth.uid().
// Ver auditoría completa en el resumen de cierre de este despacho.
//
// -- SUPUESTO: "estado del problema" (a_assessment.estado_problema, ver
// comentario de la tabla soap_notas en 0001) se deja como texto libre — no
// se encontró una taxonomía clínica confirmada (p.ej. "estable/mejora/
// empeora") en el roadmap visto. Se reporta al fundador.
//
// STT (🎤 IRIS) sigue siendo el mock existente de Fase 4 (D-552/consentimiento
// de Apertura) — no se reconstruye voz-a-texto real en esta fase.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Input, Button, Badge, Toast, ScreenHeader } from '../../components/ui';
import { fetchServicioDetalle } from '../../lib/solicitudes';
import { fetchSoapNota, guardarSoapNota } from '../../lib/soap';

const CAMPOS_VITALES = [
  { key: 'fc', label: 'FC (lpm)' },
  { key: 'fr', label: 'FR (rpm)' },
  { key: 'temperatura', label: 'Temperatura (°C)' },
  { key: 'peso', label: 'Peso (kg)' },
  { key: 'condicionCorporal', label: 'Condición corporal (1-9)' },
];

const VACIO = {
  sSubjetivo: '',
  fc: '',
  fr: '',
  temperatura: '',
  peso: '',
  condicionCorporal: '',
  hallazgos: '',
  dxPrincipal: '',
  diferenciales: '',
  estadoProblema: '',
  pPlan: '',
};

function notaAFormulario(nota) {
  if (!nota) return VACIO;
  const constantes = nota.o_objetivo?.constantes ?? {};
  const assessment = nota.a_assessment ?? {};
  return {
    sSubjetivo: nota.s_subjetivo ?? '',
    fc: constantes.fc ?? '',
    fr: constantes.fr ?? '',
    temperatura: constantes.temperatura ?? '',
    peso: constantes.peso ?? '',
    condicionCorporal: constantes.condicion_corporal ?? '',
    hallazgos: nota.o_objetivo?.hallazgos ?? '',
    dxPrincipal: assessment.dx_principal ?? '',
    diferenciales: assessment.diferenciales ?? '',
    estadoProblema: assessment.estado_problema ?? '',
    pPlan: nota.p_plan ?? '',
  };
}

export default function N15Soap() {
  const { servicioId } = useParams();

  const [servicio, setServicio] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [editadoAt, setEditadoAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchServicioDetalle(servicioId), fetchSoapNota(servicioId)])
      .then(([servicioData, notaData]) => {
        if (!active) return;
        setServicio(servicioData);
        setForm(notaAFormulario(notaData));
        setEditadoAt(notaData?.editado_at ?? null);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar el SOAP.');
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

  async function handleGuardar() {
    setGuardando(true);
    setError('');
    try {
      const oObjetivo = {
        constantes: {
          fc: form.fc,
          fr: form.fr,
          temperatura: form.temperatura,
          peso: form.peso,
          condicion_corporal: form.condicionCorporal,
        },
        hallazgos: form.hallazgos,
        fotos: [], // TODO Fase 6+ — carga de fotos clínicas, fuera de alcance de esta fase
      };
      const aAssessment = {
        dx_principal: form.dxPrincipal,
        diferenciales: form.diferenciales,
        estado_problema: form.estadoProblema,
      };
      const nota = await guardarSoapNota(servicioId, {
        sSubjetivo: form.sSubjetivo,
        oObjetivo,
        aAssessment,
        pPlan: form.pPlan,
      });
      setEditadoAt(nota.editado_at);
      setToast(true);
      setTimeout(() => setToast(false), 2500);
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar el SOAP.');
    } finally {
      setGuardando(false);
    }
  }

  if (loading) return null;

  const mascota = servicio?.mascotas;

  return (
    <div className="flex min-h-svh flex-col pb-8">
      <ScreenHeader title="SOAP" />

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
            <p className="text-[14px] font-semibold text-[#0A1628]">{mascota?.nombre ?? 'Sin nombre'}</p>
          </div>
          {editadoAt && <Badge tone="ok">Guardado {new Date(editadoAt).toLocaleTimeString()}</Badge>}
        </div>

        <Card className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#0A1628]">S · Subjetivo</p>
          <Button variant="ghost" disabled className="!w-auto self-start px-3 py-2 text-[12px]" title="Disponible en Fase 5/6">
            🎤 IRIS (mock — asiste la redacción)
          </Button>
          <textarea
            rows={3}
            placeholder="Motivo referido por el tutor, anamnesis…"
            value={form.sSubjetivo}
            onChange={(e) => setCampo('sSubjetivo', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#0A1628]">O · Objetivo — Constantes vitales</p>
          <div className="grid grid-cols-2 gap-3">
            {CAMPOS_VITALES.map((campo) => (
              <Input
                key={campo.key}
                label={campo.label}
                inputMode="decimal"
                value={form[campo.key]}
                onChange={(e) => setCampo(campo.key, e.target.value)}
              />
            ))}
          </div>
          <label htmlFor="soap-hallazgos" className="mt-1 block text-[12px] font-medium text-[#5A6B7A]">
            Hallazgos al examen por sistemas
          </label>
          <textarea
            id="soap-hallazgos"
            rows={3}
            value={form.hallazgos}
            onChange={(e) => setCampo('hallazgos', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#0A1628]">A · Assessment</p>
          <Input
            label="Diagnóstico principal"
            value={form.dxPrincipal}
            onChange={(e) => setCampo('dxPrincipal', e.target.value)}
          />
          <label htmlFor="soap-diferenciales" className="block text-[12px] font-medium text-[#5A6B7A]">
            Diagnósticos diferenciales
          </label>
          <textarea
            id="soap-diferenciales"
            rows={2}
            value={form.diferenciales}
            onChange={(e) => setCampo('diferenciales', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Input
            label="Estado del problema"
            value={form.estadoProblema}
            onChange={(e) => setCampo('estadoProblema', e.target.value)}
          />
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#0A1628]">P · Plan</p>
          <textarea
            rows={3}
            placeholder="Plan terapéutico, indicaciones, seguimiento…"
            value={form.pPlan}
            onChange={(e) => setCampo('pPlan', e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </Card>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'GUARDAR SOAP'}
        </Button>
      </div>

      <Toast message="SOAP guardado" tone="ok" visible={toast} />
    </div>
  );
}
