import { getInitials } from '../../lib/format';
import { useSignedUrl } from '../../lib/storage';
import { colorAvatar } from '../../lib/avatarColor';

// Avatar circular con imagen (logo de clínica o foto de perfil) e iniciales
// como fallback. Consolida el patrón repetido en HeaderPerfil (N-8),
// HeaderPerfilClinica (N-29) y DatosProfesionalesSection.
//
// `fotoUrl` es un path de storage (bucket privado `documents`) o una URL http
// ya resuelta — useSignedUrl (lib/storage.js) maneja ambos casos y devuelve
// null mientras firma o si falla, así que sin imagen se muestran las iniciales.
//
// Se usa en los módulos gremiales para mostrar el logo de la clínica junto a su
// nombre. `perfiles_publico` (migración 0035) solo expone `foto_url` para
// perfiles de rol 'clinica'; para médicos y auxiliares llega null y el avatar
// cae a iniciales, que es el comportamiento buscado.
//
// `rol` + `semilla` deciden el color de ese círculo de iniciales (ver
// lib/avatarColor.js): el rol elige la familia de color y la semilla —el id del
// perfil— el tono dentro de la familia. Sin `rol` se conserva el azul marino de
// siempre, así que quien no los pase no cambia de aspecto.
export default function Avatar({ fotoUrl, nombre, rol, semilla, size = 32, className = '' }) {
  const signedUrl = useSignedUrl(fotoUrl);
  const dimension = { width: size, height: size };
  const initials = getInitials(nombre) || '—';

  if (signedUrl) {
    return (
      <img
        src={signedUrl}
        alt={nombre || 'Avatar'}
        style={dimension}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={{ ...dimension, backgroundColor: colorAvatar(rol, semilla ?? nombre) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      aria-hidden="true"
    >
      <span style={{ fontSize: Math.round(size * 0.4) }}>{initials}</span>
    </div>
  );
}
