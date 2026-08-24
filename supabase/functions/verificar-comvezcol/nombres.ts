// Comparación de nombres entre lo que el médico registró en la app y lo que
// devuelve el registro público del Consejo.
//
// Vive en su propio módulo, sin imports, a propósito: es la única defensa que
// separa "el médico escribió SU matrícula" de "el médico escribió la matrícula
// de un tercero", así que conviene poder ejecutarlo y probarlo aislado
// (ver nombres.test.ts).

// Normaliza para comparar: minúsculas, sin tildes, sin puntuación.
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Descarta partículas y tratamientos ("de", "la", "dr") quedándose con tokens
// de 3+ letras.
export function tokens(texto: string): string[] {
  return normalizar(texto).split(' ').filter((t) => t.length >= 3);
}

// ¿El nombre que el médico registró en la app concuerda con el del registro
// público?
//
// Se compara en la dirección "todo lo que el médico escribió aparece en el
// registro", no al revés: es normal que alguien se registre como "David
// Mendoza" cuando el Consejo lo tiene como "DAVID ORLANDO MENDOZA PERILLA".
// La dirección inversa rechazaría ese caso legítimo.
//
// Se exigen al menos 2 tokens coincidentes para que un nombre de una sola
// palabra no valide contra cualquier homónimo parcial.
export function nombreConcuerda(nombreApp: string, nombreRegistro: string): boolean {
  const app = tokens(nombreApp);
  const registro = new Set(tokens(nombreRegistro));
  if (app.length === 0 || registro.size === 0) return false;

  const coincidencias = app.filter((t) => registro.has(t));
  return coincidencias.length === app.length && coincidencias.length >= 2;
}
