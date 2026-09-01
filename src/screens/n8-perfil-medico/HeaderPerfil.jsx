import { Badge } from '../../components/ui';
import { getInitials } from '../../lib/format';
import { useSignedUrl } from '../../lib/storage';
import { colorAvatar } from '../../lib/avatarColor';

const ESTADO_BADGE = {
  validado: { tone: 'ok', label: '✅ Vigente' },
  pendiente: { tone: 'alert', label: '⏳ En validación' },
  rechazado: { tone: 'critical', label: '❌ Rechazada' },
  // 0025: posible suplantación (matrícula ajena o ya registrada en otra cuenta).
  en_disputa: { tone: 'critical', label: '⚠️ En verificación' },
};

export default function HeaderPerfil({ perfil }) {
  const estado = ESTADO_BADGE[perfil.estado_validacion] ?? ESTADO_BADGE.pendiente;
  const signedFotoUrl = useSignedUrl(perfil.foto_url);

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      {signedFotoUrl ? (
        <img
          src={signedFotoUrl}
          alt={perfil.nombre_completo ?? 'Foto de perfil'}
          className="h-20 w-20 rounded-full object-cover"
        />
      ) : (
        // Sin foto, el círculo de iniciales toma el color del rol + el id del
        // perfil, igual que el avatar de los módulos gremiales (lib/avatarColor.js).
        <div
          style={{ backgroundColor: colorAvatar(perfil.rol, perfil.id) }}
          className="flex h-20 w-20 items-center justify-center rounded-full text-[20px] font-semibold text-white"
        >
          {getInitials(perfil.nombre_completo) || '—'}
        </div>
      )}

      <h1 className="text-[18px] font-semibold text-[#0A1628]">{perfil.nombre_completo}</h1>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#5A6B7A]">Matrícula {perfil.matricula_comvezcol ?? '—'}</span>
        <Badge tone={estado.tone}>{estado.label}</Badge>
      </div>

      {perfil.especialidad && <p className="text-[12px] text-[#5A6B7A]">{perfil.especialidad}</p>}
      {perfil.zona_cobertura && <p className="text-[12px] text-[#5A6B7A]">{perfil.zona_cobertura}</p>}
    </div>
  );
}
