import { useState } from 'react';
import { Button, Input } from '../../components/ui';
import { signUpWithEmail } from '../../lib/auth';
import SsoButtons from './SsoButtons';

export default function SignupCredentialsForm({ onCredentialsCreated, onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmail(email, password);
      onCredentialsCreated();
    } catch (err) {
      setError(err.message ?? 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold text-[#0A1628]">Crear cuenta</h1>
        <p className="text-[12px] text-[#5A6B7A]">Paso 1 de 2 · Credenciales</p>
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
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        label="Confirmar contraseña"
        type="password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Creando cuenta…' : 'Continuar'}
      </Button>

      <div className="my-2 h-px w-full bg-[#E1E8ED]" />

      <SsoButtons />

      <p className="text-center text-[12px] text-[#5A6B7A]">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={onBackToLogin} className="text-[#1A7A5E] underline underline-offset-2">
          Inicia sesión
        </button>
      </p>
    </form>
  );
}
