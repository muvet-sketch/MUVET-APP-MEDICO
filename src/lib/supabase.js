import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // SUPUESTO: en desarrollo sin .env configurado, se avisa en consola en vez de romper el build.
  console.warn(
    'Supabase no está configurado: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env (ver .env.example).',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
