import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { signOut } from '../../lib/auth';
import { ICONO_ESPECIALISTAS, NOMBRE_ESPECIALISTAS } from '../../lib/nombresModulos';

// Menú hamburguesa del header (0028). Nace porque la barra inferior se quedó
// sin espacio: "MUVET Auxiliar" ocupa el cuarto lugar y "Perfil" se mudó acá,
// junto con el enlace "Salir" que antes vivía suelto en el header de las dos
// Home. Es el único lugar de la app donde se cierra sesión.
//
// Cada rol tiene su propia ruta de perfil (D-543: auxiliar y clínica no tienen
// pantalla de perfil dedicada — el auxiliar reabre el panel inline de N-28 vía
// ?perfil=1, la clínica sí tiene N-29).
const RUTA_PERFIL = {
  medico: '/perfil',
  clinica: '/perfil-clinica',
  auxiliar: '/home-simplificado?perfil=1',
};

export default function AppMenu() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  // Cerrar al tocar fuera y con Escape: es un menú overlay en móvil y quedarse
  // abierto tapando contenido es peor que no tenerlo.
  useEffect(() => {
    if (!abierto) return undefined;

    function alTocarFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    function alPresionar(e) {
      if (e.key === 'Escape') setAbierto(false);
    }

    document.addEventListener('mousedown', alTocarFuera);
    document.addEventListener('keydown', alPresionar);
    return () => {
      document.removeEventListener('mousedown', alTocarFuera);
      document.removeEventListener('keydown', alPresionar);
    };
  }, [abierto]);

  if (!perfil) return null;

  const rutaPerfil = RUTA_PERFIL[perfil.rol] ?? '/home';
  // MUVET Especialistas quedó restringido a médico y clínica (decisión del
  // fundador): el auxiliar ya no ve ni el acceso ni la ruta.
  const verEspecialistas = perfil.rol === 'medico' || perfil.rol === 'clinica';

  function irAlPerfil() {
    setAbierto(false);
    navigate(rutaPerfil);
  }

  function irAMensajes() {
    setAbierto(false);
    navigate('/mensajes');
  }

  function irAEspecialistas() {
    setAbierto(false);
    navigate('/especialistas');
  }

  function irAlHistorial() {
    setAbierto(false);
    navigate('/historial');
  }

  function irAMejoras() {
    setAbierto(false);
    navigate('/mejoras');
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Menú"
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[18px] text-[#0A1628] active:bg-[#F4F7F9]"
      >
        ☰
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-[12px] border border-[#E1E8ED] bg-white shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={irAlPerfil}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-[#0A1628] active:bg-[#F4F7F9]"
          >
            <span aria-hidden="true">👤</span> Mi perfil
          </button>
          {/* N-35 (0039): MUVET Especialistas es el CUARTO módulo gremial y la
              barra inferior del médico ya está llena con los otros tres, así
              que este es su único acceso — igual que Mensajes. Solo médico y
              clínica buscan especialistas en el directorio; el auxiliar ya no
              entra (decisión del fundador). Qué ve cada rol admitido lo deciden
              las pestañas de N-35 y la RLS de 0039, no este menú. */}
          {verEspecialistas && (
            <>
              <div className="h-px bg-[#E1E8ED]" />
              <button
                type="button"
                role="menuitem"
                onClick={irAEspecialistas}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-[#0A1628] active:bg-[#F4F7F9]"
              >
                <span aria-hidden="true">{ICONO_ESPECIALISTAS}</span> {NOMBRE_ESPECIALISTAS}
              </button>
            </>
          )}
          <div className="h-px bg-[#E1E8ED]" />
          {/* N-34: para el médico este es el ÚNICO acceso a Mensajes — su barra
              inferior está llena con los tres módulos gremiales. El auxiliar y
              la clínica además lo tienen como pestaña. */}
          <button
            type="button"
            role="menuitem"
            onClick={irAMensajes}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-[#0A1628] active:bg-[#F4F7F9]"
          >
            <span aria-hidden="true">💬</span> Mensajes
          </button>
          <div className="h-px bg-[#E1E8ED]" />
          {/* Historial sigue acá para los TRES roles: N-34 le quitó la pestaña
              a auxiliar y clínica, así que este pasó a ser su único acceso —
              como ya lo era para el médico. */}
          <button
            type="button"
            role="menuitem"
            onClick={irAlHistorial}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-[#0A1628] active:bg-[#F4F7F9]"
          >
            <span aria-hidden="true">📋</span> Historial
          </button>
          <div className="h-px bg-[#E1E8ED]" />
          {/* N-33 (0036): abierta a los 3 roles, sin condición — cualquiera
              tiene algo que decir del producto. */}
          <button
            type="button"
            role="menuitem"
            onClick={irAMejoras}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-[#0A1628] active:bg-[#F4F7F9]"
          >
            <span aria-hidden="true">💡</span> Ayúdanos a Mejorar
          </button>
          <div className="h-px bg-[#E1E8ED]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              signOut();
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-[#C63B3B] active:bg-[#F4F7F9]"
          >
            <span aria-hidden="true">↪</span> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
