import { useEffect, useState } from 'react';
import { Card, Badge } from '../../components/ui';
import { fetchAlergias } from '../../lib/expediente';
import { formatFechaCorta } from '../../lib/format';

const SEVERIDAD_TONE = { leve: 'neutral', moderada: 'alert', severa: 'critical' };

export default function TabAlergias({ mascotaId }) {
  const [alergias, setAlergias] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAlergias(mascotaId).then((data) => {
      if (active) {
        setAlergias(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [mascotaId]);

  if (loading) return null;

  if (alergias.length === 0) {
    return (
      <div className="px-5 py-5">
        <Card className="text-center text-[12px] text-[#5A6B7A]">Sin alergias documentadas.</Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-5">
      {alergias.map((a) => (
        <Card key={a.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-[#0A1628]">{a.alergeno}</p>
            {a.severidad && <Badge tone={SEVERIDAD_TONE[a.severidad] ?? 'neutral'}>{a.severidad}</Badge>}
          </div>
          {a.reaccion && <p className="text-[12px] text-[#5A6B7A]">Reacción: {a.reaccion}</p>}
          {a.fecha && <p className="text-[11px] text-[#5A6B7A]">Registrada {formatFechaCorta(a.fecha)}</p>}
        </Card>
      ))}
    </div>
  );
}
