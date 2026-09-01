import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getSession, onAuthStateChange } from '../lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPerfil = useCallback(async (userId) => {
    if (!userId) {
      setPerfil(null);
      return;
    }
    const { data } = await supabase.from('perfiles').select('*').eq('id', userId).maybeSingle();
    setPerfil(data ?? null);
  }, []);

  const refreshPerfil = useCallback(async () => {
    if (session?.user?.id) {
      await loadPerfil(session.user.id);
    }
  }, [session, loadPerfil]);

  useEffect(() => {
    let active = true;
    getSession()
      .then(async (s) => {
        if (!active) return;
        setSession(s);
        await loadPerfil(s?.user?.id);
      })
      .catch((err) => {
        // Si no se puede resolver la sesión (backend caído, red, token
        // corrupto en storage), se degrada explícitamente a "no autenticado":
        // ProtectedRoute manda a /login y la app sigue usable. Sin este catch
        // el rechazo quedaba sin manejar y el estado se quedaba a medias —
        // p. ej. una sesión ya asignada con el perfil sin cargar.
        if (!active) return;
        console.error('No se pudo recuperar la sesión:', err);
        setSession(null);
        setPerfil(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const subscription = onAuthStateChange(async (s) => {
      setSession(s);
      try {
        await loadPerfil(s?.user?.id);
      } catch (err) {
        // Mismo criterio que arriba: un fallo al traer el perfil no puede
        // dejar un rechazo suelto en un callback del que nadie hace await.
        console.error('No se pudo cargar el perfil:', err);
        setPerfil(null);
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadPerfil]);

  return (
    <AuthContext.Provider value={{ session, perfil, loading, refreshPerfil }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
