import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui';

const LINKS = [
  { to: '/servicios', label: '🏠 Domicilios' },
  { to: '/historial', label: 'Historial' },
  { to: '/relevo', label: 'MUVET Relevo' },
  { to: '/perfil', label: '👤 Perfil' },
];

// D-549: tercer acceso rápido, visible solo si el médico tiene disponibilidad
// activa o un servicio en curso — lleva a N-26 con filtro pre-aplicado a
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
