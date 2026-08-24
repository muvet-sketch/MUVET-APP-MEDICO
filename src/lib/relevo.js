import { supabase } from './supabase';

// N-26 · MUVET Relevo (D-540/D-545/D-546). Esquema (relevo_publicaciones,
// relevo_mensajes) y RLS ya existían desde 0001_schema_inicial.sql — esta es
// solo la capa de acceso a datos, siguiendo el patrón de lib/solicitudes.js.
// El filtrado de qué publicación ve cada actor es responsabilidad de la capa
// de acceso a datos y de las pantallas (RLS solo exige `activa = true` y
// `autor_id = auth.uid()` para escritura — cualquier autenticado puede leer
// todas las filas), así que `rol_objetivo` debe fijarse siempre en creación
// y respetarse siempre en las consultas.

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
// Sin la confirmación doble de 0016 (ver 0020) el paso intermedio
// "Confirmando" ya no existe: la decisión del autor es única e inmediata.
export const PASOS_PUBLICACION = ['Publicada', 'Postulantes', 'Confirmado', 'Finalizada'];

export function calcularPasoPublicacion(oferta, mensajes) {
  if (!oferta || oferta.estado === 'cancelada') return null;
  if (oferta.estado === 'finalizada') return 3;

  // Una pregunta previa (0019, es_postulacion=false) no es un postulante: no
  // debe adelantar la barra de "Publicada" a "Postulantes" solo porque
  // alguien preguntó algo antes de decidir.
  const postulaciones = (mensajes ?? []).filter((m) => m.es_postulacion !== false);

  const cupos = normalizarCupos(oferta.cupos);
  const confirmados = contarRelevosConfirmados(postulaciones);
  if (confirmados >= cupos) return 2;

  if (postulaciones.length > 0) return 1;

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
    throw new Error('El relevo ya está confirmado y los cupos están llenos. Crea una publicación nueva.');
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

// Cupos (0016): cuántos relevos admite la publicación y cuántos ya quedaron
// confirmados por ambas partes. Se cuenta por postulante distinto para que dos
// mensajes de la misma persona no consuman dos cupos (mismo criterio que el
// trigger que cierra la publicación).
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

export function contarRelevosConfirmados(mensajes) {
  const remitentes = (mensajes ?? [])
    .filter((m) => m.es_postulacion !== false && m.estado === 'aceptada')
    .map((m) => m.remitente_id);
  return new Set(remitentes).size;
}

export async function fetchCuposPublicacion(publicacionId) {
  const [{ data: publicacion, error: errorPublicacion }, { data: mensajes, error: errorMensajes }] = await Promise.all([
    supabase.from('relevo_publicaciones').select('cupos, estado').eq('id', publicacionId).maybeSingle(),
    supabase
      .from('relevo_mensajes')
      .select('remitente_id, estado, es_postulacion')
      .eq('publicacion_id', publicacionId),
  ]);
  if (errorPublicacion) throw errorPublicacion;
  if (errorMensajes) throw errorMensajes;

  return {
    cupos: normalizarCupos(publicacion?.cupos),
    estado: publicacion?.estado ?? null,
    confirmados: contarRelevosConfirmados(mensajes),
  };
}

// D-540: mensaje único de contacto, sin hilo de chat. `esPostulacion` (0019)
// distingue "acepto la oferta" (default, como hasta ahora) de "solo quiero
// preguntar algo antes de decidir" — esto último no crea una postulación: no
// aparece en fetchMisPostulaciones ni puede confirmarse como relevo (el
// trigger de la migración lo rechaza si igual se intenta).
export async function enviarMensaje({ publicacionId, remitenteId, mensaje, esPostulacion = true }) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .insert({ publicacion_id: publicacionId, remitente_id: remitenteId, mensaje, es_postulacion: esPostulacion })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Confirmación única del relevo (0020, reemplaza la doble confirmación de
// 0016): "Validar Oferta" ya es el compromiso del interesado, así que la
// única decisión que falta es la del autor de la publicación — aceptar o
// rechazar, desde "Solicitudes activas". El trigger de 0020 hace la decisión
// terminal (no se puede revertir) y valida en backend que quien la toma sea
// realmente el autor, por si la policy de update del remitente (0016) se
// intentara usar para escribirse la propia aceptación.
export async function decidirPostulacion(mensajeId, decision) {
  if (decision !== 'aceptada' && decision !== 'rechazada') {
    throw new Error('Decisión inválida.');
  }
  const { error } = await supabase.from('relevo_mensajes').update({ estado: decision }).eq('id', mensajeId);
  if (error) throw error;
}

// Las ofertas de OTROS a las que yo me postulé, para poder confirmarlas desde
// mi lado. Excluye las publicaciones propias: ahí mis filas son respuestas
// que envié como dueño, no postulaciones (ver `enviarMensaje` en Mi Oferta).
// También excluye las preguntas previas (0019, es_postulacion=false): esas no
// son una postulación real, así que no deben marcar "ya te postulaste" ni
// aparecer en "Mis postulaciones" a la espera de una confirmación que nunca
// vendrá.
export async function fetchMisPostulaciones(remitenteId) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .select('*, publicacion:publicacion_id!inner(id, tipo, rol_objetivo, descripcion, zona, autor_id, activa, cupos)')
    .eq('remitente_id', remitenteId)
    .eq('es_postulacion', true)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ajenas = (data ?? []).filter((m) => m.publicacion?.autor_id !== remitenteId);
  const conAutor = await adjuntarAutores(
    ajenas.map((m) => ({ ...m, _autorPublicacionId: m.publicacion.autor_id })),
    '_autorPublicacionId',
    'autorPublicacion',
  );
  return conAutor.map(({ _autorPublicacionId, ...m }) => m);
}

// SUPUESTO: el teléfono del remitente (D-540, contacto tras aceptar) ya no
// se pide aquí — `perfiles_publico` (0014) deliberadamente no expone
// teléfono a cualquier autenticado. Falta una función security definer que
// lo revele solo al dueño de la publicación; queda pendiente como mejora
// futura, fuera de alcance de este fix (ver 0014).
export async function fetchMensajesRecibidos(autorId) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .select('*, publicacion:publicacion_id!inner(id, tipo, descripcion, autor_id, activa, cupos)')
    .eq('publicacion.autor_id', autorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return adjuntarAutores(data ?? [], 'remitente_id', 'remitente');
}

// Ficha de contacto ampliada (0022): NIT/dirección/teléfono de la clínica, o
// matrícula COMVEZCOL/estado de validación/especialidad/zona/bio/teléfono del
// médico o auxiliar — lo que `perfiles_publico` (0014) deliberadamente no
// expone a cualquier autenticado. `relevo_ficha_contacto` (security definer)
// solo la devuelve si `perfilId` y quien pregunta ya intercambiaron un
// mensaje de Relevo; si no hay relación, devuelve null y la UI cae de vuelta
// a los datos básicos (nombre, rol) que ya trae `remitente`/`autorPublicacion`.
export async function fetchFichaContacto(perfilId) {
  if (!perfilId) return null;
  const { data, error } = await supabase.rpc('relevo_ficha_contacto', { p_perfil_id: perfilId });
  if (error) throw error;
  return data?.[0] ?? null;
}

// Campana de notificaciones (N-26 · Mensajes). Cuenta mensajes recibidos que
// el dueño de la publicación todavía no vio (0013: columna `leido`).
// Nota: se trae el arreglo de ids y se cuenta en cliente (en vez de
// count:'exact'+head:true) porque esa combinación con filtro sobre columna de
// tabla anidada (publicacion.autor_id) resultó inestable en PostgREST
// (probado contra el proyecto real: mismo query devolvía 200 y 400 según el
// momento) — mismo patrón ya probado que usa fetchMensajesRecibidos.
export async function fetchMensajesNoLeidosCount(autorId) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .select('id, publicacion:publicacion_id!inner(autor_id)')
    .eq('leido', false)
    .eq('publicacion.autor_id', autorId);
  if (error) throw error;
  return data?.length ?? 0;
}

