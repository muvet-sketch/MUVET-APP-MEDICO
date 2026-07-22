import { useState } from 'react';
import { Button, Input } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { uploadDocumento } from '../../lib/storage';

const ROLES = [
  { value: 'medico', label: 'Médico Veterinario' },
  { value: 'auxiliar', label: 'Auxiliar Veterinario' },
  { value: 'clinica', label: 'Clínica Veterinaria' },
];

export default function ActorProfileForm({ userId, onProfileCreated }) {
  const [rol, setRol] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [zonaCobertura, setZonaCobertura] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [matriculaComvezcol, setMatriculaComvezcol] = useState('');
  const [carneFile, setCarneFile] = useState(null);
  const [razonSocial, setRazonSocial] = useState('');
  const [nit, setNit] = useState('');
  const [direccionSede, setDireccionSede] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!rol) {
      setError('Selecciona tu rol para continuar.');
      return;
    }
    if (rol === 'medico' && !matriculaComvezcol) {
      setError('La matrícula COMVEZCOL es obligatoria para médicos.');
      return;
    }

    setLoading(true);
    try {
      let carneUrl = null;
      if (rol === 'medico' && carneFile) {
        const ext = carneFile.name.split('.').pop();
        const path = `${userId}/carne-${Date.now()}.${ext}`;
        await uploadDocumento(path, carneFile);
        carneUrl = path;
      }

      const perfilRow = {
        id: userId,
        rol,
        nombre_completo: nombreCompleto,
        telefono,
        zona_cobertura: rol !== 'clinica' ? zonaCobertura : null,
        especialidad: rol === 'medico' ? especialidad : null,
        matricula_comvezcol: rol === 'medico' ? matriculaComvezcol : null,
        carne_url: carneUrl,
        estado_validacion: rol === 'medico' ? 'pendiente' : null,
        razon_social: rol === 'clinica' ? razonSocial : null,
        nit: rol === 'clinica' ? nit : null,
        direccion_sede: rol === 'clinica' ? direccionSede : null,
      };

      const { error: insertError } = await supabase.from('perfiles').insert(perfilRow);
      if (insertError) throw insertError;

      onProfileCreated(rol);
    } catch (err) {
      setError(err.message ?? 'No se pudo crear el perfil.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-[20px] font-semibold text-[#0A1628]">Cuéntanos quién eres</h1>
        <p className="text-[12px] text-[#5A6B7A]">Paso 2 de 2 · Selecciona tu rol</p>
      </div>

      <div className="flex w-full flex-col gap-2">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRol(r.value)}
            className={`w-full rounded-[10px] border px-4 py-3 text-left text-[14px] ${
              rol === r.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {rol === 'clinica' ? (
        <>
          <Input label="Razón social" required value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
          <Input label="NIT" required value={nit} onChange={(e) => setNit(e.target.value)} />
          <Input
            label="Dirección de la sede"
            required
            value={direccionSede}
            onChange={(e) => setDireccionSede(e.target.value)}
          />
          <Input
            label="Nombre del responsable"
            required
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
          />
          <Input label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </>
      ) : null}

      {rol === 'auxiliar' ? (
        <>
          <Input
            label="Nombre completo"
            required
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
          />
          <Input label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <Input
            label="Zona de cobertura"
            required
            value={zonaCobertura}
            onChange={(e) => setZonaCobertura(e.target.value)}
          />
        </>
      ) : null}

      {rol === 'medico' ? (
        <>
          <Input
            label="Nombre completo"
            required
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
          />
          <Input label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <Input
            label="Matrícula COMVEZCOL"
            required
            value={matriculaComvezcol}
            onChange={(e) => setMatriculaComvezcol(e.target.value)}
          />
          <div className="w-full text-left">
            <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]" htmlFor="carne">
              Foto del carné COMVEZCOL
            </label>
            <input
              id="carne"
              type="file"
              accept="image/*"
              onChange={(e) => setCarneFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px]"
            />
            <p className="mt-1 text-[12px] text-[#5A6B7A]">
              Tu matrícula será validada manualmente en un plazo de hasta 24 horas.
            </p>
          </div>
          <Input
            label="Especialidad"
            value={especialidad}
            onChange={(e) => setEspecialidad(e.target.value)}
          />
          <Input
            label="Zona de cobertura"
            required
            value={zonaCobertura}
            onChange={(e) => setZonaCobertura(e.target.value)}
          />
        </>
      ) : null}

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      {rol && (
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando…' : 'Finalizar registro'}
        </Button>
      )}
    </form>
  );
}
