import { Badge } from '../../components/ui';

// Ficha del otro participante dentro del hilo (RPC `especialista_ficha_contacto`,
// 0039 §7.2). Trae lo que `perfiles_publico` no expone, pero MENOS que las
// fichas de los otros módulos:
//
//   · SIN teléfono — decisión del fundador para este módulo: toda la
//     comunicación va por el chat, que por eso sobrevive al acuerdo.
//   · SIN dirección — no hay un punto de encuentro que coordinar acá; el
//     servicio se pacta entre profesionales, no en un domicilio del tutor.
//   · SIN el NÚMERO de matrícula — solo si la tiene y en qué estado está. Es lo
//     que hace falta para confiar; el identificador gremial no aporta nada más.
//
// No hay dos niveles como en `relevo_ficha_contacto`: acá lo que se muestra
// antes y después del acuerdo es lo mismo, porque no queda nada reservado.
//
// `ficha` es null mientras carga o si el backend no encuentra relación.
const ESTADO_VALIDACION_BADGE = {
  validado: { tone: 'ok', label: '✅ Matrícula vigente' },
  pendiente: { tone: 'alert', label: '⏳ En validación' },
  rechazado: { tone: 'critical', label: '❌ Rechazada' },
};

const ROL_LABEL = { medico: '🩺 Médico veterinario', auxiliar: '🧰 Auxiliar veterinario', clinica: '🏥 Clínica' };

export default function FichaContactoEspecialista({ ficha, cargando }) {
  if (cargando) return <p className="text-[12px] text-[#5A6B7A]">Cargando ficha…</p>;
  if (!ficha) return null;

  const estado = ESTADO_VALIDACION_BADGE[ficha.estado_validacion] ?? ESTADO_VALIDACION_BADGE.pendiente;
  const especialidades = ficha.especialidades ?? [];

  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-[#0A1628]">Ficha del perfil</p>
        {ficha.tiene_matricula && <Badge tone={estado.tone}>{estado.label}</Badge>}
      </div>

      <p className="text-[12px] text-[#5A6B7A]">{ROL_LABEL[ficha.rol] ?? ''}</p>

      {especialidades.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {especialidades.map((e) => (
            <span
              key={e}
              className="rounded-[10px] border border-[#1A7A5E] bg-[#1A7A5E1A] px-2 py-0.5 text-[11px] text-[#0A1628]"
            >
              {e}
            </span>
          ))}
        </div>
      )}

      {ficha.zona_cobertura && <p className="text-[12px] text-[#5A6B7A]">Zona: {ficha.zona_cobertura}</p>}
      {ficha.bio && <p className="text-[12px] text-[#0A1628]">{ficha.bio}</p>}
    </div>
  );
}
