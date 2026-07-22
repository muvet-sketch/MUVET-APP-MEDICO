import { useEffect, useState } from 'react';
import { Card, Badge } from '../../components/ui';
import { fetchServiciosCerrados } from '../../lib/expediente';
import { formatFechaCorta } from '../../lib/format';
import { useAuth } from '../../app/AuthContext';

function ServicioCerradoItem({ servicio, medicoNombre }) {
  const [expandido, setExpandido] = useState(false);
  const soap = Array.isArray(servicio.soap_notas) ? servicio.soap_notas[0] : servicio.soap_notas;
  const assessment = soap?.a_assessment;
  const dxPrincipal = assessment?.dx_principal;

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[#0A1628]">
          {formatFechaCorta(servicio.cerrado_at || servicio.created_at)}
        </p>
        <p className="text-[11px] text-[#5A6B7A]">{medicoNombre}</p>
      </div>
      <p className="text-[12px] text-[#0A1628]">{dxPrincipal || 'Sin diagnóstico principal registrado.'}</p>
      {assessment && (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="self-start text-[12px] font-medium text-[#1A7A5E]"
        >
          Ver SOAP completo {expandido ? '▲' : '▼'}
        </button>
      )}
      {expandido && (
        <pre className="whitespace-pre-wrap rounded-[8px] bg-[#F4F7F9] p-3 text-[11px] text-[#0A1628]">
          {JSON.stringify(assessment, null, 2)}
        </pre>
      )}
    </Card>
  );
}

// -- SUPUESTO: por RLS (D-043, servicios_select_medico) este médico solo ve
// los servicios cerrados donde él mismo fue el médico tratante — no hay
// historial cruzado entre médicos en este MVP.
export default function TabConsultas({ mascotaId }) {
  const { perfil } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchServiciosCerrados(mascotaId).then((data) => {
      if (active) {
        setServicios(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [mascotaId]);

  if (loading) return null;

  if (servicios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
        <Badge tone="info">🆕 Paciente nuevo</Badge>
        <p className="text-[13px] text-[#5A6B7A]">Primera consulta de este paciente en MUVET.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-5">
      {servicios.map((s) => (
        <ServicioCerradoItem key={s.id} servicio={s} medicoNombre={perfil?.nombre_completo ?? 'Tú'} />
      ))}
    </div>
  );
}
