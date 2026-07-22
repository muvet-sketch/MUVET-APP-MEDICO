// MOCK / DEV ONLY — Herramienta interna de desarrollo (Fase 3).
//
// La App Tutor (quien en producción genera solicitudes reales) todavía no
// existe. Este panel simula lo que su backend haría: crea un tutor + mascota
// de prueba (si no existen aún en este navegador) y una fila en `solicitudes`
// + `solicitudes_direccion`, para poder probar el flujo N-3 → N-4 → N-5 sin
// depender de otra app.
//
// NO es una de las 18 pantallas del MVP. NO debe aparecer en producción:
// - Este archivo corta en seco si `import.meta.env.DEV` es falso.
// - Quien lo monta (src/app/AppShell.jsx) además lo envuelve en
//   `{import.meta.env.DEV && <SimuladorSolicitud />}`, para que Vite/Rollup
//   elimine el componente por completo del bundle de producción.
//
// TODO: remover este archivo (y su punto de montaje) antes de producción,
// o en cuanto la App Tutor real esté disponible para generar solicitudes.
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { MOCK_ESCENARIOS_SIMULADOR_SOLICITUD } from '../mocks/mockData';

const ESCENARIOS = MOCK_ESCENARIOS_SIMULADOR_SOLICITUD;

async function ensureSeedTutorMascota(escenarioKey, seed) {
  const cacheKey = `muvet_dev_seed_${escenarioKey}`;
  const cached = window.localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      window.localStorage.removeItem(cacheKey);
    }
  }

  const { data: tutor, error: tutorError } = await supabase
    .from('tutores')
    .insert({ nombre_completo: seed.tutorNombre, telefono: seed.tutorTelefono })
    .select()
    .single();
  if (tutorError) throw tutorError;

  const { data: mascota, error: mascotaError } = await supabase
    .from('mascotas')
    .insert({
      tutor_id: tutor.id,
      nombre: seed.mascotaNombre,
      especie: seed.especie,
      raza: seed.raza,
      sexo: seed.sexo,
    })
    .select()
    .single();
  if (mascotaError) throw mascotaError;

  const ids = { tutorId: tutor.id, mascotaId: mascota.id };
  window.localStorage.setItem(cacheKey, JSON.stringify(ids));
  return ids;
}

export default function SimuladorSolicitud() {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(null);
  const [mensaje, setMensaje] = useState('');

  if (!import.meta.env.DEV) return null;

  async function dispararEscenario(escenario) {
    setCargando(escenario.key);
    setMensaje('');
    try {
      const { tutorId, mascotaId } = await ensureSeedTutorMascota(escenario.key, escenario.seed);

      const { data: solicitud, error: solicitudError } = await supabase
        .from('solicitudes')
        .insert({
          tutor_id: tutorId,
          mascota_id: mascotaId,
          motivo_consulta: escenario.motivoConsulta,
          zona_aproximada: escenario.zonaAproximada,
          tarifa_estimada: escenario.tarifaEstimada,
          primera_vez_paciente: escenario.primeraVezPaciente,
        })
        .select()
        .single();
      if (solicitudError) throw solicitudError;

      const { error: direccionError } = await supabase.from('solicitudes_direccion').insert({
        solicitud_id: solicitud.id,
        direccion_exacta: escenario.direccionExacta,
        referencia: escenario.referencia,
      });
      if (direccionError) throw direccionError;

      setMensaje(`✅ "${escenario.label}" creada. Expira en 60s si nadie la acepta/rechaza.`);
    } catch (err) {
      setMensaje(`❌ ${err.message ?? 'No se pudo crear la solicitud de prueba.'}`);
    } finally {
      setCargando(null);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      {abierto && (
        <div className="mb-2 w-[280px] rounded-[12px] border border-[#E8A23D] bg-white p-4 shadow-xl">
          <p className="mb-2 text-[11px] font-semibold text-[#8A5E17]">
            ⚠ Herramienta de desarrollo — no es parte del MVP. Remover antes de producción.
          </p>
          <p className="mb-3 text-[11px] text-[#5A6B7A]">
            Simula una solicitud entrante (la App Tutor aún no existe). Inserta directamente en Supabase.
          </p>
          <div className="flex flex-col gap-2">
            {ESCENARIOS.map((escenario) => (
              <button
                key={escenario.key}
                type="button"
                disabled={cargando !== null}
                onClick={() => dispararEscenario(escenario)}
                className="w-full rounded-[8px] border border-[#0A1628] px-3 py-2 text-left text-[12px] font-medium text-[#0A1628] disabled:opacity-50"
              >
                {cargando === escenario.key ? 'Creando…' : escenario.label}
              </button>
            ))}
          </div>
          {mensaje && <p className="mt-3 text-[11px] text-[#5A6B7A]">{mensaje}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Simulador de solicitud (dev only)"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8A23D] text-[20px] shadow-xl"
      >
        🧪
      </button>
    </div>
  );
}
