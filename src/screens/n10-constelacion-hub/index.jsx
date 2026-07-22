// N-10 · Hub de Constelación (shell)
//
// Alcance de Fase 4 (DESP-CLAUDECODE-P-EI-AppMedico-004, Acción 2): solo
// navegación y estructura. El contenido clínico real (SOAP, Fórmula,
// Órdenes) llega en Fase 5/6 — ver TODOs marcados abajo y en BarraTrueta.
//
// Solo accesible tras completar Apertura (estado 'activa' — doble
// consentimiento D-116 cumplido). No es accesible por URL directa en otro
// estado: este componente redirige a la pantalla que corresponda.
//
// -- SUPUESTO: los títulos de las 2 tabs ("Resumen" / "Clínico") no están
// confirmados contra ningún roadmap visto — se reporta al fundador.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Badge, ScreenHeader } from '../../components/ui';
import { fetchServicioDetalle } from '../../lib/solicitudes';
import BarraTrueta from './BarraTrueta';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'clinico', label: 'Clínico' },
];

export default function N10ConstelacionHub() {
  const { servicioId } = useParams();
  const navigate = useNavigate();
  const [servicio, setServicio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('resumen');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchServicioDetalle(servicioId)
      .then((data) => {
        if (active) setServicio(data);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudo cargar el servicio.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [servicioId]);

  useEffect(() => {
    if (!servicio) return;
    if (servicio.estado === 'en_camino') {
      navigate(`/constelacion/${servicioId}`, { replace: true });
    } else if (servicio.estado === 'en_apertura') {
      navigate(`/servicio/${servicioId}/apertura`, { replace: true });
    } else if (servicio.estado !== 'activa') {
      navigate('/home', { replace: true });
    }
  }, [servicio, servicioId, navigate]);

  if (loading) return null;

  if (error && !servicio) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Constelación" fallbackTo="/home" />
        <p className="px-5 py-6 text-[13px] text-[#C63B3B]">{error}</p>
      </div>
    );
  }

  if (!servicio || servicio.estado !== 'activa') return null;

  const mascota = servicio.mascotas;
  const tutor = servicio.solicitudes?.tutores;

  return (
    <div className="flex min-h-svh flex-col pb-20">
      <ScreenHeader title="Constelación activa" fallbackTo="/home" />

      <div className="flex items-center gap-2 px-5 pt-4">
        <Badge tone="ok">🟢 Servicio activo</Badge>
        {servicio.iris_activo && <Badge tone="info">Asistido por IRIS</Badge>}
      </div>

      <div className="sticky top-[57px] z-10 mt-3 flex border-b border-[#E1E8ED] bg-white px-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-3 text-[12px] font-medium ${
              tab === t.key ? 'border-[#1A7A5E] text-[#0A1628]' : 'border-transparent text-[#5A6B7A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        {tab === 'resumen' && (
          <Card className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-[#5A6B7A]">Paciente</p>
            <p className="text-[14px] text-[#0A1628]">
              {mascota?.nombre} {mascota?.raza ? `(${mascota.raza})` : ''}
            </p>
            <p className="mt-2 text-[12px] font-semibold text-[#5A6B7A]">Tutor</p>
            <p className="text-[14px] text-[#0A1628]">{tutor?.nombre_completo ?? 'Sin nombre registrado'}</p>
            <p className="mt-2 text-[12px] font-semibold text-[#5A6B7A]">Check-in de llegada</p>
            <p className="text-[14px] text-[#0A1628]">
              {servicio.checkin_llegada_at ? new Date(servicio.checkin_llegada_at).toLocaleTimeString() : '—'}
            </p>
          </Card>
        )}

        {tab === 'clinico' && (
          // TODO Fase 5/6 — SOAP / Fórmula / Órdenes reales.
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">
              El contenido clínico (SOAP, Fórmula, Órdenes) se conecta en Fase 5/6. Usa la Barra Trueta para navegar
              a los placeholders correspondientes.
            </p>
          </Card>
        )}
      </div>

      <BarraTrueta servicioId={servicioId} irisActivo={servicio.iris_activo} />
    </div>
  );
}
