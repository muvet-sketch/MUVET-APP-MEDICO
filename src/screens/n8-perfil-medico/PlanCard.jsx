import { Card } from '../../components/ui';

export default function PlanCard() {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[#5A6B7A]">Plan activo</p>
      <p className="text-[16px] font-semibold text-[#0A1628]">PLAN GARRA · Gratuito</p>
      <p className="text-[12px] text-[#5A6B7A]">Disponible desde el MVP · Un solo plan disponible</p>
    </Card>
  );
}
