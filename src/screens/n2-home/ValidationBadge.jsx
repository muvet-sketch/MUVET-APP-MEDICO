import { Badge } from '../../components/ui';

export default function ValidationBadge({ estadoValidacion }) {
  if (estadoValidacion === 'validado') {
    return <Badge tone="ok">✅ Matrícula validada</Badge>;
  }
  if (estadoValidacion === 'rechazado') {
    return <Badge tone="critical">❌ Rechazada — contacta soporte</Badge>;
  }
  // 0025: posible suplantación. El médico queda restringido a perfil + soporte.
  if (estadoValidacion === 'en_disputa') {
    return <Badge tone="critical">⚠️ En verificación — contacta soporte</Badge>;
  }
  return <Badge tone="alert">⏳ Validación en curso (≤24h)</Badge>;
}
