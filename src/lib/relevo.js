import { supabase } from './supabase';

// N-26 · MUVET Turnos (D-540/D-545/D-546). Capa de acceso a datos, siguiendo
// el patrón de lib/solicitudes.js y lib/coberturaServicio.js.
//
// OJO con los nombres: este archivo, la ruta /relevo y las tablas `relevo_*`
// son el identificador interno de lo que la UI llama "MUVET Turnos"; "MUVET
// Relevo" es ahora el módulo médico↔médico de lib/coberturaServicio.js. Ver el
// bloque de lib/nombresModulos.js antes de tocar nada de esto.
//
// Desde la migración 0027 la negociación vive en `relevo_conversaciones` (una
// por par oferta↔interesado, con las dos banderas de acuerdo) y los mensajes
// en `relevo_mensajes.conversacion_id`. D-540 quedó modificado: hay hilo 1:1
// privado mientras dura la negociación, y el turno se cierra solo cuando
// AMBAS partes marcan su acuerdo — `estado` lo deriva un trigger, nunca el
// cliente.
//
// El filtrado de qué publicación ve cada actor sigue siendo responsabilidad de
// esta capa y de las pantallas, pero ya no es la única defensa: 0027 exige en
// RLS que una conversación solo se abra sobre una oferta activa, abierta,
// ajena y dirigida al rol de quien contacta.

// D-545 (revisado): matriz de qué puede publicar cada rol y hacia quién.
// `rol_objetivo` es siempre "quién debe ver/responder esta publicación" —
// tanto para "ofrezco" (a quién le ofrezco mis servicios) como para "busco"
// (a quién busco). Se valida aquí además de en RLS para no depender solo de
// que el cliente arme bien el payload — la policy de insert ya restringe
// autor_id = auth.uid(), pero no el par (tipo, rol_objetivo) según el rol.
//
// - medico: ofrece disponibilidad a establecimientos, o solicita apoyo a un
//   auxiliar.
// - auxiliar: ofrece sus servicios a establecimientos y a médicos.
// - clinica: busca médico o auxiliar para un turno/vacante.
// SUPUESTO: "las clínicas pueden ofertar" se interpretó como "publicar un
// turno/vacante" (que en el modelo sigue siendo tipo='busco' — la clínica no
// ofrece servicios propios en Relevo); "buscar ofertas disponibles" es la
// vista de listado (pestaña Ofertas), no un tipo de publicación nuevo.
// Confirmar con el fundador si en el futuro una clínica necesita publicar
// tipo='ofrezco'.
export const PUBLICACIONES_PERMITIDAS_POR_ROL = {
  medico: [
    { tipo: 'ofrezco', rolObjetivo: 'clinica' },
    { tipo: 'busco', rolObjetivo: 'auxiliar' },
  ],
  auxiliar: [
    { tipo: 'ofrezco', rolObjetivo: 'clinica' },
    { tipo: 'ofrezco', rolObjetivo: 'medico' },
  ],
  clinica: [
    { tipo: 'busco', rolObjetivo: 'medico' },
    { tipo: 'busco', rolObjetivo: 'auxiliar' },
  ],
};

// `perfiles` solo permite a cada usuario leer su propia fila
// (perfiles_select_own, 0001) — el embed automático de PostgREST
// (`autor:autor_id(...)`) devuelve null para la fila de cualquier otro
// usuario. 0014 agrega `perfiles_publico`, una vista con solo las columnas
// no sensibles (rol, nombre, razón social) que cualquier autenticado puede
// leer. En vez de depender del embed automático de PostgREST a través de la
// vista (frágil: requiere que detecte la FK por debajo de la vista), se
// resuelve en dos pasos y se mezcla en cliente — más verboso pero robusto.
async function adjuntarAutores(filas, campoId, campoSalida = 'autor') {
  const ids = Array.from(new Set(filas.map((f) => f[campoId]).filter(Boolean)));
  if (ids.length === 0) return filas.map((f) => ({ ...f, [campoSalida]: null }));

  const { data: autores, error } = await supabase.from('perfiles_publico').select('id, rol, nombre_completo, razon_social').in('id', ids);
  if (error) throw error;

  const porId = new Map((autores ?? []).map((a) => [a.id, a]));
  return filas.map((f) => ({ ...f, [campoSalida]: porId.get(f[campoId]) ?? null }));
}

