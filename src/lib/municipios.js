// Catálogo cerrado de municipios/zonas para "Zona de cobertura" (perfil de
// médico, auxiliar y clínica). Reemplaza el campo de texto libre: ahora el
// usuario elige de esta lista (multi-select) en vez de escribir cualquier
// texto, para que el matching de ofertas en Relevo (filtro por zona en
// TabOfertas) compare valores consistentes.
//
// SUPUESTO: el fundador no entregó un listado oficial de cobertura. Se arma
// con las 32 capitales de departamento + Bogotá D.C. (cobertura nacional
// mínima) y los municipios de área metropolitana de Bogotá y Medellín, que
// son las dos ciudades que ya aparecían mencionadas en el código existente
// (mocks de zonaAproximada del tutor y el placeholder de N-29). Confirmar con
// el fundador si hace falta ampliar a otras áreas metropolitanas (Cali,
// Barranquilla, Bucaramanga, Eje Cafetero, etc.) o restringir la cobertura.
export const ZONAS_COBERTURA = [
  'Bogotá D.C.',
  'Soacha',
  'Chía',
  'Cota',
  'Cajicá',
  'Zipaquirá',
  'Mosquera',
  'Madrid',
  'Funza',
  'Facatativá',
  'La Calera',
  'Sopó',
  'Medellín',
  'Envigado',
  'Itagüí',
  'Sabaneta',
  'Bello',
  'La Estrella',
  'Caldas',
  'Copacabana',
  'Girardota',
  'Rionegro',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Armenia',
  'Ibagué',
  'Cúcuta',
  'Santa Marta',
  'Villavicencio',
  'Neiva',
  'Pasto',
  'Montería',
  'Valledupar',
  'Popayán',
  'Sincelejo',
  'Tunja',
  'Riohacha',
  'Quibdó',
  'Florencia',
  'Yopal',
  'Arauca',
  'Mocoa',
  'San Andrés',
  'Leticia',
  'Inírida',
  'San José del Guaviare',
  'Mitú',
  'Puerto Carreño',
];

// Áreas metropolitanas: qué municipios cuentan como "cerca" entre sí.
//
// No hay GPS ni distancias (CLAUDE.md), así que la cercanía se modela con la
// única señal que sí existe: a qué conurbación pertenece cada municipio. Sin
// esto el filtro de ofertas era match exacto de nombre, y un médico en Envigado
// no veía una oferta en Bello aunque estén a quince minutos — mientras que
// abrirlo del todo le llenaría el tablón de ofertas al otro lado del país.
//
// SUPUESTO: se arranca con las dos áreas que el catálogo de arriba ya cubre
// (Valle de Aburrá y Bogotá + Sabana). El resto de capitales queda en match
// exacto de ciudad hasta que el fundador confirme ampliar — agregar un área
// nueva es agregar una entrada acá, nada más.
export const AREAS_METROPOLITANAS = {
  'Valle de Aburrá': [
    'Medellín',
    'Envigado',
    'Itagüí',
    'Sabaneta',
    'Bello',
    'La Estrella',
    'Caldas',
    'Copacabana',
    'Girardota',
  ],
  'Bogotá y Sabana': [
    'Bogotá D.C.',
    'Soacha',
    'Chía',
    'Cota',
    'Cajicá',
    'Zipaquirá',
    'Mosquera',
    'Madrid',
    'Funza',
    'Facatativá',
    'La Calera',
    'Sopó',
  ],
};

