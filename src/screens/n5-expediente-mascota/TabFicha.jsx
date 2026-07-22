import { Badge } from '../../components/ui';
import { calcularEdad, formatFechaCorta } from '../../lib/format';

function Campo({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-[#5A6B7A]">{label}</p>
      <p className="text-[14px] text-[#0A1628]">{value || '—'}</p>
    </div>
  );
}

function textoEsterilizado(esterilizado) {
  if (esterilizado === null || esterilizado === undefined) return null;
  return esterilizado ? 'Esterilizado' : 'No esterilizado';
}

export default function TabFicha({ mascota, tutor }) {
  const edad = calcularEdad(mascota.fecha_nacimiento);

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <div className="grid grid-cols-2 gap-4">
        <Campo label="Especie" value={mascota.especie} />
        <Campo label="Sexo" value={mascota.sexo} />
        <Campo label="Esterilización" value={textoEsterilizado(mascota.esterilizado)} />
        <Campo label="Fecha de nacimiento" value={formatFechaCorta(mascota.fecha_nacimiento)} />
        <Campo label="Edad" value={edad} />
        <div>
          <p className="text-[11px] text-[#5A6B7A]">Último peso</p>
          <div className="flex items-center gap-2">
            <p className="text-[14px] text-[#0A1628]">{mascota.peso_kg ? `${mascota.peso_kg} kg` : '—'}</p>
            {mascota.peso_kg ? <Badge tone="neutral">Registrado</Badge> : null}
          </div>
        </div>
      </div>

      <div>
        <p className="text-[11px] text-[#5A6B7A]">Condiciones preexistentes</p>
        <p className="text-[14px] text-[#0A1628]">{mascota.condiciones_preexistentes || 'Ninguna registrada.'}</p>
      </div>

      <div>
        <p className="text-[11px] text-[#5A6B7A]">Tutor</p>
        <p className="text-[14px] text-[#0A1628]">{tutor?.nombre_completo || 'Sin nombre registrado'}</p>
      </div>
    </div>
  );
}
