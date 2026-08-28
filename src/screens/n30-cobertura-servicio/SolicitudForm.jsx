import { useState } from 'react';
import { Card, Input, Select, Button } from '../../components/ui';
import { ZONAS_COBERTURA } from '../../lib/municipios';
import { TIPOS_SERVICIO_COBERTURA, ESPECIES_COBERTURA, TEMPERAMENTOS_COBERTURA, crearSolicitud } from '../../lib/coberturaServicio';

// Formulario de nueva solicitud de MUVET Relevo (N-30): el médico describe
// el servicio que no puede atender para que otro médico pueda ofrecerse a
// cubrirlo. Campos pedidos: tipo de servicio, zona/perímetro, especie, raza,
// temperamento (+ fecha/hora y descripción libre para dar contexto).
export default function SolicitudForm({ perfil, onCreated, onCancel, showToast }) {
  const [tipoServicio, setTipoServicio] = useState(TIPOS_SERVICIO_COBERTURA[0]);
  const [tipoServicioOtro, setTipoServicioOtro] = useState('');
  const [zona, setZona] = useState('');
  const [especie, setEspecie] = useState(ESPECIES_COBERTURA[0]);
  const [raza, setRaza] = useState('');
  const [temperamento, setTemperamento] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaServicio, setFechaServicio] = useState('');
  const [horaServicio, setHoraServicio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!fechaServicio) {
      setError('La fecha del servicio es obligatoria.');
      return;
    }
    if (tipoServicio === 'Otro' && !tipoServicioOtro.trim()) {
      setError('Escribe el tipo de servicio.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await crearSolicitud({
        autorId: perfil.id,
        tipoServicio: tipoServicio === 'Otro' ? tipoServicioOtro.trim() : tipoServicio,
        zona,
        especie,
        raza,
        temperamento,
        descripcion,
        fechaServicio,
        horaServicio,
      });
      showToast('Solicitud publicada. Otros médicos ya pueden verla.', 'ok');
      onCreated();
    } catch (err) {
      setError(err.message ?? 'No se pudo publicar la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">Nueva solicitud de relevo</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Select label="Tipo de servicio" value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)} options={TIPOS_SERVICIO_COBERTURA} />
        {tipoServicio === 'Otro' && (
          <Input
            label="¿Cuál?"
            value={tipoServicioOtro}
            onChange={(e) => setTipoServicioOtro(e.target.value)}
            placeholder="Describe el tipo de servicio"
          />
        )}
        <Select label="Zona / perímetro" value={zona} onChange={(e) => setZona(e.target.value)} options={ZONAS_COBERTURA} placeholder="Selecciona una zona" />

        <div className="grid grid-cols-2 gap-2">
          <Select label="Especie" value={especie} onChange={(e) => setEspecie(e.target.value)} options={ESPECIES_COBERTURA} />
          <Input label="Raza" value={raza} onChange={(e) => setRaza(e.target.value)} />
        </div>

        <Select label="Temperamento" value={temperamento} onChange={(e) => setTemperamento(e.target.value)} options={TEMPERAMENTOS_COBERTURA} placeholder="Selecciona (opcional)" />

        <div className="grid grid-cols-2 gap-2">
          <Input label="Fecha del servicio" type="date" required value={fechaServicio} onChange={(e) => setFechaServicio(e.target.value)} />
          <Input label="Hora (opcional)" type="time" value={horaServicio} onChange={(e) => setHoraServicio(e.target.value)} />
        </div>

        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Detalle para quien te cubra</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Por qué no puedes asistir, indicaciones del caso, dirección aproximada del tutor, etc."
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Publicando…' : 'Publicar solicitud'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
