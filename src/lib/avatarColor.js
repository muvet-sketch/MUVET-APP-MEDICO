// Color del círculo de iniciales (fallback del componente Avatar).
//
// Contexto: `perfiles_publico` (0035) solo expone `foto_url` para perfiles de
// rol 'clinica'; médicos y auxiliares nunca tienen imagen en los módulos
// gremiales y su avatar SIEMPRE cae a iniciales. Con un único azul marino para
// todos, una lista de tres médicos se veía como tres círculos idénticos.
//
// El color se decide en dos niveles:
//   1. El ROL elige la familia — esmeralda para médico, cian frío para
//      auxiliar. Se lee de un vistazo con quién se está hablando.
//   2. Dentro de la familia, la SEMILLA (el id del perfil, o el nombre si no
//      hay id) elige un tono estable. La misma persona siempre sale del mismo
//      color, y dos médicos distintos rara vez coinciden.
//
// La clínica conserva el azul marino primario: cuando tiene logo se pinta el
// logo, y sin logo el navy la distingue de las otras dos familias.
//
// Todos los tonos están verificados contra texto blanco: contraste ≥ 5.2:1
// (WCAG AA para texto normal pide 4.5:1).

export const COLOR_AVATAR_BASE = '#0A1628'; // azul marino primario (tokens.css)

const FAMILIAS = {
  // Verdes → teal, alrededor del esmeralda clínico #1A7A5E de tokens.css.
  medico: ['#1C782E', '#1C7847', '#1A7A5E', '#1C7872'],
  // Cianes fríos → azul, sin invadir el verde del médico ni el navy de clínica.
  auxiliar: ['#217283', '#216483', '#215583', '#214583'],
};

// djb2. No necesita ser criptográfico: solo repartir de forma estable y sin
// depender del orden en que llegan los perfiles.
function hashEstable(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i += 1) {
    h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function colorAvatar(rol, semilla) {
  const familia = FAMILIAS[rol];
  if (!familia) return COLOR_AVATAR_BASE; // clínica, rol desconocido o ausente
  const clave = String(semilla ?? '').trim();
  if (!clave) return familia[0];
  return familia[hashEstable(clave) % familia.length];
}
