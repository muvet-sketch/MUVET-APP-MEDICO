// N-9 · Expediente cerrado, de solo lectura (SOAP, fórmula, órdenes,
// recomendaciones). D-043: el SOAP nunca se le muestra al tutor — esta
// pantalla es exclusiva del médico dueño del servicio (misma RLS que N-15).
// D-507: "Reportar corrección" nunca edita soap_notas, solo agrega un anexo
// (correcciones_soap_post_cierre) visible debajo del campo original.
import { useEffect, useState } from 'react';
import { Card, Badge } from '../../components/ui';
import { fetchServicioDetalle } from '../../lib/solicitudes';
import { fetchSoapNota } from '../../lib/soap';
import { fetchFormulaConItems } from '../../lib/formula';
import { fetchOrdenesExternas } from '../../lib/ordenes';
import { fetchRecomendaciones } from '../../lib/recomendaciones';
import { fetchCorreccionesSoap, solicitarCorreccionSoap } from '../../lib/historial';
import { formatFechaCorta } from '../../lib/format';
import CorreccionSoapModal from './CorreccionSoapModal';

const CAMPO_LABEL = { s: 'S · Subjetivo', o: 'O · Objetivo', a: 'A · Assessment', p: 'P · Plan' };

export default function DetalleServicio({ servicioId, onVolver }) {
  const [servicio, setServicio] = useState(null);
  const [soap, setSoap] = useState(null);
  const [formula, setFormula] = useState(null);
  const [ordenes, setOrdenes] = useState([]);
  const [recomendaciones, setRecomendaciones] = useState(null);
  const [correcciones, setCorrecciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalCampo, setModalCampo] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchServicioDetalle(servicioId),
      fetchSoapNota(servicioId),
      fetchFormulaConItems(servicioId),
      fetchOrdenesExternas(servicioId),
      fetchRecomendaciones(servicioId),
      fetchCorreccionesSoap(servicioId),
    ])
      .then(([servicioData, soapData, formulaData, ordenesData, recData, correccionesData]) => {
        if (!active) return;
        setServicio(servicioData);
        setSoap(soapData);
        setFormula(formulaData);
        setOrdenes(ordenesData);
        setRecomendaciones(recData);
        setCorrecciones(correccionesData);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar el expediente.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [servicioId]);

  async function handleSolicitarCorreccion({ campo, valorCorregido, motivo }) {
    await solicitarCorreccionSoap(servicioId, { campo, valorCorregido, motivo });
    const data = await fetchCorreccionesSoap(servicioId);
    setCorrecciones(data);
  }

  if (loading) return null;

  const mascota = servicio?.mascotas;

  function CampoSoap({ campo, label, valor }) {
    const correccionesDeEsteCampo = correcciones.filter((c) => c.campo === campo);
    return (
      <div className="flex flex-col gap-1 border-b border-[#E1E8ED] pb-3 last:border-0 last:pb-0">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#0A1628]">{label}</p>
          <button
            type="button"
            onClick={() => setModalCampo(campo)}
            className="text-[11px] font-medium text-[#1A7A5E]"
          >
            Reportar corrección
          </button>
        </div>
        <p className="text-[13px] text-[#0A1628]">{valor || '—'}</p>
        {correccionesDeEsteCampo.map((c) => (
          <div key={c.id} className="mt-1 rounded-[8px] bg-[#E8A23D1A] px-2.5 py-2">
            <p className="text-[11px] font-semibold text-[#8A5E17]">
              Corrección solicitada · {formatFechaCorta(c.created_at)} · {c.estado.replace('_', ' ')}
            </p>
            <p className="text-[12px] text-[#0A1628]">{c.valor_corregido}</p>
            <p className="text-[11px] text-[#5A6B7A]">Motivo: {c.motivo}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col pb-8">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#E1E8ED] bg-white px-5 py-4">
        <button type="button" onClick={onVolver} aria-label="Volver al historial" className="text-[18px] text-[#0A1628]">
          ←
        </button>
        <h1 className="text-[16px] font-semibold text-[#0A1628]">Expediente cerrado</h1>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
          <p className="text-[14px] font-semibold text-[#0A1628]">{mascota?.nombre ?? 'Sin nombre'}</p>
          <p className="text-[12px] text-[#5A6B7A]">Cerrado {formatFechaCorta(servicio?.cerrado_at)}</p>
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Card className="flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[#0A1628]">SOAP</p>
          <CampoSoap campo="s" label={CAMPO_LABEL.s} valor={soap?.s_subjetivo} />
          <CampoSoap campo="o" label={CAMPO_LABEL.o} valor={soap?.o_objetivo?.hallazgos} />
          <CampoSoap campo="a" label={CAMPO_LABEL.a} valor={soap?.a_assessment?.dx_principal} />
          <CampoSoap campo="p" label={CAMPO_LABEL.p} valor={soap?.p_plan} />
        </Card>

        <Card className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold text-[#0A1628]">Fórmula</p>
          {(!formula || formula.items.length === 0) && (
            <p className="text-[13px] text-[#5A6B7A]">Sin medicamentos formulados.</p>
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
          <p className="text-[14px] font-semibold text-[#0A1628]">Órdenes externas</p>
          {ordenes.length === 0 && <p className="text-[13px] text-[#5A6B7A]">Sin órdenes registradas.</p>}
          {ordenes.map((orden) => (
            <div key={orden.id} className="rounded-[10px] bg-[#F4F7F9] px-3 py-2">
              <p className="text-[13px] font-medium text-[#0A1628]">{orden.laboratorio_destino || 'Sin laboratorio'}</p>
              <p className="text-[12px] text-[#5A6B7A]">{(orden.items ?? []).join(' · ')}</p>
              {orden.interpretacion && <p className="text-[12px] text-[#5A6B7A]">Interpretación: {orden.interpretacion}</p>}
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[#0A1628]">Recomendaciones</p>
            <Badge tone={recomendaciones?.estado === 'aprobado' ? 'ok' : 'neutral'}>
              {recomendaciones?.estado === 'aprobado' ? 'Aprobadas' : 'Sin aprobar'}
            </Badge>
          </div>
          <p className="text-[13px] text-[#0A1628]">{recomendaciones?.cuidados_casa || '—'}</p>
        </Card>
      </div>

      <CorreccionSoapModal
        open={Boolean(modalCampo)}
        campo={modalCampo}
        onClose={() => setModalCampo(null)}
        onSave={handleSolicitarCorreccion}
      />
    </div>
  );
}
