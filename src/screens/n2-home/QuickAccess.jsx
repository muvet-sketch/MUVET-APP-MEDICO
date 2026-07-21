import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui';

const LINKS = [
  { to: '/historial', label: 'Historial' },
  { to: '/relevo', label: 'MUVET Relevo' },
  { to: '/perfil', label: 'Perfil' },
];

export default function QuickAccess() {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-3 gap-2">
      {LINKS.map((link) => (
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
