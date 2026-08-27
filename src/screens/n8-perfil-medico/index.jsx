import { useAuth } from '../../app/AuthContext';
import { ScreenHeader, BottomNav } from '../../components/ui';
import HeaderPerfil from './HeaderPerfil';
import DatosProfesionalesSection from './DatosProfesionalesSection';
import HabilidadesPerfilSection from '../../components/HabilidadesPerfilSection';
import MetodosPagoSection from '../../components/MetodosPagoSection';
import MatriculaSection from './MatriculaSection';
import CalificacionSection from './CalificacionSection';
import NotificacionesSection from './NotificacionesSection';
import LegalSection from './LegalSection';

export default function N8PerfilMedico() {
  const { perfil } = useAuth();

  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Mi Perfil" conCampana />

      <div className="flex flex-col gap-5 px-5 pb-24">
        <HeaderPerfil perfil={perfil} />
        {/* SUPUESTO: Plan activo y Logo/firma (D-552) ocultos por decisión de
            producto para el lanzamiento inicial enfocado en Relevo. No se
            elimina el código: PlanCard.jsx y LogoFirmaSection.jsx quedan
            intactos para reactivarse en la iteración de domicilios. */}
        <DatosProfesionalesSection />
        <MetodosPagoSection />
        <HabilidadesPerfilSection />
        <MatriculaSection />
        <CalificacionSection />
        <NotificacionesSection />
        <LegalSection />
      </div>
      <BottomNav />
    </div>
  );
}
