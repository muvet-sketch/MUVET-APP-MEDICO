// N-19 · Cierre de servicio (Fase 6, Acción 3)
//
// Único punto de entrada: el botón [✕] de la Barra Trueta (D-505, ver
// src/screens/n10-constelacion-hub/BarraTrueta.jsx) — sin pasos
// intermedios. checkin_llegada_at (D-537) se registra en Apertura, no aquí.
//
// Checklist de pre-cierre (D-506) calculado aquí mismo a partir de lo que
// ya exponen fetchSoapNota / fetchFormulaConItems / fetchOrdenesExternas /
// fetchRecomendaciones — no hay un RPC de checklist aparte. El RPC
// cerrar_servicio (0009) revalida en servidor los BLOQUEANTES (defensa en
// profundidad, mismo criterio que abrir_constelacion en 0006): SOAP·A vacío
// y fórmula en borrador. Los ADVISORY solo informan, no bloquean.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Button, Badge, ScreenHeader } from '../../components/ui';
import { fetchServicioDetalle } from '../../lib/solicitudes';
import { fetchSoapNota } from '../../lib/soap';
import { fetchFormulaConItems } from '../../lib/formula';
import { fetchOrdenesExternas } from '../../lib/ordenes';
import { fetchRecomendaciones } from '../../lib/recomendaciones';
import { cerrarServicio } from '../../lib/cierre';

function calcularChecklist({ soap, formula, ordenes, recomendaciones }) {
  const bloqueantes = [];
  const advisories = [];

  if (!soap?.a_assessment?.dx_principal) {
    bloqueantes.push('SOAP·A (diagnóstico principal) está vacío.');
  }
  if (formula && formula.estado === 'borrador') {
    bloqueantes.push('La fórmula del servicio sigue en estado BORRADOR.');
  }

  if (!recomendaciones || recomendaciones.estado !== 'aprobado') {
    advisories.push({ texto: 'Las recomendaciones al tutor (N-18) no están aprobadas.', link: 'recomendaciones' });
  }
  if (!soap?.o_objetivo?.hallazgos && !soap?.o_objetivo?.constantes?.fc) {
    advisories.push({ texto: 'SOAP·O (constantes/hallazgos) está incompleto.' });
  }
  if (!soap?.p_plan) {
    advisories.push({ texto: 'SOAP·P (plan) está vacío.' });
  }
  const ordenesSinResultado = (ordenes ?? []).filter((o) => o.estado === 'emitida');
  if (ordenesSinResultado.length > 0) {
    advisories.push({ texto: `${ordenesSinResultado.length} orden(es) externa(s) emitida(s) sin resultado cargado.`, link: 'ordenes' });
  }

  return { bloqueantes, advisories };
}

