// N-5 · Expediente del paciente · Pre-consulta
//
// -- CORREGIDO en Fase 4 (DESP-CLAUDECODE-P-EI-AppMedico-004, Acción 0,
// D-56X-ENM): esta pantalla vivía en N-10 desde Fase 3 (ver historial), pero
// el inventario canónico v1.1 asigna N-10 al Hub de Constelación y N-5 al
// Expediente. El fundador confirmó (opción B) alinear el scaffold con el
// inventario: se renombra carpeta y ruta a N-5. N-10 queda libre para el
// Hub de Constelación (src/screens/n10-constelacion-hub).
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ScreenHeader } from '../../components/ui';
import { fetchMascota, fetchTutor, fetchAlergias } from '../../lib/expediente';
import HeaderExpediente from './HeaderExpediente';
import TabFicha from './TabFicha';
import TabVacunas from './TabVacunas';
import TabMedicamentos from './TabMedicamentos';
import TabAlergias from './TabAlergias';
import TabConsultas from './TabConsultas';
import CrearExpedienteForm from './CrearExpedienteForm';

const TABS = [
  { key: 'ficha', label: 'Ficha' },
  { key: 'vacunas', label: 'Vacunas' },
  { key: 'medicamentos', label: 'Medicamentos' },
  { key: 'alergias', label: 'Alergias' },
  { key: 'consultas', label: 'Consultas anteriores' },
];

export default function N5ExpedienteMascota() {
  const { mascotaId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const modoLectura = searchParams.get('modo') === 'lectura';
  const tutorIdParaCrear = searchParams.get('tutorId');
  const volver = searchParams.get('volver');
  const servicioIdVolver = searchParams.get('servicioId');
  const esCreacion = mascotaId === 'nuevo';

  const [tab, setTab] = useState('ficha');
  const [mascota, setMascota] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [alergiasCount, setAlergiasCount] = useState(0);
  const [loading, setLoading] = useState(!esCreacion);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (esCreacion) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setNotFound(false);

    fetchMascota(mascotaId)
      .then(async (data) => {
        if (!active) return;
        if (!data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setMascota(data);
        const [tutorData, alergias] = await Promise.all([fetchTutor(data.tutor_id), fetchAlergias(mascotaId)]);
        if (!active) return;
        setTutor(tutorData);
        setAlergiasCount(alergias.length);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setNotFound(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mascotaId, esCreacion]);

  function handleMascotaCreada(nuevaMascota) {
    if (volver === 'constelacion' && servicioIdVolver) {
      navigate(`/constelacion/${servicioIdVolver}`);
      return;
    }
    navigate(`/mascotas/${nuevaMascota.id}${modoLectura ? '?modo=lectura' : ''}`, { replace: true });
  }

  // Caso paciente nuevo: no existe fila en `mascotas` todavía (mascotaId
  // literal 'nuevo', o el id de la URL no resolvió ninguna fila real).
  // Único control de creación visible incluso en modo lectura.
  if (esCreacion || notFound) {
    return (
      <div className="flex min-h-svh flex-col">
        <ScreenHeader title="Nuevo expediente" />
        <CrearExpedienteForm tutorId={tutorIdParaCrear} onCreada={handleMascotaCreada} />
      </div>
    );
  }

  if (loading || !mascota) return null;

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Expediente del paciente" />

      <HeaderExpediente mascota={mascota} alergiasCount={alergiasCount} />

      <div className="sticky top-[57px] z-10 flex overflow-x-auto border-b border-[#E1E8ED] bg-white px-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-3 text-[12px] font-medium ${
              tab === t.key ? 'border-[#1A7A5E] text-[#0A1628]' : 'border-transparent text-[#5A6B7A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ficha' && <TabFicha mascota={mascota} tutor={tutor} modoLectura={modoLectura} />}
      {tab === 'vacunas' && <TabVacunas mascotaId={mascota.id} />}
      {tab === 'medicamentos' && <TabMedicamentos mascotaId={mascota.id} />}
      {tab === 'alergias' && <TabAlergias mascotaId={mascota.id} />}
      {tab === 'consultas' && <TabConsultas mascotaId={mascota.id} />}
    </div>
  );
}
