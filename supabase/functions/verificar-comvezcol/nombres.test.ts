// Pruebas del matcher de nombres. Sin framework ni dependencias: se ejecuta
// con el type-stripping nativo de Node (>=22.6) o con Deno.
//
//   node --experimental-strip-types supabase/functions/verificar-comvezcol/nombres.test.ts
//   deno run supabase/functions/verificar-comvezcol/nombres.test.ts
//
// Los nombres de registro usados acá son reales, tomados del registro público
// del Consejo al verificar el formato de respuesta durante el desarrollo.

import { nombreConcuerda, normalizar, tokens } from './nombres.ts';

const casos: Array<{ app: string; registro: string; esperado: boolean; porque: string }> = [
  // --- Debe validar: el médico es quien dice ser ---
  {
    app: 'David Orlando Mendoza Perilla',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: true,
    porque: 'nombre completo idéntico salvo mayúsculas',
  },
  {
    app: 'David Mendoza',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: true,
    porque: 'el médico omite segundo nombre y segundo apellido (caso común)',
  },
  {
    app: 'david orlando mendoza',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: true,
    porque: 'sin mayúsculas ni segundo apellido',
  },
  {
    app: 'Dr. David Mendoza',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: true,
    porque: 'el tratamiento "Dr." se descarta por tener menos de 3 letras',
  },
  {
    app: 'José Gabriel Hernández Parra',
    registro: 'JOSE GABRIEL HERNANDEZ PARRA',
    esperado: true,
    porque: 'el registro no usa tildes y la app sí',
  },
  {
    app: 'Rosa  Leonor   Fonseca',
    registro: 'ROSA LEONOR FONSECA GUZMAN',
    esperado: true,
    porque: 'espacios repetidos se normalizan',
  },

  // --- NO debe validar: sería suplantación o dato insuficiente ---
  {
    app: 'Carlos Ramírez Antorveza',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: false,
    porque: 'persona completamente distinta: usó la matrícula de un tercero',
  },
  {
    app: 'David Orlando Mendoza Gutiérrez',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: false,
    porque: 'coincide casi todo pero el segundo apellido no: no es la misma persona',
  },
  {
    app: 'David',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: false,
    porque: 'un solo token: insuficiente, exigimos al menos 2 coincidencias',
  },
  {
    app: '',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: false,
    porque: 'nombre vacío en la app',
  },
  {
    app: 'David Mendoza',
    registro: '',
    esperado: false,
    porque: 'el registro no devolvió nombre',
  },
  {
    app: 'Mendoza Perilla David Orlando',
    registro: 'DAVID ORLANDO MENDOZA PERILLA',
    esperado: true,
    porque: 'orden distinto: se comparan tokens, no la cadena completa',
  },
];

let fallos = 0;
for (const c of casos) {
  const real = nombreConcuerda(c.app, c.registro);
  const ok = real === c.esperado;
  if (!ok) fallos++;
  console.log(
    `${ok ? 'PASA' : 'FALLA'}  "${c.app}" vs "${c.registro}" → ${real} (esperado ${c.esperado}) — ${c.porque}`,
  );
}

// Normalización
const normEsperada = 'jose gabriel hernandez parra';
const normReal = normalizar('José  Gabriel, HERNÁNDEZ-Parra.');
if (normReal !== normEsperada) {
  fallos++;
  console.log(`FALLA  normalizar → "${normReal}" (esperado "${normEsperada}")`);
} else {
  console.log(`PASA  normalizar → "${normReal}"`);
}

const tokEsperados = 'david,orlando,mendoza,perilla';
const tokReales = tokens('Dr. David Orlando de Mendoza y Perilla').join(',');
if (tokReales !== tokEsperados) {
  fallos++;
  console.log(`FALLA  tokens → "${tokReales}" (esperado "${tokEsperados}")`);
} else {
  console.log(`PASA  tokens → "${tokReales}"`);
}

console.log(fallos === 0 ? '\nTodas las pruebas pasaron.' : `\n${fallos} prueba(s) fallaron.`);
if (fallos > 0) throw new Error(`${fallos} prueba(s) fallaron`);
