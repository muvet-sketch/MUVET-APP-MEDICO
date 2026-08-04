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
