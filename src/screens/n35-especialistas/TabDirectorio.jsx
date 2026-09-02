import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select } from '../../components/ui';
import { ESPECIALIDADES_VETERINARIAS } from '../../lib/especialidades';
import { ZONAS_COBERTURA } from '../../lib/municipios';
import { fetchDirectorioEspecialistas, iniciarConversacionDirectorio } from '../../lib/especialistas';
import EspecialistaCard from './EspecialistaCard';
import ContactarModal from './ContactarModal';

// Mitad A · El directorio. Lo ven médicos y clínicas (el auxiliar no llega acá:
// lo cierra la pestaña, el WHERE de la vista y la policy de insert).
//
// No hace falta ninguna condición sobre quién aparece: la vista
// `especialistas_directorio` ya solo devuelve médicos con matrícula validada y
// al menos una especialidad. Acá solo se filtra y se pinta.
export default function TabDirectorio({ perfil }) {
  const navigate = useNavigate();
  const [especialistas, setEspecialistas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [zona, setZona] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [contactando, setContactando] = useState(null);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError('');
    fetchDirectorioEspecialistas({
      especialidad: especialidad || undefined,
      zona: zona || undefined,
      q: busqueda || undefined,
      // Un médico no se contacta a sí mismo: su propia ficha no tiene por qué
      // aparecer en el listado que consulta.
      excluirId: perfil.rol === 'medico' ? perfil.id : undefined,
    })
      .then((data) => {
        if (activo) setEspecialistas(data);
      })
      .catch(() => {
        if (activo) setError('No se pudo cargar el directorio.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil.id, perfil.rol, especialidad, zona, busqueda]);

  async function handleContactar(texto) {
    const conversacion = await iniciarConversacionDirectorio({
      especialistaId: contactando.id,
      interesadoId: perfil.id,
      mensaje: texto,
    });
    setContactando(null);
    navigate(`/especialistas/conversacion/${conversacion.id}`);
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-5 pb-24">
      <p className="text-[12px] text-[#5A6B7A]">
        Médicos veterinarios con matrícula COMVEZCOL validada que ejercen una o más especialidades. Contáctalos para
        contratar sus servicios.
      </p>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre…"
        className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
      />

      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            name="especialidad"
            value={especialidad}
            onChange={(e) => setEspecialidad(e.target.value)}
            placeholder="Toda especialidad"
            options={ESPECIALIDADES_VETERINARIAS}
          />
        </div>
        <div className="flex-1">
          <Select
            name="zona"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            placeholder="Toda zona"
            options={ZONAS_COBERTURA}
          />
        </div>
      </div>

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && especialistas.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">
          {especialidad || zona || busqueda
            ? 'Ningún especialista coincide con estos filtros.'
            : 'Todavía no hay especialistas en el directorio.'}
        </Card>
      )}

      {!loading &&
        especialistas.map((e) => (
          <EspecialistaCard key={e.id} especialista={e} onContactar={setContactando} />
        ))}

      <ContactarModal
        open={Boolean(contactando)}
        onClose={() => setContactando(null)}
        titulo={`Contactar a ${contactando?.nombre_completo ?? ''}`}
        ayuda="Se abre una conversación privada entre ustedes dos. El servicio queda cerrado cuando los dos estén de acuerdo."
        placeholder="Cuéntale qué caso tienes y qué necesitas…"
        onEnviar={handleContactar}
      />
    </div>
  );
}
