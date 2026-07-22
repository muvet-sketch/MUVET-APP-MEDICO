import { useAuth } from '../../app/AuthContext';
import { signOut } from '../../lib/auth';
import { Card, Button } from '../../components/ui';

// SUPUESTO: `perfiles` no registra una fecha de aceptación de términos explícita.
// Se muestra la fecha de creación de la cuenta como aproximación.
// TODO Fase posterior: validar con el fundador si N-1 debe capturar y persistir
// la aceptación de términos por separado.
export default function LegalSection() {
  const { perfil } = useAuth();

  const fechaAceptacion = perfil?.created_at
    ? new Date(perfil.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">Legal</p>

      <p className="text-[12px] text-[#5A6B7A]">Cuenta creada el {fechaAceptacion}</p>

      <button
        type="button"
        onClick={(e) => e.preventDefault()}
        className="text-left text-[12px] text-[#1A7A5E] underline underline-offset-2"
      >
        Política de privacidad
      </button>

      <Button variant="outline" onClick={signOut}>
        Cerrar sesión
      </Button>
    </Card>
  );
}
