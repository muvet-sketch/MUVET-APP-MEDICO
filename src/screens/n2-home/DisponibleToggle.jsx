import { useNavigate } from 'react-router-dom';
import { Card, Toggle, Button } from '../../components/ui';

// D-541: sin matricula validada el medico no puede activar disponibilidad.
// D-550: el toggle queda bloqueado hasta que el medico configure >=1 servicio con precio > 0 en N-27.
export default function DisponibleToggle({ estadoValidacion, tieneServiciosConPrecio, disponible, onToggle }) {
  const navigate = useNavigate();

  const bloqueadoPorValidacion = estadoValidacion !== 'validado';
  const bloqueadoPorServicios = !bloqueadoPorValidacion && !tieneServiciosConPrecio;
  const bloqueado = bloqueadoPorValidacion || bloqueadoPorServicios;

  return (
    <Card className="flex flex-col items-center gap-3 text-center">
      <p className="text-[14px] font-medium text-[#0A1628]">
        {disponible ? 'DISPONIBLE' : 'NO DISPONIBLE'}
      </p>
      <Toggle checked={Boolean(disponible)} disabled={bloqueado} onChange={onToggle} label="Disponibilidad" />

      {bloqueadoPorValidacion && (
        <p className="text-[12px] text-[#8A5E17]">
          Tu matrícula COMVEZCOL está en proceso de validación. Podrás activar tu disponibilidad una vez sea
          aprobada.
        </p>
      )}

      {bloqueadoPorServicios && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[12px] text-[#8A5E17]">
            Configura al menos un servicio con precio para poder activar tu disponibilidad.
          </p>
          <Button variant="outline" fullWidth={false} onClick={() => navigate('/servicios')}>
            Configura tus servicios
          </Button>
        </div>
      )}
    </Card>
  );
}
