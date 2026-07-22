import { Badge } from '../../components/ui';
import { calcularEdad, getInitials } from '../../lib/format';

// -- SUPUESTO: `mascotas` no tiene columna foto_url en el schema actual
// (0001/0005). Se usa placeholder de iniciales, igual al patrón ya usado
// para el médico sin logo/firma (D-552) en N-8.
export default function HeaderExpediente({ mascota, alergiasCount }) {
  const edad = calcularEdad(mascota.fecha_nacimiento);

  return (
    <div className="flex items-center gap-3 border-b border-[#E1E8ED] px-5 py-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0A1628] text-[14px] font-semibold text-white">
        {getInitials(mascota.nombre) || '🐾'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-[#0A1628]">{mascota.nombre || 'Sin nombre'}</p>
        <p className="truncate text-[12px] text-[#5A6B7A]">
          {mascota.raza || 'Raza no especificada'}
          {edad ? ` · ${edad}` : ''}
        </p>
      </div>
      {alergiasCount > 0 && (
        <Badge tone="critical">
          ⚠️ {alergiasCount} {alergiasCount === 1 ? 'alergia' : 'alergias'}
        </Badge>
      )}
    </div>
  );
}
