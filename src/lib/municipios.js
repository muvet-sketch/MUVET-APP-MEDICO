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

function normalizar(valor) {
  return (valor ?? '').trim().toLowerCase();
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
