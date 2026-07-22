import { useEffect, useState } from 'react';
import { Card, Badge } from '../../components/ui';
import { fetchMedicamentosActuales } from '../../lib/expediente';
import { formatFechaCorta } from '../../lib/format';

export default function TabMedicamentos({ mascotaId }) {
  const [medicamentos, setMedicamentos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchMedicamentosActuales(mascotaId).then((data) => {
      if (active) {
        setMedicamentos(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [mascotaId]);

  if (loading) return null;

  if (medicamentos.length === 0) {
    return (
      <div className="px-5 py-5">
        <Card className="text-center text-[12px] text-[#5A6B7A]">Sin medicamentos activos registrados.</Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-5">
      {medicamentos.map((m) => (
        <Card key={m.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-[#0A1628]">{m.nombre}</p>
            {m.cronico && <Badge tone="alert">Crónico</Badge>}
          </div>
          <p className="text-[12px] text-[#5A6B7A]">
            {[m.dosis, m.frecuencia].filter(Boolean).join(' · ') || 'Sin dosis/frecuencia registrada'}
          </p>
          {m.desde && <p className="text-[11px] text-[#5A6B7A]">Desde {formatFechaCorta(m.desde)}</p>}
          {m.prescrito_por && <p className="text-[11px] text-[#5A6B7A]">Prescrito por {m.prescrito_por}</p>}
        </Card>
      ))}
    </div>
  );
}
