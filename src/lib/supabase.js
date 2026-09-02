import { createClient } from '@supabase/supabase-js';

// Las UIs de variables de entorno (Vercel entre ellas) aceptan que se pegue la
// línea ENTERA del .env dentro del campo "value", con el `NOMBRE=` incluido.
// Eso ya rompió producción una vez: el bundle desplegado en app.appmuvet.com
// llevaba como anon key el literal
//
//   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs…
//
// y el gateway de Supabase respondía 401 «Invalid API key» a cada login,
// mientras en local —que lee el .env de verdad, donde ese prefijo es la clave
// y no el valor— todo funcionaba. Un fallo que solo aparece desplegado y con
// un mensaje que apunta a la key equivocada.
//
// Se normaliza acá, en el único punto donde las variables entran a la app: se
// quitan espacios, comillas envolventes y el prefijo `NOMBRE=` si viene pegado.
// No es silencioso — cada corrección se avisa por consola, porque el valor mal
// cargado en el panel de despliegue hay que arreglarlo igual.
function leerVariable(nombre, valorCrudo) {
  if (typeof valorCrudo !== 'string') return '';

  let valor = valorCrudo.trim();

  // Dos pasadas: cubre tanto `"VITE_X=eyJ…"` como `VITE_X="eyJ…"`.
  for (let i = 0; i < 2; i += 1) {
    if (valor.length >= 2 && (valor[0] === '"' || valor[0] === "'") && valor.at(-1) === valor[0]) {
      valor = valor.slice(1, -1).trim();
      console.warn(`${nombre}: se ignoraron las comillas envolventes del valor.`);
    }
    if (valor.startsWith(`${nombre}=`)) {
      valor = valor.slice(nombre.length + 1).trim();
      console.warn(
        `${nombre}: el valor traía el prefijo "${nombre}=" pegado adelante y se descartó. ` +
          'Corrige la variable en el entorno de despliegue: el campo "value" lleva SOLO el ' +
          'valor, no la línea completa del .env.',
      );
    }
  }

  return valor;
}

const supabaseUrl = leerVariable('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = leerVariable('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY);

// Las VITE_* se inlinean en tiempo de build: si el entorno de despliegue no las
// tiene cargadas, el bundle de producción queda con `undefined` acá. Antes eso
// producía una pantalla en blanco muda, porque createClient('') lanza
// `supabaseUrl is required.` de forma SÍNCRONA al importar este módulo, y ese
// throw se lleva por delante todo el árbol de imports antes de que React
// monte nada.
//
// Ahora el módulo siempre se importa sin romper y quien decide qué mostrar es
// la capa de UI (ver main.jsx), que renderiza una pantalla explicando la
// configuración faltante en vez de dejar el documento vacío.
export const supabaseConfigurado = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigurado) {
  console.error(
    'Supabase no está configurado: faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'En local se definen en el archivo .env (ver .env.example); en el despliegue, ' +
      'en las variables de entorno del proyecto en Vercel (y hay que reconstruir, ' +
      'porque estas variables se inlinean en el build).',
  );
}

// Placeholder inerte cuando falta configuración: mantiene estable la forma del
// módulo (todo el código que importa `supabase` sigue funcionando a nivel de
// import) sin apuntar a ningún host real. La app no se monta en ese estado, así
// que este cliente nunca llega a usarse.
export const supabase = createClient(
  supabaseUrl || 'https://configuracion-faltante.invalid',
  supabaseAnonKey || 'configuracion-faltante',
);
