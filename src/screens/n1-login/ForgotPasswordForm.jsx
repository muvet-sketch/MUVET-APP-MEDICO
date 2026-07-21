import { useState } from 'react';
import { Button, Input } from '../../components/ui';
import { sendPasswordReset } from '../../lib/auth';

export default function ForgotPasswordForm({ onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message ?? 'No se pudo enviar el correo de recuperación.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex w-full flex-col gap-4 text-center">
        <h1 className="text-[20px] font-semibold text-[#0A1628]">Revisa tu correo</h1>
        <p className="text-[14px] text-[#5A6B7A]">
          Enviamos un enlace de recuperación a <strong>{email}</strong>.
        </p>
        <Button variant="outline" onClick={onBackToLogin}>
          Volver a iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold text-[#0A1628]">Recuperar contraseña</h1>
        <p className="text-[12px] text-[#5A6B7A]">Te enviaremos un enlace a tu correo</p>
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

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Enviando…' : 'Enviar enlace'}
      </Button>

      <button type="button" onClick={onBackToLogin} className="text-[12px] text-[#1A7A5E] underline underline-offset-2">
        Volver a iniciar sesión
      </button>
    </form>
  );
}
