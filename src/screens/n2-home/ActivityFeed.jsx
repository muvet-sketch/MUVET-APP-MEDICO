import { Card, Badge } from '../../components/ui';
import { MOCK_ACTIVIDAD_RECIENTE } from '../../mocks/mockData';

export default function ActivityFeed() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">Actividad reciente</p>
        <Badge tone="neutral">Datos de ejemplo</Badge>
      </div>
      {MOCK_ACTIVIDAD_RECIENTE.map((item) => (
        <Card key={item.id} className="flex flex-col gap-0.5">
          <p className="text-[14px] font-medium text-[#0A1628]">{item.titulo}</p>
          <p className="text-[12px] text-[#5A6B7A]">{item.descripcion}</p>
        </Card>
      ))}
    </div>
  );
}
