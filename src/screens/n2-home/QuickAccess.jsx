import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui';
import {
  ICONO_AUXILIAR,
  ICONO_RELEVO,
  ICONO_TURNOS,
  NOMBRE_AUXILIAR,
  NOMBRE_RELEVO,
  NOMBRE_TURNOS,
} from '../../lib/nombresModulos';

// Rejilla 2×2 con las cuatro puertas de entrada del médico: sus domicilios y
// los tres módulos gremiales. Antes solo estaban Domicilios y MUVET Turnos —
// Relevo y Auxiliar vivían únicamente en la barra inferior, y Auxiliar además
// bajo condición (D-549: solo con disponibilidad activa o servicio en curso).
// Esa condición se retira: entrar al módulo es también gestionar lo propio, no
// solo buscar a alguien, y eso no depende de estar disponible.
//
// ⚠️ Los nombres visibles NO coinciden con las rutas en ninguno de los tres
// módulos gremiales: ver lib/nombresModulos.js.
const LINKS = [
  { to: '/servicios', label: '🏠 Domicilios' },
  { to: '/relevo', label: `${ICONO_TURNOS} ${NOMBRE_TURNOS}` },
  { to: '/cobertura-servicio', label: `${ICONO_RELEVO} ${NOMBRE_RELEVO}` },
  { to: '/apoyo', label: `${ICONO_AUXILIAR} ${NOMBRE_AUXILIAR}` },
];

export default function QuickAccess() {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-2 gap-2">
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