// La pestaña "Ofertas" (N-26) lista la publicación activa dirigida al rol de
// quien mira (`rol_objetivo === paraRol`) — es el matching real de la red
// gremial, no un tablón abierto a los 3 roles (ver PUBLICACIONES_PERMITIDAS_POR_ROL
// arriba: cada combinación (tipo, rol_objetivo) ya deja claro quién es la
// audiencia). Hubo una versión previa que quitó este filtro porque las
// publicaciones anteriores a D-545 habían quedado con rol_objetivo NULL y no
// aparecían para nadie; la migración 0015 ya rellenó ese dato legado
// (`update ... set rol_objetivo = ... where rol_objetivo is null`), así que
// esa razón ya no aplica y el filtro se restaura aquí.
export async function fetchPublicacionesActivas({ tipo, rolObjetivo, paraRol, zona } = {}) {
  // El `activa = true` de aquí ya no es la única defensa: 0017 lo respalda en
  // RLS (una publicación no activa solo la leen su autor y quienes se
  // postularon a ella). Se mantiene porque esos dos sí ven filas inactivas y
  // el tablón público no debe mostrárselas.
  let query = supabase
    .from('relevo_publicaciones')
    .select('*')
    .eq('activa', true)
    .order('created_at', { ascending: false });

  if (tipo) query = query.eq('tipo', tipo);
  if (rolObjetivo) query = query.eq('rol_objetivo', rolObjetivo);
  if (paraRol) query = query.eq('rol_objetivo', paraRol);
  if (zona) query = query.ilike('zona', `%${zona}%`);

  const { data, error } = await query;
  if (error) throw error;
  return adjuntarAutores(data ?? [], 'autor_id');
}

// Matching por zona del perfil, compartido entre la pestaña "Ofertas" (N-26)
// y el bloque "Ofertas recientes" de la Home (N-2) — así la Home nunca muestra
// una oferta que luego no aparezca en /relevo. `zona_cobertura` es una sola
// columna de texto con las zonas separadas por coma (ver parseZonas en
// lib/municipios.js), y `relevo_publicaciones.zona` se serializa igual, así
// que se compara por substring: basta con que la publicación mencione
// cualquiera de mis zonas. Sin zona configurada no se filtra nada.
//
// SUPUESTO: se hace el split a mano en vez de usar parseZonas() porque este
// filtro no debe descartar zonas fuera del catálogo — las publicaciones
// anteriores al catálogo cerrado (0015) tienen `zona` de texto libre y
// seguirían siendo visibles como hasta ahora.
export function filtrarPublicacionesPorZona(publicaciones, zonaCobertura) {
  const zonas = (zonaCobertura ?? '')
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);
  if (zonas.length === 0) return publicaciones;
  return publicaciones.filter((p) => {
    const zonaPublicacion = (p.zona ?? '').toLowerCase();
    return zonas.some((z) => zonaPublicacion.includes(z.toLowerCase()));
  });
}

