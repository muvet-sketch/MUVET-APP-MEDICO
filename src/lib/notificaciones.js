import { supabase } from './supabase';
import { CORTO_AUXILIAR, CORTO_RELEVO, CORTO_TURNOS } from './nombresModulos';

// N-31 · Notificaciones. Capa de acceso a la tabla `notificaciones`
// (migración 0026): una fila por evento, escrita por triggers del backend
// sobre MUVET Turnos (relevo_mensajes) y MUVET Relevo (cobertura_solicitudes,
// cobertura_mensajes).
//
// Los prefijos de `tipo` son identificadores internos anteriores al cambio de
// nombres: `relevo_*` son de MUVET Turnos y `cobertura_*` de MUVET Relevo.
// Ver el bloque de lib/nombresModulos.js antes de tocar nada de esto.
//
// El cliente NO inserta: la RLS de 0026 solo tiene policy de select y de
// update sobre las filas propias. Desde aquí únicamente se leen y se marcan
// como leídas.
//
// Antes esto se derivaba al vuelo de dos banderas de `relevo_mensajes`
// (`leido` 0013, `decision_leida` 0020) dentro de NotificationBell. Desde 0027
// esas banderas quedaron sin uso: el punto de "sin leer" de la bandeja de
// conversaciones sale de `leido_autor_at`/`leido_interesado_at`
// (tieneNoLeidos en lib/relevo.js), y la campana de esta tabla.

// Cuántas se traen de una. No hay paginación: el volumen esperado por perfil
// es bajo y la pantalla es una lista corta de avisos, no un historial
// exhaustivo (para eso está N-9).
const LIMITE_NOTIFICACIONES = 100;

// Familias para los chips de filtro de la pantalla — mismo patrón que
// ORIGENES_HISTORIAL en lib/historialUnificado.js.
export const FAMILIAS_NOTIFICACION = [
  { value: '', label: 'Todas' },
  { value: 'relevo', label: CORTO_TURNOS },
  { value: 'cobertura', label: CORTO_RELEVO },
  { value: 'apoyo', label: CORTO_AUXILIAR },
];

// Presentación por tipo (los mismos valores del CHECK de 0026 + 0027). Los
// tres tipos marcados como históricos ya no los emite ningún trigger, pero
// siguen existiendo en filas anteriores a 0027 y tienen que renderizarse bien.
const PRESENTACION = {
  relevo_contacto: { icono: '💬', familia: 'relevo' },
  relevo_mensaje: { icono: '💬', familia: 'relevo' },
  relevo_acuerdo: { icono: '🤝', familia: 'relevo' },
  relevo_confirmada: { icono: '✅', familia: 'relevo' },
  relevo_descartada: { icono: '✖️', familia: 'relevo' },
  relevo_finalizada: { icono: '🏁', familia: 'relevo' }, // 0028
  relevo_pago: { icono: '💳', familia: 'relevo' }, // 0029
  relevo_postulacion: { icono: '✅', familia: 'relevo' }, // histórico (pre-0027)
  relevo_decision: { icono: '📣', familia: 'relevo' }, // histórico (pre-0027)
  relevo_respuesta: { icono: '↩️', familia: 'relevo' }, // histórico (pre-0027)
  cobertura_ofrecimiento: { icono: '🤝', familia: 'cobertura' },
  cobertura_mensaje: { icono: '💬', familia: 'cobertura' },
  cobertura_acuerdo: { icono: '👍', familia: 'cobertura' }, // 0034
  cobertura_confirmada: { icono: '✅', familia: 'cobertura' }, // 0034
  cobertura_descartada: { icono: '🚫', familia: 'cobertura' }, // 0034
  cobertura_finalizada: { icono: '🏁', familia: 'cobertura' },
  // 0029, retirado en 0034 (MUVET Relevo salió del control de pagos). Se deja
  // el mapeo para que los avisos ya enviados sigan pintándose.
  cobertura_pago: { icono: '💳', familia: 'cobertura' },
  // MUVET Auxiliar (0028)
  apoyo_contacto: { icono: '💬', familia: 'apoyo' },
  apoyo_mensaje: { icono: '💬', familia: 'apoyo' },
  apoyo_acuerdo: { icono: '🤝', familia: 'apoyo' },
  apoyo_confirmada: { icono: '✅', familia: 'apoyo' },
  apoyo_descartada: { icono: '✖️', familia: 'apoyo' },
  apoyo_finalizada: { icono: '🏁', familia: 'apoyo' },
  apoyo_pago: { icono: '💳', familia: 'apoyo' }, // 0029
};

const PRESENTACION_DEFECTO = { icono: '🔔', familia: '' };

export function presentacionNotificacion(tipo) {
  return PRESENTACION[tipo] ?? PRESENTACION_DEFECTO;
}

export async function fetchNotificaciones(perfilId) {
  const { data, error } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('perfil_id', perfilId)
    .order('created_at', { ascending: false })
    .limit(LIMITE_NOTIFICACIONES);
  if (error) throw error;
  return data ?? [];
}

// Se cuenta en cliente sobre el arreglo de ids: `leida` es una columna directa
// de la propia fila, no hay tabla anidada de por medio.
export async function fetchNotificacionesNoLeidasCount(perfilId) {
  const { data, error } = await supabase
    .from('notificaciones')
    .select('id')
    .eq('perfil_id', perfilId)
    .eq('leida', false);
  if (error) throw error;
  return data?.length ?? 0;
}

export async function marcarNotificacionLeida(id) {
  const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
  if (error) throw error;
}

export async function marcarTodasLeidas(perfilId) {
  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('perfil_id', perfilId)
    .eq('leida', false);
  if (error) throw error;
}

// A diferencia de los subscribe de lib/coberturaServicio.js, este llegó a tener
// dos consumidores montados a la vez (la campana y la pestaña "Alertas" de
// BottomNav, que ya no existe). Dos canales con el mismo topic se pisan, así
// que cada suscripción lleva su propio sufijo — se mantiene por si vuelve a
// haber más de una campana en pantalla.
let secuenciaCanal = 0;

// Realtime: `perfil_id` es columna simple de la fila, así que se filtra
// directo en el propio postgres_changes.
export function subscribeNotificaciones(perfilId, onNueva) {
  secuenciaCanal += 1;
  const channel = supabase
    .channel(`notificaciones-${perfilId}-${secuenciaCanal}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `perfil_id=eq.${perfilId}` },
      (payload) => onNueva(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
