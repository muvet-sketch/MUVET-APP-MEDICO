// Ficha de contacto ampliada (0022, reescrita en 0027). Vivía dentro de
// TabOfertas, junto al modal "Ver detalles" de las solicitudes recibidas; al
// desaparecer ese bloque en favor de la conversación, se mueve acá para que
// las dos partes vean la misma ficha en el hilo.
//
// Trae lo que `perfiles_publico` (0014) deliberadamente NO expone a cualquier
// autenticado. Dos niveles, según el estado de la conversación:
//   abierta   → matrícula + validación, especialidad, zona, bio, NIT.
//   aceptada  → además teléfono y dirección de sede.
// El backend es quien decide: `relevo_ficha_contacto` devuelve esos dos campos
// en null mientras la conversación no esté aceptada, así que acá alcanza con
// no renderizar lo que llegue vacío.
//
// `ficha` es null mientras carga o si el backend no encuentra relación — en
// ese caso no se muestra nada y la pantalla se queda con los datos básicos.
import { Badge } from '../../components/ui';

// Mismo criterio de HeaderPerfil/MatriculaSection (N-8) para la matrícula
// COMVEZCOL del médico.
const ESTADO_VALIDACION_BADGE = {
  validado: { tone: 'ok', label: '✅ Vigente' },
  pendiente: { tone: 'alert', label: '⏳ En validación' },
  rechazado: { tone: 'critical', label: '❌ Rechazada' },
};

export default function FichaContacto({ ficha, cargando }) {
  if (cargando) return <p className="text-[12px] text-[#5A6B7A]">Cargando ficha…</p>;
  if (!ficha) return null;

  if (ficha.rol === 'clinica') {
    if (!ficha.nit && !ficha.direccion_sede && !ficha.telefono) return null;
    return (
      <div className="flex flex-col gap-1 rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] p-3">
        <p className="text-[12px] font-semibold text-[#0A1628]">Datos de la clínica</p>
        {ficha.nit && <p className="text-[12px] text-[#5A6B7A]">NIT: {ficha.nit}</p>}
        {ficha.direccion_sede && <p className="text-[12px] text-[#5A6B7A]">Dirección: {ficha.direccion_sede}</p>}
        {ficha.telefono && <p className="text-[12px] text-[#5A6B7A]">Tel: {ficha.telefono}</p>}
      </div>
    );
  }

  const estado = ESTADO_VALIDACION_BADGE[ficha.estado_validacion] ?? ESTADO_VALIDACION_BADGE.pendiente;
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] p-3">
      <p className="text-[12px] font-semibold text-[#0A1628]">Ficha del perfil</p>
      {ficha.matricula_comvezcol && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#5A6B7A]">Matrícula {ficha.matricula_comvezcol}</span>
          <Badge tone={estado.tone}>{estado.label}</Badge>
        </div>
      )}
      {ficha.especialidad && <p className="text-[12px] text-[#5A6B7A]">{ficha.especialidad}</p>}
      {ficha.zona_cobertura && <p className="text-[12px] text-[#5A6B7A]">Zona: {ficha.zona_cobertura}</p>}
      {ficha.bio && <p className="text-[12px] text-[#0A1628]">{ficha.bio}</p>}
      {ficha.telefono && <p className="text-[12px] text-[#5A6B7A]">Tel: {ficha.telefono}</p>}
    </div>
  );
}
