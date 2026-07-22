import { Badge } from '../../components/ui';
import { getInitials } from '../../lib/format';
import { useSignedUrl } from '../../lib/storage';

export default function HeaderPerfilClinica({ perfil }) {
  const signedLogoUrl = useSignedUrl(perfil.foto_url);

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      {signedLogoUrl ? (
        <img
          src={signedLogoUrl}
          alt={perfil.razon_social ?? 'Logo de la clínica'}
          className="h-20 w-20 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0A1628] text-[20px] font-semibold text-white">
          {getInitials(perfil.razon_social) || '—'}
        </div>
      )}

      <h1 className="text-[18px] font-semibold text-[#0A1628]">{perfil.razon_social || 'Clínica sin nombre'}</h1>
      <Badge tone="info">🏥 Clínica Veterinaria</Badge>
      {perfil.direccion_sede && <p className="text-[12px] text-[#5A6B7A]">{perfil.direccion_sede}</p>}
    </div>
  );
}