export async function fetchMisPublicaciones(autorId) {
  const { data, error } = await supabase
    .from('relevo_publicaciones')
    .select('*')
    .eq('autor_id', autorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function crearPublicacion({
  autorId,
  autorRol,
  tipo,
  rolObjetivo,
  descripcion,
  zona,
  fechaInicio,
  fechaFin,
  tipoJornada,
  horaInicio,
  horaFin,
  duracionHoras,
  procedimientos,
  tarifa,
  turnos,
  habilidades,
  habilidadesProfesionales,
  habilidadesPersonales,
  cupos,
}) {
  const permitidas = PUBLICACIONES_PERMITIDAS_POR_ROL[autorRol] || [];
  const esPermitida = permitidas.some((p) => p.tipo === tipo && p.rolObjetivo === rolObjetivo);
  if (!esPermitida) {
    throw new Error('Esa combinación de publicación no está permitida para tu rol (D-545).');
  }

  const { data, error } = await supabase
    .from('relevo_publicaciones')
    .insert({
      autor_id: autorId,
      tipo,
      rol_objetivo: rolObjetivo,
      descripcion: descripcion || null,
      zona: zona || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      tipo_jornada: tipoJornada || null,
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      duracion_horas: duracionHoras || duracionHoras === 0 ? duracionHoras : null,
      procedimientos: procedimientos || [],
      tarifa: tarifa || tarifa === 0 ? tarifa : null,
      turnos: turnos || [],
      habilidades: habilidades || [],
      habilidades_profesionales: habilidadesProfesionales || [],
      habilidades_personales: habilidadesPersonales || [],
      cupos: normalizarCupos(cupos),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function desactivarPublicacion(id, autorId) {
  const { error } = await supabase
    .from('relevo_publicaciones')
    .update({ activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Cancelación y finalización (0018). A diferencia de desactivarPublicacion
// (pausa reversible del toggle "Mi Oferta"), estas dos son terminales: el
// trigger de 0018 impide que `estado` vuelva a 'abierta' una vez puesto en
// 'cancelada' o 'finalizada', y fuerza `activa = false` en backend sin
// depender de que el cliente también lo mande.
export async function cancelarPublicacion(id, autorId) {
  const { error } = await supabase
    .from('relevo_publicaciones')
    .update({ estado: 'cancelada', activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Solo tiene sentido "dar por finalizado" (labor cumplida) si hay al menos un
// relevo confirmado por ambas partes; si no, lo que corresponde es cancelar.
export async function finalizarPublicacion(id, autorId) {
  const { confirmados } = await fetchCuposPublicacion(id);
  if (confirmados < 1) {
    throw new Error('Aún no hay ningún relevo confirmado. Si ya no necesitas esta oferta, cancélala en vez de finalizarla.');
  }

  const { error } = await supabase
    .from('relevo_publicaciones')
    .update({ estado: 'finalizada', activa: false })
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Pasos del ciclo de vida de una publicación, para la barra de progreso de
// "Mi Oferta". Devuelve el índice sobre PASOS_PUBLICACION, o null cuando la
// publicación está cancelada (no tiene un "avance" que mostrar como barra).
// Con el modelo de 0027 el paso "Interesados" es simplemente "hay al menos una
// conversación viva": ya no hace falta distinguir postulación de pregunta
// previa, porque contactar no compromete a nada.
export const PASOS_PUBLICACION = ['Publicada', 'Interesados', 'Confirmado', 'Finalizada'];

export function calcularPasoPublicacion(oferta, conversaciones) {
  if (!oferta || oferta.estado === 'cancelada') return null;
  if (oferta.estado === 'finalizada') return 3;

  const cupos = normalizarCupos(oferta.cupos);
  const confirmados = contarRelevosConfirmados(conversaciones);
  if (confirmados >= cupos) return 2;

  // Una conversación descartada no cuenta como interés vivo.
  const vivas = (conversaciones ?? []).filter((c) => c.estado !== 'descartada');
  if (vivas.length > 0) return 1;

  return 0;
}

// `habilidadesPerfil` implementa "las habilidades del perfil quedan activas
// cada vez que se activa la oferta" (0015): al publicar, médico y auxiliar
// copian los dos catálogos de su perfil sobre la publicación, así que el
// perfil es la fuente de verdad y no hace falta reeditar la oferta cada vez.
// La clínica no manda este parámetro (sus habilidades son expectativas sobre
// el candidato, no propias) y la publicación conserva lo que tenía.
export async function activarPublicacion(id, autorId, habilidadesPerfil = null) {
  // El trigger de 0016 cierra la publicación al llenarse los cupos; sin este
  // guard, volver a mover el toggle la republicaría con el relevo ya cerrado.
  const { cupos, confirmados, estado } = await fetchCuposPublicacion(id);
  // 0018: cancelada/finalizada son terminales — el trigger de esa migración
  // ya lo impide en backend, pero se valida antes para dar un mensaje claro
  // en vez de que el update simplemente falle.
  if (estado && estado !== 'abierta') {
    throw new Error('Esta oferta ya está cerrada (cancelada o finalizada). Crea una publicación nueva.');
  }
  if (confirmados >= cupos) {
    throw new Error('El turno ya está confirmado y los cupos están llenos. Crea una publicación nueva.');
  }

  const payload = { activa: true };
  if (habilidadesPerfil) {
    payload.habilidades_profesionales = habilidadesPerfil.profesionales ?? [];
    payload.habilidades_personales = habilidadesPerfil.personales ?? [];
  }

  const { error } = await supabase
    .from('relevo_publicaciones')
    .update(payload)
    .eq('id', id)
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Propaga las habilidades del perfil a las publicaciones ya existentes del
// mismo autor. Se llama al guardar las habilidades desde la configuración del
// perfil (N-8 / perfil inline del auxiliar en N-28) para que una oferta que ya
// está activa refleje el cambio sin tener que desactivarla y volver a activarla.
export async function sincronizarHabilidadesPublicaciones(autorId, { profesionales, personales }) {
  const { error } = await supabase
    .from('relevo_publicaciones')
    .update({
      habilidades_profesionales: profesionales ?? [],
      habilidades_personales: personales ?? [],
    })
    .eq('autor_id', autorId);
  if (error) throw error;
}

// Usado por "Editar Oferta" en Mi Oferta (N-26). No cambia `tipo` ni
// `rol_objetivo` (D-545 ya los fija al crear; editar solo ajusta parámetros).
export async function actualizarPublicacion(
  id,
  autorId,
  {
    descripcion,
    zona,
    fechaInicio,
    fechaFin,
    tipoJornada,
    horaInicio,
    horaFin,
    duracionHoras,
    procedimientos,
    tarifa,
    turnos,
    habilidades,
    habilidadesProfesionales,
    habilidadesPersonales,
    cupos,
  }
) {
  const { data, error } = await supabase
    .from('relevo_publicaciones')
    .update({
      descripcion: descripcion || null,
      zona: zona || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      tipo_jornada: tipoJornada || null,
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      duracion_horas: duracionHoras || duracionHoras === 0 ? duracionHoras : null,
      procedimientos: procedimientos || [],
      tarifa: tarifa || tarifa === 0 ? tarifa : null,
      turnos: turnos || [],
      habilidades: habilidades || [],
      habilidades_profesionales: habilidadesProfesionales || [],
      habilidades_personales: habilidadesPersonales || [],
      cupos: normalizarCupos(cupos),
    })
    .eq('id', id)
    .eq('autor_id', autorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cupos (0016): cuántos relevos admite la publicación. Ya no hace falta
// deduplicar por persona — el UNIQUE(publicacion_id, interesado_id) de 0027
// garantiza una conversación por interesado, así que basta con contarlas.
export function normalizarCupos(cupos) {
  const n = Number(cupos);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// Franja horaria (0021): la hora de fin se calcula en cliente a partir de
// "hora de inicio" + "duración del turno" — el usuario nunca la escribe
// directamente, así que cambiar la duración es lo que la mueve.
// `hora` llega como "HH:MM" o "HH:MM:SS" (columna `time` de Postgres).
export function formatHora(hora) {
  return hora ? hora.slice(0, 5) : '';
}

export function formatDuracionHoras(horas) {
  if (horas == null || horas === '') return '';
  const total = Number(horas);
  if (!Number.isFinite(total)) return '';
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// Envuelve a las 24h (un turno que empieza a las 22:00 con 8h de duración
// termina a las 06:00 del día siguiente).
export function sumarHoras(horaInicio, horas) {
  if (!horaInicio || horas === '' || horas == null) return '';
  const [h, m] = horaInicio.split(':').map(Number);
  const duracionMin = Number(horas) * 60;
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(duracionMin)) return '';
  const totalMin = ((Math.round(h * 60 + m + duracionMin) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Inversa de sumarHoras (0022): la duración en horas ya no la escribe el
// usuario, se deriva de inicio/fin al guardar — sigue viajando en
// `duracion_horas` porque formatFranjaHoraria y los datos históricos ya
// dependen de esa columna.
export function calcularDuracionHoras(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return null;
  const [h1, m1] = horaInicio.split(':').map(Number);
  const [h2, m2] = horaFin.split(':').map(Number);
  if (![h1, m1, h2, m2].every(Number.isFinite)) return null;
  const inicioMin = h1 * 60 + m1;
  const finMin = h2 * 60 + m2 <= inicioMin ? h2 * 60 + m2 + 1440 : h2 * 60 + m2;
  return Math.round(((finMin - inicioMin) / 60) * 100) / 100;
}

export function formatFranjaHoraria(publicacion) {
  const inicio = formatHora(publicacion?.hora_inicio);
  if (!inicio) return '';
  const fin = formatHora(publicacion?.hora_fin) || sumarHoras(inicio, publicacion?.duracion_horas);
  const duracion = formatDuracionHoras(publicacion?.duracion_horas);
  return `${inicio}${fin ? `–${fin}` : ''}${duracion ? ` (${duracion})` : ''}`;
}

export function contarRelevosConfirmados(conversaciones) {
  return (conversaciones ?? []).filter((c) => c.estado === 'aceptada').length;
}

export async function fetchCuposPublicacion(publicacionId) {
  const [{ data: publicacion, error: errorPublicacion }, { data: conversaciones, error: errorConversaciones }] =
    await Promise.all([
      supabase.from('relevo_publicaciones').select('cupos, estado').eq('id', publicacionId).maybeSingle(),
      supabase.from('relevo_conversaciones').select('id, estado').eq('publicacion_id', publicacionId),
    ]);
  if (errorPublicacion) throw errorPublicacion;
  if (errorConversaciones) throw errorConversaciones;

  return {
    cupos: normalizarCupos(publicacion?.cupos),
    estado: publicacion?.estado ?? null,
    confirmados: contarRelevosConfirmados(conversaciones),
  };
}

// ============================================================================
// Conversaciones (0027) — la negociación y su hilo
// ============================================================================

export function esParteAutora(conversacion, perfilId) {
  return conversacion?.autor_id === perfilId;
}

// "Contactar": abre la negociación y deja el primer mensaje. No compromete a
// nada; el compromiso es el acuerdo mutuo del final.
//
// Idempotente contra el UNIQUE(publicacion_id, interesado_id) de 0027: si ya
// existe la conversación se reutiliza en vez de fallar, porque se puede llegar
// acá desde dos pestañas o desde una tarjeta con estado desactualizado.
export async function iniciarConversacion({ publicacionId, interesadoId, mensaje }) {
  const texto = (mensaje ?? '').trim();
  if (!texto) throw new Error('Escribe un mensaje para iniciar la conversación.');

  const { data: creada, error } = await supabase
    .from('relevo_conversaciones')
    .insert({ publicacion_id: publicacionId, interesado_id: interesadoId })
    .select()
    .single();

  let conversacion = creada;
  if (error) {
    // 23505 = unique_violation: ya había conversación con esta oferta.
    if (error.code !== '23505') throw error;
    const { data: existente, error: errorExistente } = await supabase
      .from('relevo_conversaciones')
      .select('*')
      .eq('publicacion_id', publicacionId)
      .eq('interesado_id', interesadoId)
      .single();
    if (errorExistente) throw errorExistente;
    conversacion = existente;
  }

  await enviarMensajeConversacion({ conversacionId: conversacion.id, remitenteId: interesadoId, mensaje: texto });
  return conversacion;
}

// La bandeja: mis conversaciones de los DOS lados (las que abrí sobre ofertas
// ajenas y las que recibí sobre las mías) en una sola consulta. `.or(...)`
// sobre dos columnas simples, mismo patrón que fetchHistorial en
// lib/coberturaServicio.js.
export async function fetchMisConversaciones(perfilId) {
  const { data, error } = await supabase
    .from('relevo_conversaciones')
    .select('*, publicacion:publicacion_id(id, tipo, rol_objetivo, descripcion, zona, autor_id, activa, estado, cupos)')
    .or(`autor_id.eq.${perfilId},interesado_id.eq.${perfilId}`)
    .order('ultimo_mensaje_at', { ascending: false });
  if (error) throw error;

  // Quién es "el otro" depende del lado en el que yo esté en cada fila.
  const filas = (data ?? []).map((c) => ({
    ...c,
    _otroId: c.autor_id === perfilId ? c.interesado_id : c.autor_id,
  }));
  const conOtro = await adjuntarAutores(filas, '_otroId', 'otro');
  return conOtro.map(({ _otroId, ...c }) => c);
}

export async function fetchConversacion(conversacionId, perfilId) {
  const { data, error } = await supabase
    .from('relevo_conversaciones')
    .select(
      '*, publicacion:publicacion_id(id, tipo, rol_objetivo, descripcion, zona, tipo_jornada, hora_inicio, hora_fin, duracion_horas, tarifa, turnos, procedimientos, autor_id, activa, estado, cupos)',
    )
    .eq('id', conversacionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const otroId = data.autor_id === perfilId ? data.interesado_id : data.autor_id;
  const [conOtro] = await adjuntarAutores([{ ...data, _otroId: otroId }], '_otroId', 'otro');
  const { _otroId, ...conversacion } = conOtro;
  return conversacion;
}

export async function fetchMensajesConversacion(conversacionId) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .select('id, conversacion_id, remitente_id, mensaje, created_at')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// La policy de insert de 0027 exige que la conversación siga 'abierta': al
// aceptarse o descartarse el hilo deja de admitir mensajes en backend, no solo
// porque la UI esconda el composer.
export async function enviarMensajeConversacion({ conversacionId, remitenteId, mensaje }) {
  const texto = (mensaje ?? '').trim();
  if (!texto) throw new Error('El mensaje no puede estar vacío.');

  const { data, error } = await supabase
    .from('relevo_mensajes')
    .insert({ conversacion_id: conversacionId, remitente_id: remitenteId, mensaje: texto })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// "Estoy de acuerdo". Cada lado solo puede mover su propia bandera y `estado`
// lo deriva el trigger de 0027 — acá nunca se escribe. El relevo queda cerrado
// cuando las dos banderas están en true.
export async function acordarConversacion(conversacion, perfilId) {
  const campo = esParteAutora(conversacion, perfilId) ? 'acuerdo_autor' : 'acuerdo_interesado';
  const { data, error } = await supabase
    .from('relevo_conversaciones')
    .update({ [campo]: true })
    .eq('id', conversacion.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Terminal, y la puede tomar cualquiera de los dos. No consume cupo.
export async function descartarConversacion(conversacionId) {
  const { data, error } = await supabase
    .from('relevo_conversaciones')
    .update({ estado: 'descartada' })
    .eq('id', conversacionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Marca de lectura por lado. Es la que apaga el punto rojo de la bandeja de
// conversaciones; el badge de la campana sigue saliendo de `notificaciones`
// (0026, lib/notificaciones.js), que es una cosa distinta.
export async function marcarConversacionLeida(conversacion, perfilId) {
  const campo = esParteAutora(conversacion, perfilId) ? 'leido_autor_at' : 'leido_interesado_at';
  const { error } = await supabase
    .from('relevo_conversaciones')
    .update({ [campo]: new Date().toISOString() })
    .eq('id', conversacion.id);
  if (error) throw error;
}

// Punto rojo de la bandeja: hay actividad posterior a mi última visita. Se
// compara contra `ultimo_mensaje_at` en vez de contar filas para no tener que
// traer los mensajes de todas las conversaciones solo para pintar la lista.
export function tieneNoLeidos(conversacion, perfilId) {
  if (!conversacion) return false;
  const visto = esParteAutora(conversacion, perfilId)
    ? conversacion.leido_autor_at
    : conversacion.leido_interesado_at;
  if (!visto) return true;
  return new Date(conversacion.ultimo_mensaje_at) > new Date(visto);
}

// Ficha de contacto ampliada (0022, reescrita en 0027): matrícula COMVEZCOL y
// su estado de validación, especialidad, zona, bio y NIT en cuanto hay una
// conversación — lo que hace falta para saber con quién estás hablando y que
// `perfiles_publico` (0014) deliberadamente no expone a cualquier autenticado.
// `telefono` y `direccion_sede` llegan en null hasta que la conversación queda
// 'aceptada': el dato de contacto directo se revela después del compromiso,
// mismo criterio que D-064. Si no hay ninguna relación, devuelve null y la UI
// cae de vuelta a los datos básicos (nombre, rol) que ya trae `otro`.
export async function fetchFichaContacto(perfilId) {
  if (!perfilId) return null;
  const { data, error } = await supabase.rpc('relevo_ficha_contacto', { p_perfil_id: perfilId });
  if (error) throw error;
  return data?.[0] ?? null;
}
