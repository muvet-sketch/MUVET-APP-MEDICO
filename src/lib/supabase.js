import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
