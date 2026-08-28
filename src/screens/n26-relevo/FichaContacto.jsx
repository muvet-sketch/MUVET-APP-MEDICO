// Ficha de contacto ampliada (0022, reescrita en 0027). Vivía dentro de
// TabOfertas, junto al modal "Ver detalles" de las solicitudes recibidas; al
// desaparecer ese bloque en favor de la conversación, se mueve acá para que
// las dos partes vean la misma ficha en el hilo.
//
// Trae lo que `perfiles_publico` (0014) deliberadamente NO expone a cualquier
// autenticado. Dos niveles, según el estado de la conversación:
//   abierta                → matrícula + validación, especialidad, zona, bio.
//   aceptada / finalizada  → además la dirección de sede de la clínica.
// El backend es quien decide: `relevo_ficha_contacto` devuelve ese campo en
// null mientras el turno no esté confirmado, así que acá alcanza con no
// renderizar lo que llegue vacío.
//
// 0035: el NIT dejó de devolverse y de mostrarse. La ficha de la clínica
// encabeza con su logo (`foto_url`, que 0035 expone solo para rol 'clinica').
//
// 0028: el TELÉFONO ya no aparece en ningún nivel — la función dejó de
// devolverlo. Ningún número de teléfono se muestra en la app: toda la
// comunicación se canaliza por el chat del hilo, que desde 0028 sigue abierto
// mientras dura el servicio en vez de cerrarse al aceptar.
//
// `ficha` es null mientras carga o si el backend no encuentra relación — en
// ese caso no se muestra nada y la pantalla se queda con los datos básicos.
import { Avatar, Badge } from '../../components/ui';
import { enlaceUbicacion } from '../../lib/mapas';

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
    const nombreClinica = ficha.razon_social || ficha.nombre_completo || 'Clínica';
    if (!ficha.razon_social && !ficha.nombre_completo && !ficha.direccion_sede) return null;
    // 0035: el NIT ya no se muestra a los usuarios. La ficha ahora encabeza con
    // el logo de la clínica (foto_url, que 0035 expone solo para rol 'clinica').
    // 0030: la dirección sale de la sede que eligió la oferta, y viene con su
    // etiqueta ("Sede Norte") y el link de mapas que pegó la propia clínica.
    const enlace = enlaceUbicacion({
      direccion: ficha.direccion_sede,
      linkMaps: ficha.sede_link_maps,
    });
    return (
      <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] p-3">
        <div className="flex items-center gap-2">
          <Avatar fotoUrl={ficha.foto_url} nombre={nombreClinica} size={36} />
          <div className="flex flex-col">
            <p className="text-[12px] font-semibold text-[#0A1628]">{nombreClinica}</p>
            <p className="text-[11px] text-[#5A6B7A]">Clínica veterinaria</p>
          </div>
        </div>
        {ficha.direccion_sede && (
          <p className="text-[12px] text-[#5A6B7A]">
            📍 {ficha.direccion_sede}
            {ficha.sede_etiqueta ? ` · ${ficha.sede_etiqueta}` : ''}
          </p>
        )}
        {enlace && (
          <a
            href={enlace}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-medium text-[#1A7A5E]"
          >
            Abrir en la app de mapas →
          </a>
        )}
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
    </div>
  );
}
