import { useState } from 'react';
import { Modal, Button, Input, Select } from '../../components/ui';
import { ESPECIALIDADES_VETERINARIAS } from '../../lib/especialidades';
import { ZONAS_COBERTURA } from '../../lib/municipios';
import { TIPOS_OFERTA } from '../../lib/especialistas';

// Alta y edición de una oferta del tablón. `tipo` solo se elige al crear: define
// de qué lado está la oferta y ya puede haber conversaciones colgando de ella
// (la lib tampoco lo manda en el update).
export default function OfertaFormModal({ open, onClose, oferta, onGuardar }) {
  const edicion = Boolean(oferta);

  const [tipo, setTipo] = useState(oferta?.tipo ?? 'ofrezco');
  const [especialidad, setEspecialidad] = useState(oferta?.especialidad ?? '');
  const [descripcion, setDescripcion] = useState(oferta?.descripcion ?? '');
  const [zona, setZona] = useState(oferta?.zona ?? '');
  const [fecha, setFecha] = useState(oferta?.fecha ?? '');
  const [horaInicio, setHoraInicio] = useState(oferta?.hora_inicio?.slice(0, 5) ?? '');
  const [horaFin, setHoraFin] = useState(oferta?.hora_fin?.slice(0, 5) ?? '');
  const [tarifa, setTarifa] = useState(oferta?.tarifa ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const ayudaTipo = TIPOS_OFERTA.find((t) => t.value === tipo)?.ayuda ?? '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!descripcion.trim()) {
      setError('Describe la oferta.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onGuardar({
        tipo,
        especialidad: especialidad || null,
        descripcion: descripcion.trim(),
        zona: zona || null,
        fecha: fecha || null,
        horaInicio: horaInicio || null,
        horaFin: horaFin || null,
        tarifa: tarifa === '' ? null : Number(tarifa),
      });
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la oferta.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={edicion ? 'Editar oferta' : 'Publicar oferta'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {!edicion && (
          <div>
            <div className="flex gap-2">
              {TIPOS_OFERTA.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={`flex-1 rounded-[10px] border px-3 py-2 text-[13px] ${
                    tipo === t.value
                      ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]'
                      : 'border-[#E1E8ED] text-[#0A1628]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[#5A6B7A]">{ayudaTipo}</p>
          </div>
        )}

        <Select
          label="Especialidad (opcional)"
          name="especialidad"
          value={especialidad}
          onChange={(e) => setEspecialidad(e.target.value)}
          placeholder="Sin especificar"
          options={ESPECIALIDADES_VETERINARIAS}
        />

        <div className="w-full text-left">
          <label htmlFor="descripcion" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
            Descripción
          </label>
          <textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Qué ofreces o qué necesitas, y en qué condiciones."
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>

        <Select
          label="Zona / Ciudad"
          name="zona"
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          placeholder="Sin especificar"
          options={ZONAS_COBERTURA}
        />

        <Input
          label="Fecha (opcional)"
          name="fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />

        <div className="flex gap-2">
          <Input
            label="Desde"
            name="hora_inicio"
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
          />
          <Input
            label="Hasta"
            name="hora_fin"
            type="time"
            value={horaFin}
            onChange={(e) => setHoraFin(e.target.value)}
          />
        </div>

        <Input
          label="Tarifa en COP (opcional)"
          name="tarifa"
          type="number"
          min="0"
          value={tarifa}
          onChange={(e) => setTarifa(e.target.value)}
          placeholder="Ej. 150000"
        />

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Button type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : edicion ? 'Guardar cambios' : 'Publicar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={guardando}>
          Cancelar
        </Button>
      </form>
    </Modal>
  );
}