// Insensible a mayúsculas Y a acentos. Lo segundo importa: la "Zona de
// cobertura" fue campo de texto libre antes del catálogo cerrado (0015), y
// quedaron perfiles con valores escritos a mano tipo 'medellin'. Sin quitar los
// diacríticos, 'medellin' no casaba con 'Medellín' y ese perfil no veía NADA en
// los tres módulos gremiales — ni ofertas, ni relevos, ni auxiliares.
//
// NFD separa cada letra de su diacrítico y el rango U+0300–U+036F (los signos
// combinantes) los borra: 'Medellín' → 'medellin', 'Itagüí' → 'itagui'. Solo
// ensancha las coincidencias, nunca las quita.
function normalizar(valor) {
  return (valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// A qué área pertenece un municipio, o null si no está en ninguna.
export function areaDe(zona) {
  const buscada = normalizar(zona);
  if (!buscada) return null;
  const entrada = Object.entries(AREAS_METROPOLITANAS).find(([, municipios]) =>
    municipios.some((m) => normalizar(m) === buscada),
  );
  return entrada ? entrada[0] : null;
}

// El criterio de cercanía. Dos zonas están cerca si son la misma o si comparten
// área metropolitana. Fuera de las áreas definidas el comportamiento es el de
// siempre: solo coincide la misma ciudad.
export function mismaAreaOCiudad(a, b) {
  const za = normalizar(a);
  const zb = normalizar(b);
  if (!za || !zb) return false;
  if (za === zb) return true;
  const areaA = areaDe(a);
  return Boolean(areaA) && areaA === areaDe(b);
}

// ¿Esta publicación/solicitud le queda cerca a un perfil? Es el criterio de
// zona ÚNICO de los tres módulos gremiales — Turnos (lib/relevo.js), Relevo
// (lib/coberturaServicio.js) y Auxiliar (lib/apoyo.js) lo llaman todos desde
// acá. Vivía en lib/relevo.js, pero no es propio de aquel módulo y tenerlo ahí
// llevó a que los otros dos reimplementaran su propia versión con substring
// pelado, cada una con sus agujeros.
//
// Tres reglas, en orden:
//   1. Perfil sin zona configurada → no se filtra nada.
//   2. Publicación SIN zona declarada → visible. Si no se declaró zona no hay
//      nada que comparar, y excluirla la volvía invisible para todo perfil con
//      zona configurada: nadie podía verla nunca. (`zona` es opcional al menos
//      en MUVET Relevo, ver crearSolicitud.)
//   3. Coincide si comparten ciudad o área metropolitana (`mismaAreaOCiudad`),
//      con el substring como respaldo para las `zona` de texto libre anteriores
//      al catálogo cerrado (0015), que si no desaparecerían.
//
// SUPUESTO (heredado): se hace el split a mano en vez de usar parseZonas()
// justamente para no descartar esas zonas fuera del catálogo.
export function zonaCoincide(zonaPublicacion, zonasPerfil) {
  if (!zonasPerfil || zonasPerfil.length === 0) return true;
  const zonasDeLaOferta = (zonaPublicacion ?? '')
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);
  if (zonasDeLaOferta.length === 0) return true;

  return zonasPerfil.some((mia) =>
    zonasDeLaOferta.some(
      (suya) => mismaAreaOCiudad(mia, suya) || normalizar(suya).includes(normalizar(mia)),
    ),
  );
}

// El filtro que usan las tres bandejas y las tres vistas del Home: recibe la
// columna `zona_cobertura` del perfil (texto con zonas separadas por coma) y
// deja pasar lo que le queda cerca.
export function filtrarPorZonaCobertura(filas, zonaCobertura) {
  const zonas = (zonaCobertura ?? '')
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);
  if (zonas.length === 0) return filas;
  return filas.filter((f) => zonaCoincide(f.zona, zonas));
}

// Descarta valores que ya no estén en el catálogo (p. ej. si el fundador
// retira una entrada), mismo criterio que normalizarHabilidades en
// lib/habilidades.js.
export function normalizarZonas(valores) {
  return (valores ?? []).filter((v) => ZONAS_COBERTURA.includes(v));
}

// `zona_cobertura` sigue siendo una sola columna de texto en `perfiles`
// (SUPUESTO documentado en DatosProfesionalesSection desde la fase previa),
// así que las zonas elegidas se serializan separadas por coma.
export function parseZonas(zonaCobertura) {
  return normalizarZonas(
    (zonaCobertura ?? '')
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean),
  );
}

export function serializarZonas(zonas) {
  return (zonas ?? []).join(', ') || null;
}
