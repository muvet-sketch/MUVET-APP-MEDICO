import { useState } from 'react';
import { Button, Input } from '../../components/ui';
import { signInWithEmail } from '../../lib/auth';
import SsoButtons from './SsoButtons';

export default function LoginForm({ onGoToSignup, onGoToForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      // La navegación post-login la resuelve el contenedor N1 al detectar el cambio de sesión.
    } catch (err) {
      setError(err.message ?? 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold text-[#0A1628]">Iniciar sesión</h1>
        <p className="text-[12px] text-[#5A6B7A]">Accede con tu correo y contraseña</p>
      </div>

      <Input
        label="Correo electrónico"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        label="Contraseña"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Ingresando…' : 'Ingresar'}
      </Button>

      <button
        type="button"
        onClick={onGoToForgotPassword}
        className="text-[12px] text-[#1A7A5E] underline underline-offset-2"
      >
        Olvidé mi contraseña
      </button>

      <div className="my-2 h-px w-full bg-[#E1E8ED]" />

      <SsoButtons />

      <p className="text-center text-[12px] text-[#5A6B7A]">
        ¿No tienes cuenta?{' '}
        <button type="button" onClick={onGoToSignup} className="text-[#1A7A5E] underline underline-offset-2">
          Regístrate
        </button>
      </p>
    </form>
  );
}
