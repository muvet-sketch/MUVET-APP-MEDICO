// N-28 · Perfil Auxiliar. Pantalla de perfil dedicada, con ruta propia
// (/perfil-auxiliar), igual que médico (N-8) y clínica (N-29). Antes esto era
// un panel inline al final de la Home (N-28) reabierto vía ?perfil=1; se movió
// a pantalla propia por pedido del fundador.
//
// D-543: sin ningún rastro de flujo clínico. Solo datos básicos + las
// secciones que el auxiliar comparte con el médico: habilidades y métodos de
// pago (la clínica no lleva ninguna de las dos).
import { useAuth } from '../../app/AuthContext';
import { ScreenHeader, BottomNav } from '../../components/ui';
import DatosAuxiliarSection from './DatosAuxiliarSection';
import HabilidadesPerfilSection from '../../components/HabilidadesPerfilSection';
import MetodosPagoSection from '../../components/MetodosPagoSection';

export default function N28PerfilAuxiliar() {
  const { perfil } = useAuth();
  if (!perfil) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Mi perfil" fallbackTo="/home-simplificado" conCampana />
      <div className="flex flex-col gap-5 px-5 py-6 pb-24">
        <DatosAuxiliarSection />
        {/* El auxiliar configura sus habilidades aquí; la clínica no las tiene
            en perfil (las declara por oferta, ver 0015). */}
        <HabilidadesPerfilSection />
        {/* Datos de pago del auxiliar (0029). */}
        <MetodosPagoSection />
      </div>
      <BottomNav />
    </div>
  );
}
