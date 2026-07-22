import { useEffect, useState } from 'react';
import { Card, Badge, Button } from '../../components/ui';
import { fetchVacunas, fetchDesparasitaciones } from '../../lib/expediente';
import { formatFechaCorta } from '../../lib/format';

function esVencida(proximaDosis) {
  if (!proximaDosis) return false;
  return new Date(proximaDosis) < new Date(new Date().toDateString());
}

function ListaItem({ item }) {
  const vencida = esVencida(item.proxima_dosis);
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[#0A1628]">{item.producto || item.tipo || 'Sin producto'}</p>
        <p className="truncate text-[11px] text-[#5A6B7A]">
          Aplicada: {formatFechaCorta(item.fecha_aplicacion) || '—'}
          {item.proxima_dosis ? ` · Próxima: ${formatFechaCorta(item.proxima_dosis)}` : ''}
        </p>
      </div>
      {vencida && <Badge tone="critical">Vencida</Badge>}
    </Card>
  );
}

// El registro real (Constelación) se conecta en Fase 4/5 — el botón queda
// deshabilitado en este modo pre-consulta.
export default function TabVacunas({ mascotaId }) {
  const [vacunas, setVacunas] = useState([]);
  const [desparasitaciones, setDesparasitaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetchVacunas(mascotaId), fetchDesparasitaciones(mascotaId)]).then(([v, d]) => {
      if (!active) return;
      setVacunas(v);
      setDesparasitaciones(d);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [mascotaId]);

  if (loading) return null;

  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#0A1628]">Vacunas</p>
        <Button variant="outline" fullWidth={false} disabled title="Disponible durante la consulta">
          + Registrar vacuna
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {vacunas.length === 0 ? (
          <Card className="text-center text-[12px] text-[#5A6B7A]">
            Sin registros en MUVET. Puedes registrar durante la consulta.
          </Card>
        ) : (
          vacunas.map((v) => <ListaItem key={v.id} item={v} />)
        )}
      </div>

      <p className="text-[14px] font-semibold text-[#0A1628]">Desparasitaciones</p>
      <div className="flex flex-col gap-2">
        {desparasitaciones.length === 0 ? (
          <Card className="text-center text-[12px] text-[#5A6B7A]">
            Sin registros en MUVET. Puedes registrar durante la consulta.
          </Card>
        ) : (
          desparasitaciones.map((d) => <ListaItem key={d.id} item={d} />)
        )}
      </div>
    </div>
  );
}
