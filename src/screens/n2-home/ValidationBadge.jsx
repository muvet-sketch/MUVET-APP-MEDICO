import { Badge } from '../../components/ui';

export default function ValidationBadge({ estadoValidacion }) {
  if (estadoValidacion === 'validado') {
    return <Badge tone="ok">✅ Matrícula validada</Badge>;
  }
  if (estadoValidacion === 'rechazado') {
    return <Badge tone="critical">❌ Rechazada — contacta soporte</Badge>;
  }
  return <Badge tone="alert">⏳ Validación en curso (≤24h)</Badge>;
}
