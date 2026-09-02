import { supabase } from './supabase';

export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // El Site URL de Supabase Auth es global al proyecto y se compartirá con
    // la futura App Tutor (mismo backend). Cada frontend declara su propio
    // destino para que el enlace de confirmación vuelva siempre a la app
    // desde la que se registró el usuario — mismo patrón que
    // sendPasswordReset().
    options: { emailRedirectTo: `${window.location.origin}/login` },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// SSO con Google. El navegador se va a accounts.google.com y vuelve a
// `redirectTo` con la sesión en la URL; el cliente de supabase-js la detecta
// solo (`detectSessionInUrl` viene en true por defecto) y dispara
// onAuthStateChange, que es de donde AuthContext y N-1 ya se enteran de todo.
// Por eso esta función no devuelve sesión: después de la llamada la pestaña
// deja de ser nuestra.
//
// Vuelve a `/login` —no a `/home`— a propósito: N-1 es la pantalla que decide
// a dónde va cada quien. Si el usuario de Google ya tiene perfil, enruta por
// rol (routeForRol); si es su primera vez y todavía no hay fila en `perfiles`,
// cae en el paso 2 del registro (ActorProfileForm) para elegir rol y completar
// sus datos. Mismo destino que emailRedirectTo y que sendPasswordReset.
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/login` },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}

// D-547: enrutamiento post-login/registro según tipo de actor. Médico tiene
// flujo clínico completo (N-2); auxiliar y clínica comparten el home
// simplificado (N-28), sin acceso clínico (D-543/D-548).
export function routeForRol(rol) {
  return rol === 'medico' ? '/home' : '/home-simplificado';
}
