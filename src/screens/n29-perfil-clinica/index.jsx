// N-29 · Perfil Clínica (Fase 7). D-544: datos básicos editables + logo
// opcional. D-543: sin acceso a flujo clínico — solo Relevo + este perfil.
import { useAuth } from '../../app/AuthContext';
import { ScreenHeader, BottomNav } from '../../components/ui';
import HeaderPerfilClinica from './HeaderPerfilClinica';
import DatosClinicaSection from './DatosClinicaSection';
import MisPublicacionesSection from './MisPublicacionesSection';

export default function N29PerfilClinica() {
  const { perfil } = useAuth();
  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Mi Clínica" fallbackTo="/home-simplificado" />
      <div className="flex flex-col gap-5 px-5 pb-24">
        <HeaderPerfilClinica perfil={perfil} />
        <DatosClinicaSection />
        <MisPublicacionesSection perfil={perfil} />
      </div>
      <BottomNav />
    </div>
  );
}
