import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui';
import { ICONO_AUXILIAR, ICONO_TURNOS, NOMBRE_TURNOS } from '../../lib/nombresModulos';

// Solo lo que no está ya en la barra inferior ni tiene sección propia en el
// Home: MUVET Relevo (ex Cobertura) y MUVET Auxiliar viven en la barra, e
// Historial tiene su propia vista previa más abajo. Perfil se mudó al menú
// hamburguesa del header (0028).
const LINKS = [
  { to: '/servicios', label: '🏠 Domicilios' },
  { to: '/relevo', label: `${ICONO_TURNOS} ${NOMBRE_TURNOS}` },
];

// D-549: acceso rápido visible solo si el médico tiene disponibilidad activa o
// un servicio en curso.
//
// 0028: apuntaba a `/relevo?tipo=ofrezco&rol=auxiliar`, un deep link que quedó
// muerto al salir el matching médico↔auxiliar de MUVET Turnos. Ahora lleva al
// tablón de MUVET Auxiliar, que ES la lista de auxiliares disponibles para un
// médico — el filtro por rol ya no hace falta porque el módulo entero es eso.
const BUSCAR_AUXILIAR_LINK = { to: '/apoyo?tab=disponibles', label: `${ICONO_AUXILIAR} Buscar auxiliar` };

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
