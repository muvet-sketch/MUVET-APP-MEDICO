import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui';
import { ICONO_TURNOS, NOMBRE_TURNOS } from '../../lib/nombresModulos';

// Solo lo que no está ya en la barra inferior ni tiene sección propia en el
// Home: Perfil y MUVET Relevo (ex Cobertura) viven en la barra, e Historial
// tiene su propia vista previa más abajo.
const LINKS = [
  { to: '/servicios', label: '🏠 Domicilios' },
  { to: '/relevo', label: `${ICONO_TURNOS} ${NOMBRE_TURNOS}` },
];

// D-549: acceso rápido visible solo si el médico tiene disponibilidad activa o
// un servicio en curso — lleva a MUVET Turnos con filtro pre-aplicado a
// auxiliares con disponibilidad publicada.
const BUSCAR_AUXILIAR_LINK = { to: '/relevo?tipo=ofrezco&rol=auxiliar', label: '🧰 Buscar auxiliar' };

export default function QuickAccess({ disponible, servicioActivo }) {
  const navigate = useNavigate();
  const links = disponible || servicioActivo ? [...LINKS, BUSCAR_AUXILIAR_LINK] : LINKS;
  return (
    <div className="grid grid-cols-2 gap-2">
      {links.map((link) => (
        <Card key={link.to} className="cursor-pointer p-3 text-center" >
          <button
            type="button"
            onClick={() => navigate(link.to)}
            className="w-full text-[12px] font-medium text-[#0A1628]"
          >
            {link.label}
          </button>
        </Card>
      ))}
    </div>
  );
}
