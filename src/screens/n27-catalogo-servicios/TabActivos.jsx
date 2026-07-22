import { Card, Badge, Button } from '../../components/ui';
import { MOCK_ACTIVOS_HOY, MOCK_ACTIVOS_ANTERIORES } from '../../mocks/mockData';

// MOCK — aún no hay servicios reales conectados aquí (N-3/N-4/N-21 se construyen en Fase 3).
function ActivoCard({ item }) {
  const enCurso = item.estado === 'en_curso';
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1">
          {enCurso ? <Badge tone="ok">🟢 EN CURSO</Badge> : <Badge tone="neutral">✅ Completado</Badge>}
        </div>
        <p className="truncate text-[14px] font-medium text-[#0A1628]">
          {item.mascota} ({item.especie})
        </p>
        <p className="truncate text-[12px] text-[#5A6B7A]">
          {item.tutor} · {item.fecha ? `${item.fecha} · ` : ''}
          {item.hora}
        </p>
      </div>
      <Button variant="outline" fullWidth={false} onClick={() => {} /* TODO Fase 4/6: navegación real */}>
        {enCurso ? 'Ir →' : 'Ver →'}
      </Button>
    </Card>
  );
}

export default function TabActivos() {
  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Hoy</p>
        <Badge tone="neutral">Datos de ejemplo</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {MOCK_ACTIVOS_HOY.length === 0 && (
          <Card className="text-center text-[12px] text-[#5A6B7A]">Sin servicios hoy.</Card>
        )}
        {MOCK_ACTIVOS_HOY.map((item) => (
          <ActivoCard key={item.id} item={item} />
        ))}
      </div>

      <p className="text-[14px] font-semibold text-[#0A1628]">Anteriores</p>
      <div className="flex flex-col gap-2">
        {MOCK_ACTIVOS_ANTERIORES.map((item) => (
          <ActivoCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
