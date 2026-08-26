// MOCK — datos de ejemplo. No representan información real de la base de datos.
// Alimentan la sección "Actividad reciente" de N-27 (Mis Domicilios · Tab
// "Activos") mientras el feed de actividad real no está implementado (Fase 4).
// Vivía en la Home (N-2) hasta que ese espacio pasó a las ofertas de Relevo:
// es actividad de domicilios, así que se movió a ese módulo. Debajo de estas
// tarjetas, la misma sección ya lista los servicios cerrados reales.

export const MOCK_ACTIVIDAD_RECIENTE = [
  {
    id: 'mock-1',
    tipo: 'servicio_cerrado',
    titulo: 'Consulta domiciliaria cerrada',
    descripcion: 'Max (Canino) · SOAP registrado',
    fecha: '2026-07-18T15:30:00-05:00',
  },
  {
    id: 'mock-2',
    tipo: 'servicio_cerrado',
    titulo: 'Consulta domiciliaria cerrada',
    descripcion: 'Luna (Felino) · SOAP registrado',
    fecha: '2026-07-17T11:10:00-05:00',
  },
  {
    id: 'mock-3',
    tipo: 'relevo_mensaje',
    titulo: 'Mensaje de MUVET Turnos',
    descripcion: '"¿Puedes cubrir turno mañana en zona norte?"',
    fecha: '2026-07-16T09:00:00-05:00',
  },
];

// MOCK — datos de ejemplo. No representan servicios reales.
// Usados en N-27 (Mis Domicilios · Tab "Activos", sección "Hoy") mientras
// N-3/N-4/N-21 no están construidos (Fase 3). El botón [Ir →] de estas cards
// es no-op — TODO Fase 4/6.
//
// MOCK_ACTIVOS_ANTERIORES se eliminó: su sección "Anteriores" fue reemplazada
// por "Actividad reciente", que ya lista los servicios cerrados reales
// (fetchServiciosCerrados) junto a MOCK_ACTIVIDAD_RECIENTE.
export const MOCK_ACTIVOS_HOY = [
  {
    id: 'mock-activo-1',
    estado: 'en_curso',
    mascota: 'Rocko',
    especie: 'Canino',
    tutor: 'Camila Restrepo',
    hora: '3:30 p.m.',
  },
];

// MOCK — vista previa de ejemplo para el flujo de "Importar desde archivo" en N-27.
// El parseo real de CSV/Excel queda fuera de esta fase — TODO Fase posterior: parseo real de CSV/Excel.
export const MOCK_CSV_IMPORT_PREVIEW = [
  { nombre_servicio: 'Consulta general a domicilio', precio: 85000, descripcion: 'Valoración clínica completa' },
  { nombre_servicio: 'Vacunación', precio: 60000, descripcion: '' },
  { nombre_servicio: 'Desparasitación', precio: 45000, descripcion: '' },
];

// MOCK / DEV ONLY — usados exclusivamente por src/dev/SimuladorSolicitud.jsx
// (Fase 3). Datos de tutor + mascota de prueba que el simulador inserta en
// Supabase (tutores/mascotas reales en BD, pero con datos ficticios) para
// poder generar una `solicitud` sin depender de la App Tutor, que aún no
// existe. No se usan en ninguna pantalla real del MVP.
export const MOCK_ESCENARIOS_SIMULADOR_SOLICITUD = [
  {
    key: 'normal',
    label: 'Solicitud normal',
    seed: {
      tutorNombre: 'Camila Restrepo',
      tutorTelefono: '3001234567',
      mascotaNombre: 'Rocko',
      especie: 'Canino',
      raza: 'Labrador',
      sexo: 'macho',
    },
    motivoConsulta: 'Vómito y decaimiento desde ayer en la noche.',
    zonaAproximada: 'Chapinero, Bogotá',
    tarifaEstimada: 85000,
    primeraVezPaciente: false,
    direccionExacta: 'Calle 63 #11-24, Apto 302, Chapinero, Bogotá',
    referencia: 'Edificio Torres del Parque, portería norte.',
  },
  {
    key: 'nuevo',
    label: 'Paciente nuevo (primera vez)',
    seed: {
      tutorNombre: 'Julián Gómez',
      tutorTelefono: '3109876543',
      mascotaNombre: 'Nala',
      especie: 'Felino',
      raza: 'Criollo',
      sexo: 'hembra',
    },
    motivoConsulta: 'Primera valoración general, adopción reciente.',
    zonaAproximada: 'Usaquén, Bogotá',
    tarifaEstimada: 95000,
    primeraVezPaciente: true,
    direccionExacta: 'Cra 7 #116-40, Casa 12, Usaquén, Bogotá',
    referencia: 'Casa color blanco con reja negra.',
  },
  {
    key: 'largo',
    label: 'Motivo largo (prueba de truncado)',
    seed: {
      tutorNombre: 'Andrea Beltrán',
      tutorTelefono: '3157654321',
      mascotaNombre: 'Max',
      especie: 'Canino',
      raza: 'Golden Retriever',
      sexo: 'macho',
    },
    motivoConsulta:
      'Desde hace tres días el paciente presenta episodios intermitentes de tos seca que se intensifican durante la noche y después del ejercicio, acompañados de leve dificultad respiratoria, disminución del apetito y menor tolerancia al ejercicio; el tutor también reporta que ha estado bebiendo más agua de lo habitual y que en dos ocasiones tuvo arcadas sin vómito.',
    zonaAproximada: 'Suba, Bogotá',
    tarifaEstimada: 78000,
    primeraVezPaciente: false,
    direccionExacta: 'Calle 145 #91-30, Suba, Bogotá',
    referencia: 'Conjunto residencial Bosques de Suba, torre 4.',
  },
];
