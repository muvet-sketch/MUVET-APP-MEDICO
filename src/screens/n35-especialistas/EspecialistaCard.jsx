import { useState } from 'react';
import { Card, Badge, Avatar, Button } from '../../components/ui';
import { formatCOP } from '../../lib/format';

// Ficha de un especialista en el directorio (0039). Lo que se ve ANTES de
// cualquier contacto — todo lo que trae la vista `especialistas_directorio`.
//
// No hay teléfono ni número de matrícula: la vista no los devuelve. Y el avatar
// va con iniciales porque `foto_url` de un médico vive en el bucket privado
// `documents`, cuya policy solo deja leer la carpeta propia (ver SUPUESTOS en
// la cabecera de 0039).
const ESTADO_VALIDACION_BADGE = {
  validado: { tone: 'ok', label: '✅ Matrícula vigente' },
  pendiente: { tone: 'alert', label: '⏳ En validación' },
  rechazado: { tone: 'critical', label: '❌ Rechazada' },
};

// Los servicios llegan como jsonb agregado por la vista. Se muestran los
// primeros y el resto se despliega: un especialista puede tener veinte y la
// tarjeta no es el lugar para listarlos todos de entrada.
const SERVICIOS_VISIBLES = 3;

export default function EspecialistaCard({ especialista, onContactar }) {
  const [verTodos, setVerTodos] = useState(false);

  const nombre = especialista.nombre_completo || 'Médico veterinario';
  const estado = ESTADO_VALIDACION_BADGE[especialista.estado_validacion] ?? ESTADO_VALIDACION_BADGE.pendiente;
  const especialidades = especialista.especialidades ?? [];
  const servicios = especialista.servicios ?? [];
  const visibles = verTodos ? servicios : servicios.slice(0, SERVICIOS_VISIBLES);
  const ocultos = servicios.length - visibles.length;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar nombre={nombre} rol="medico" semilla={especialista.id} size={36} />
          <div className="flex flex-col">
            <p className="text-[14px] font-semibold text-[#0A1628]">{nombre}</p>
            <p className="text-[11px] text-[#5A6B7A]">🩺 Médico veterinario</p>
          </div>
        </div>
        {especialista.tiene_matricula && <Badge tone={estado.tone}>{estado.label}</Badge>}
      </div>

      {especialidades.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {especialidades.map((e) => (
            <span
              key={e}
              className="rounded-[10px] border border-[#1A7A5E] bg-[#1A7A5E1A] px-2 py-1 text-[11px] text-[#0A1628]"
            >
              {e}
            </span>
          ))}
        </div>
      )}

      {especialista.zona_cobertura && (
        <p className="text-[12px] text-[#5A6B7A]">📍 {especialista.zona_cobertura}</p>
      )}

      {especialista.bio && <p className="text-[12px] text-[#0A1628]">{especialista.bio}</p>}

      {servicios.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[10px] bg-[#F4F7F9] p-2.5">
          <p className="text-[11px] font-medium text-[#5A6B7A]">Servicios y tarifas</p>
          {visibles.map((s) => (
            <div key={s.id} className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-[#0A1628]">
                {s.nombre}
                {s.especialidad ? <span className="text-[#5A6B7A]"> · {s.especialidad}</span> : ''}
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-[#1A7A5E]">{formatCOP(s.precio)}</span>
            </div>
          ))}
          {ocultos > 0 && (
            <button
              type="button"
              onClick={() => setVerTodos(true)}
              className="self-start text-[11px] font-medium text-[#1A7A5E]"
            >
              Ver {ocultos} servicio{ocultos === 1 ? '' : 's'} más →
            </button>
          )}
        </div>
      )}

      <Button variant="secondary" onClick={() => onContactar(especialista)}>
        Contactar
      </Button>
    </Card>
  );
}
