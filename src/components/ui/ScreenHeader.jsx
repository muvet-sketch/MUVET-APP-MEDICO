import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import NotificationBell from './NotificationBell';
import AppMenu from './AppMenu';

// `conCampana` va apagado por defecto a propósito. Este header también viste
// las pantallas del flujo clínico (N-15 SOAP, N-4 Constelación, N-12 Fórmula…),
// donde una campana que navega fuera a media consulta es un riesgo de perder
// trabajo en curso. Se enciende solo en las pantallas no clínicas, que es
// donde reemplaza al desaparecido tab "Alertas" de BottomNav.
//
// El menú hamburguesa (0028) viaja con la campana por la misma razón: ambos
// navegan FUERA de la pantalla actual, así que no deben aparecer a media
// consulta clínica.
export default function ScreenHeader({ title, fallbackTo = '/home', conCampana = false }) {
  const navigate = useNavigate();
  const { perfil } = useAuth();

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallbackTo);
    }
  }

  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#E1E8ED] bg-white px-5 py-4">
      <button
        type="button"
        onClick={handleBack}
        aria-label="Volver"
        className="text-[18px] text-[#0A1628]"
      >
        ←
      </button>
      <h1 className="flex-1 text-[16px] font-semibold text-[#0A1628]">{title}</h1>
      {conCampana && perfil?.id && (
        <div className="flex items-center gap-1">
          <NotificationBell perfilId={perfil.id} />
          <AppMenu />
        </div>
      )}
    </div>
  );
}
