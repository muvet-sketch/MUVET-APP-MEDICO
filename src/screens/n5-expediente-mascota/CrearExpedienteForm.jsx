import { useState } from 'react';
import { Input, Button } from '../../components/ui';
import { crearMascota } from '../../lib/expediente';

const ESPECIES = ['Canino', 'Felino', 'Otro'];

export default function CrearExpedienteForm({ tutorId, onCreada }) {
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState('Canino');
  const [raza, setRaza] = useState('');
  const [sexo, setSexo] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) {
      setError('El nombre de la mascota es obligatorio.');
      return;
    }
    if (!tutorId) {
      setError('No se encontró el tutor asociado a esta solicitud.');
      return;
    }
    setLoading(true);
    try {
      const mascota = await crearMascota({
        tutorId,
        nombre: nombre.trim(),
        especie,
        raza,
        sexo,
        fechaNacimiento,
        pesoKg: pesoKg ? Number(pesoKg) : null,
      });
      onCreada(mascota);
    } catch (err) {
      setError(err.message ?? 'No se pudo crear el expediente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <div>
        <p className="text-[16px] font-semibold text-[#0A1628]">Primera vez de este paciente en MUVET</p>
        <p className="text-[12px] text-[#5A6B7A]">Crea un expediente mínimo antes de la consulta.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />

        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Especie</label>
          <select
            value={especie}
            onChange={(e) => setEspecie(e.target.value)}
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628]"
          >
            {ESPECIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <Input label="Raza" value={raza} onChange={(e) => setRaza(e.target.value)} />
        <Input label="Sexo" value={sexo} onChange={(e) => setSexo(e.target.value)} />
        <Input
          label="Fecha de nacimiento"
          type="date"
          value={fechaNacimiento}
          onChange={(e) => setFechaNacimiento(e.target.value)}
        />
        <Input
          label="Peso (kg)"
          type="number"
          step="0.1"
          value={pesoKg}
          onChange={(e) => setPesoKg(e.target.value)}
        />

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <Button type="submit" disabled={loading}>
          {loading ? 'Creando…' : '+ Crear expediente ahora'}
        </Button>
      </form>
    </div>
  );
}