function formatDuracion(inicio, fin) {
  if (!inicio || !fin) return '—';
  const minutos = Math.round((new Date(fin) - new Date(inicio)) / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas}h ${minutos % 60}min`;
}

export default function N19CierreServicio() {
  const { servicioId } = useParams();
  const navigate = useNavigate();

  const [servicio, setServicio] = useState(null);
  const [checklist, setChecklist] = useState({ bloqueantes: [], advisories: [] });
  const [recomendacionesEstado, setRecomendacionesEstado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchServicioDetalle(servicioId),
      fetchSoapNota(servicioId),
      fetchFormulaConItems(servicioId),
      fetchOrdenesExternas(servicioId),
      fetchRecomendaciones(servicioId),
    ])
      .then(([servicioData, soap, formula, ordenes, recomendaciones]) => {
        if (!active) return;
        setServicio(servicioData);
        setRecomendacionesEstado(recomendaciones?.estado ?? 'borrador');
        setChecklist(calcularChecklist({ soap, formula, ordenes, recomendaciones }));
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar el checklist de cierre.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [servicioId]);

  async function handleCerrar() {
    setCerrando(true);
    setError('');
    try {
      const cerrado = await cerrarServicio(servicioId);
      setResultado(cerrado);
    } catch (err) {
      setError(err.message ?? 'No se pudo cerrar el servicio.');
    } finally {
      setCerrando(false);
    }
  }

  if (loading) return null;

  if (resultado) {
    return (
      <div className="flex min-h-svh flex-col pb-8">
        <ScreenHeader title="Servicio cerrado" fallbackTo="/home" />
        <div className="flex flex-1 flex-col gap-4 px-5 py-5">
          <Card className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-[#5A6B7A]">ID del servicio</p>
            <p className="text-[13px] text-[#0A1628]">{resultado.id}</p>
            <p className="mt-2 text-[12px] font-semibold text-[#5A6B7A]">Duración</p>
            <p className="text-[14px] text-[#0A1628]">
              {formatDuracion(resultado.checkin_llegada_at ?? resultado.created_at, resultado.cerrado_at)}
            </p>
            <p className="mt-2 text-[12px] font-semibold text-[#5A6B7A]">Recomendaciones al tutor</p>
            <Badge tone={recomendacionesEstado === 'aprobado' ? 'ok' : 'alert'}>
              {recomendacionesEstado === 'aprobado' ? 'Aprobadas' : 'Sin aprobar'}
            </Badge>
            <p className="mt-2 text-[12px] font-semibold text-[#5A6B7A]">Cobro</p>
            <Badge tone="info">Cobro simulado (Siigo Pay pendiente de integración)</Badge>
          </Card>

          <Button onClick={() => navigate('/home')}>Ir al inicio</Button>
          {/* El expediente cerrado vive ahora en N-27 · Mis Domicilios (el
              módulo de domicilios quedó autocontenido); /historial pasó a ser
              el historial único de Cobertura de Servicio + Relevo. */}
          <Button variant="outline" onClick={() => navigate(`/servicios?servicio=${resultado.id}`)}>
            Ver expediente cerrado
          </Button>
        </div>
      </div>
    );
  }

  const mascota = servicio?.mascotas;

  return (
    <div className="flex min-h-svh flex-col pb-8">
      <ScreenHeader title="Cierre de servicio" />

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
          <p className="text-[14px] font-semibold text-[#0A1628]">{mascota?.nombre ?? 'Sin nombre'}</p>
        </div>

        {checklist.bloqueantes.length > 0 && (
          <Card className="flex flex-col gap-2 border-[#C63B3B]">
            <p className="text-[14px] font-semibold text-[#C63B3B]">Bloqueantes</p>
            {checklist.bloqueantes.map((texto) => (
              <p key={texto} className="text-[13px] text-[#0A1628]">
                ⛔ {texto}
              </p>
            ))}
          </Card>
        )}

        {checklist.advisories.length > 0 && (
          <Card className="flex flex-col gap-2 border-[#E8A23D]">
            <p className="text-[14px] font-semibold text-[#8A5E17]">Advertencias (no bloquean)</p>
            {checklist.advisories.map((item) => (
              <div key={item.texto} className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-[#0A1628]">⚠ {item.texto}</p>
                {item.link === 'recomendaciones' && (
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    className="!w-auto px-2 py-1 text-[12px]"
                    onClick={() => navigate(`/recomendaciones/${servicioId}`)}
                  >
                    Ir
                  </Button>
                )}
                {item.link === 'ordenes' && (
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    className="!w-auto px-2 py-1 text-[12px]"
                    onClick={() => navigate(`/ordenes/${servicioId}`)}
                  >
                    Ir
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}

        {checklist.bloqueantes.length === 0 && checklist.advisories.length === 0 && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">Todo listo para cerrar el servicio.</p>
          </Card>
        )}

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Button onClick={handleCerrar} disabled={cerrando || checklist.bloqueantes.length > 0}>
          {cerrando ? 'Cerrando…' : 'CERRAR SERVICIO'}
        </Button>
      </div>
    </div>
  );
}
