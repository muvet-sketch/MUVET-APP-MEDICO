import { supabase } from './supabase';

// Suscripciones realtime genéricas para los chats (0028).
//
// Hasta ahora este patrón vivía duplicado en lib/coberturaServicio.js
// (subscribeMensajesChat / subscribeSolicitud) y no existía en lib/relevo.js
// —de ahí que el hilo de MUVET Turnos obligara a refrescar para ver mensajes
// nuevos—. Se extrae acá para que los tres módulos usen el mismo mecanismo.
//
// Requisito: la tabla tiene que estar en la publicación `supabase_realtime`.
// Crear una tabla NO la agrega sola. Ver el bloque de realtime de 0028.
//
// `filter` de postgres_changes solo admite columnas simples de la propia fila
// (no joins), por eso los chats cuelgan de un `conversacion_id`/`solicitud_id`
// que ya está en la fila del mensaje.
//
// Nota sobre nombres de canal: dos canales con el mismo topic se pisan entre
// sí. Cada suscripción lleva un sufijo de secuencia porque una misma pantalla
// puede montar más de una (mensajes + fila de la conversación), y en React 18
// StrictMode los efectos se montan dos veces en desarrollo.
let secuenciaCanal = 0;

function nuevoTopic(prefijo) {
  secuenciaCanal += 1;
  return `${prefijo}-${secuenciaCanal}`;
}

// INSERTs sobre `tabla` filtrados por una columna simple. Devuelve la función
// de baja, pensada para retornarse tal cual desde el cleanup de un useEffect.
export function subscribeInserts(tabla, columna, valor, onFila) {
  if (!valor) return () => {};

  const channel = supabase
    .channel(nuevoTopic(`${tabla}-${valor}`))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: tabla, filter: `${columna}=eq.${valor}` },
      (payload) => onFila(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// UPDATEs sobre una fila concreta: sirve para que cada parte vea en vivo el
// acuerdo o la finalización de la otra sin recargar la pantalla.
export function subscribeRow(tabla, id, onFila) {
  if (!id) return () => {};

  const channel = supabase
    .channel(nuevoTopic(`${tabla}-row-${id}`))
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: tabla, filter: `id=eq.${id}` },
      (payload) => onFila(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
