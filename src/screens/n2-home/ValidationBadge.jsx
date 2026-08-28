import { Badge } from '../../components/ui';

export default function ValidationBadge({ estadoValidacion }) {
  // Una vez validada, el recuadro deja de tener sentido: al refrescar el Home
  // con estado_validacion === 'validado' no se muestra nada.
  if (estadoValidacion === 'validado') {
    return null;
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