// Se llama al abrir la pestaña "Mensajes" — marca todo lo recibido como
// visto. D-540: sigue siendo un mensaje único por fila, no un hilo.
export async function marcarMensajesLeidos(autorId) {
  const { data: propias, error: errorPublicaciones } = await supabase
    .from('relevo_publicaciones')
    .select('id')
    .eq('autor_id', autorId);
  if (errorPublicaciones) throw errorPublicaciones;

  const ids = (propias ?? []).map((p) => p.id);
  if (ids.length === 0) return;

  const { error } = await supabase
    .from('relevo_mensajes')
    .update({ leido: true })
    .in('publicacion_id', ids)
    .eq('leido', false);
  if (error) throw error;
}

// Realtime para la campana: escucha nuevos mensajes en toda la tabla (no se
// puede filtrar por publicacion.autor_id en postgres_changes) y descarta los
// que no son sobre una publicación propia, igual que
// subscribeNuevasSolicitudesPendientes en lib/solicitudes.js.
export function subscribeNuevosMensajesRelevo(autorId, onNuevoMensaje) {
  const channel = supabase
    .channel(`relevo-mensajes-${autorId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'relevo_mensajes' },
      async (payload) => {
        const { data } = await supabase
          .from('relevo_publicaciones')
          .select('id')
          .eq('id', payload.new.publicacion_id)
          .eq('autor_id', autorId)
          .maybeSingle();
        if (data) onNuevoMensaje(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Campana de notificaciones, lado del interesado (0020): cuenta postulaciones
// mías que el autor ya decidió (aceptada/rechazada) y que todavía no vi.
// `decision_leida` es una columna directa sobre mi propia fila (soy
// `remitente_id`), así que a diferencia de fetchMensajesNoLeidosCount no hace
// falta filtrar sobre una tabla anidada.
export async function fetchPostulacionesNoLeidasCount(remitenteId) {
  const { data, error } = await supabase
    .from('relevo_mensajes')
    .select('id')
    .eq('remitente_id', remitenteId)
    .eq('decision_leida', false);
  if (error) throw error;
  return data?.length ?? 0;
}

// Se llama al abrir "Mi Oferta" (donde vive "Mis postulaciones") — marca como
// vistas todas las decisiones pendientes de notificar.
export async function marcarPostulacionesLeidas(remitenteId) {
  const { error } = await supabase
    .from('relevo_mensajes')
    .update({ decision_leida: true })
    .eq('remitente_id', remitenteId)
    .eq('decision_leida', false);
  if (error) throw error;
}

// Realtime para la campana del interesado: a diferencia de
// subscribeNuevosMensajesRelevo (INSERT sobre publicaciones propias), acá se
// puede filtrar directo por `remitente_id` en el propio postgres_changes
// porque es una columna simple de la fila, no una tabla anidada.
export function subscribeDecisionesRelevo(remitenteId, onDecision) {
  const channel = supabase
    .channel(`relevo-decisiones-${remitenteId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'relevo_mensajes', filter: `remitente_id=eq.${remitenteId}` },
      (payload) => {
        if (payload.new.decision_leida === false) onDecision(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
