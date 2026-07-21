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
      .finally(() => {
        if (active) setLoading(false);
      });

    const subscription = onAuthStateChange(async (s) => {
      setSession(s);
      await loadPerfil(s?.user?.id);
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
