import { useAuth } from '../../app/AuthContext';
import { ScreenHeader } from '../../components/ui';
import HeaderPerfil from './HeaderPerfil';
import PlanCard from './PlanCard';
import LogoFirmaSection from './LogoFirmaSection';
import DatosProfesionalesSection from './DatosProfesionalesSection';
import MatriculaSection from './MatriculaSection';
import CalificacionSection from './CalificacionSection';
import NotificacionesSection from './NotificacionesSection';
import LegalSection from './LegalSection';

export default function N8PerfilMedico() {
  const { perfil } = useAuth();

  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Mi Perfil" />

      <div className="flex flex-col gap-5 px-5 pb-8">
        <HeaderPerfil perfil={perfil} />
        <PlanCard />
        <LogoFirmaSection />
        <DatosProfesionalesSection />
        <MatriculaSection />
        <CalificacionSection />
        <NotificacionesSection />
        <LegalSection />
      </div>
    </div>
  );
}
