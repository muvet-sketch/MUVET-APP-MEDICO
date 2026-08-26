import { useEffect, useState } from 'react';
import { fetchNotificacionesNoLeidasCount, subscribeNotificaciones } from '../../lib/notificaciones';

// Contador de notificaciones sin leer (0026), compartido por los dos lugares
// que lo pintan: la campana de las cabeceras de Home (NotificationBell) y la
// pestaña "Alertas" de la barra inferior (BottomNav). Se mantiene acá, junto a
// sus dos únicos consumidores, para no duplicar el par fetch + realtime.
//
// Se refresca al montar y con cada INSERT que llega por realtime. Volver de
// /notificaciones vuelve a montar el componente de turno, así que el conteo
// baja solo tras marcar como leídas.
export default function useNotificacionesNoLeidas(perfilId) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!perfilId) {
      setCount(0);
      return undefined;
    }

    let activo = true;
    fetchNotificacionesNoLeidasCount(perfilId)
      .then((n) => {
        if (activo) setCount(n);
      })
      .catch(() => {});

    const unsubscribe = subscribeNotificaciones(perfilId, () => {
      if (activo) setCount((c) => c + 1);
    });

    return () => {
      activo = false;
      unsubscribe();
    };
  }, [perfilId]);

  return count;
}
