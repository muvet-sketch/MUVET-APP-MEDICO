import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { routeForRol } from '../../lib/auth';
import Splash from './Splash';
import LoginForm from './LoginForm';
import SignupCredentialsForm from './SignupCredentialsForm';
import ActorProfileForm from './ActorProfileForm';
import ForgotPasswordForm from './ForgotPasswordForm';

const SPLASH_DURATION_MS = 900;

export default function N1Login() {
  const navigate = useNavigate();
  const { session, perfil, loading, refreshPerfil } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [step, setStep] = useState('login');

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading || showSplash) return;

    if (session && perfil) {
      navigate(routeForRol(perfil.rol), { replace: true });
      return;
    }
    if (session && !perfil) {
      setStep('signup-profile');
    }
  }, [loading, showSplash, session, perfil, navigate]);

  if (showSplash || loading) {
    return <Splash />;
  }

  async function handleProfileCreated(rol) {
    await refreshPerfil();
    navigate(routeForRol(rol), { replace: true });
  }

  return (
    <div className="flex min-h-svh w-full flex-col justify-center px-6 py-10">
      {step === 'login' && (
        <LoginForm
          onGoToSignup={() => setStep('signup-credentials')}
          onGoToForgotPassword={() => setStep('forgot-password')}
        />
      )}
      {step === 'signup-credentials' && (
        <SignupCredentialsForm
          onCredentialsCreated={() => setStep('signup-profile')}
          onBackToLogin={() => setStep('login')}
        />
      )}
      {/* Paso 2 del registro. Se llega por dos caminos: el registro por correo
          (SignupCredentialsForm) y el SSO de Google, que crea el usuario de Auth
          pero no la fila de `perfiles`. En el segundo, Google ya nos dio el
          nombre en user_metadata y se precarga para que solo haya que
          confirmarlo. */}
      {step === 'signup-profile' && session && (
        <ActorProfileForm
          userId={session.user.id}
          nombreSugerido={session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? ''}
          onProfileCreated={handleProfileCreated}
        />
      )}
      {step === 'signup-profile' && !session && (
        // SUPUESTO: si la confirmación de correo está activa en Supabase Auth, no hay sesión
        // inmediatamente después del registro. Se pide confirmar el correo y luego iniciar sesión.
        <div className="flex w-full flex-col gap-4 text-center">
          <h1 className="text-[20px] font-semibold text-[#0A1628]">Confirma tu correo</h1>
          <p className="text-[14px] text-[#5A6B7A]">
            Te enviamos un enlace de confirmación. Ábrelo y luego vuelve para iniciar sesión y completar tu perfil.
          </p>
          <button
            type="button"
            onClick={() => setStep('login')}
            className="text-[12px] text-[#1A7A5E] underline underline-offset-2"
          >
            Volver a iniciar sesión
          </button>
        </div>
      )}
      {step === 'forgot-password' && <ForgotPasswordForm onBackToLogin={() => setStep('login')} />}
    </div>
  );
}
