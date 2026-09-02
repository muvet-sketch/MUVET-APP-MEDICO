import { useNavigate } from 'react-router-dom';
import { Card, Badge } from '../ui';
import { NOMBRE_ESPECIALISTAS, ICONO_ESPECIALISTAS } from '../../lib/nombresModulos';
import { esVisibleEnDirectorio, faltaParaDirectorio } from '../../lib/especialidades';

// Estado del médico dentro del directorio de MUVET Especialistas (N-35, 0039),
// en la Home del médico (N-2).
//
// No es una vista previa del directorio como ApoyoDisponibles u
// OfertasRecientes: ahí lo útil es ver qué hay publicado hoy, pero un
// directorio no caduca, así que listar tres fichas sueltas no diría nada. Lo
// accionable es lo propio: aparecer en él exige DOS condiciones (matrícula
// validada + al menos una especialidad) y la primera no depende del médico, así
// que sin este aviso quedaría adivinando por qué nadie lo encuentra.
//
// Solo médico: la entrada al módulo para los otros dos roles es su tarjeta en
// N-28, y ninguno tiene especialidades que configurar.
export default function EspecialistasPreview({ perfil }) {
  const navigate = useNavigate();
  if (perfil?.rol !== 'medico') return null;

  const visible = esVisibleEnDirectorio(perfil);
  const falta = faltaParaDirectorio(perfil);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-[#0A1628]">{NOMBRE_ESPECIALISTAS}</p>
        <button
          type="button"
          onClick={() => navigate('/especialistas')}
          className="text-[12px] font-medium text-[#1A7A5E]"
        >
          Abrir →
        </button>
      </div>

      <button type="button" onClick={() => navigate('/especialistas')} className="w-full text-left">
        <Card className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] text-[#0A1628]">
              <span aria-hidden="true">{ICONO_ESPECIALISTAS}</span> Encuentra especialistas para tus casos, o consigue
              que te encuentren a ti.
            </p>
            <Badge tone={visible ? 'ok' : 'alert'}>{visible ? 'Ya apareces' : 'Sin listar'}</Badge>
          </div>

          {falta && (
            <p className="text-[12px] text-[#5A6B7A]">
              Falta: {falta}{' '}
              <span
                role="link"
                tabIndex={0}
                className="font-medium text-[#1A7A5E]"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/perfil');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    navigate('/perfil');
                  }
                }}
              >
                Ir a mi perfil →
              </span>
            </p>
          )}
        </Card>
      </button>
    </div>
  );
}
