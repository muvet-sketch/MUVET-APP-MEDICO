// N-31 · Notificaciones.
//
// Antes esto no era una pantalla: la campana (NotificationBell) derivaba dos
// contadores de las banderas de `relevo_mensajes` y al tocarla llevaba directo
// a una pestaña de /relevo, sin decir qué había pasado ni dejar rastro. Ahora
// cada evento es una fila de la tabla `notificaciones` (migración 0026), con
// su tipo, su texto y su destino — mensajes, respuestas, postulaciones sobre
// mis ofertas, decisiones sobre las mías, y lo equivalente en Cobertura de
// Servicio.
//
// D-540 sigue intacto: acá se avisa, no se conversa. Tocar una notificación
// lleva al módulo donde esa conversación ya vive.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, ScreenHeader, BottomNav } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { formatFechaCorta } from '../../lib/format';
import {
  fetchNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  subscribeNotificaciones,
  presentacionNotificacion,
  FAMILIAS_NOTIFICACION,
} from '../../lib/notificaciones';

export default function N31Notificaciones() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [familia, setFamilia] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    setLoading(true);
    fetchNotificaciones(perfil.id)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'No se pudieron cargar las notificaciones.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  // Si llega una mientras la pantalla está abierta, entra arriba sin recargar.
  useEffect(() => {
    if (!perfil?.id) return undefined;
    return subscribeNotificaciones(perfil.id, (nueva) => {
      setItems((prev) => (prev.some((n) => n.id === nueva.id) ? prev : [nueva, ...prev]));
    });
  }, [perfil?.id]);

  // Optimista: el punto rojo se apaga de una y la navegación no espera al
  // update. Si falla, la fila sigue sin leer en BD y vuelve a aparecer así en
  // la próxima carga — no hay nada que deshacer en pantalla.
  function abrir(notificacion) {
    if (!notificacion.leida) {
      setItems((prev) => prev.map((n) => (n.id === notificacion.id ? { ...n, leida: true } : n)));
      marcarNotificacionLeida(notificacion.id).catch(() => {});
    }
    navigate(notificacion.url);
  }

  async function handleMarcarTodas() {
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    try {
      await marcarTodasLeidas(perfil.id);
    } catch {
      setError('No se pudieron marcar como leídas.');
    }
  }

  const visibles = familia
    ? items.filter((n) => presentacionNotificacion(n.tipo).familia === familia)
    : items;
  const hayNoLeidas = items.some((n) => !n.leida);

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title="Notificaciones" fallbackTo={perfil?.rol === 'medico' ? '/home' : '/home-simplificado'} conCampana />

      <div className="flex flex-1 flex-col gap-3 px-5 py-5 pb-24">
        <div className="flex gap-2">
          {FAMILIAS_NOTIFICACION.map((f) => (
            <button
              key={f.value || 'todo'}
              type="button"
              onClick={() => setFamilia(f.value)}
              className={`flex-1 whitespace-nowrap rounded-[10px] border px-1 py-2 text-[11px] ${
                familia === f.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {hayNoLeidas && (
          <button
            type="button"
            onClick={handleMarcarTodas}
            className="self-end text-[12px] font-medium text-[#1A7A5E]"
          >
            Marcar todas como leídas
          </button>
        )}

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

        {!loading && visibles.length === 0 && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">
              {familia ? 'Nada nuevo en esta categoría.' : 'No tienes notificaciones todavía.'}
            </p>
          </Card>
        )}

        {!loading &&
          visibles.map((n) => {
            const { icono } = presentacionNotificacion(n.tipo);
            return (
              <button key={n.id} type="button" onClick={() => abrir(n)} className="w-full text-left">
                <Card className={`flex gap-3 ${n.leida ? '' : 'border-[#1A7A5E]'}`}>
                  <span className="text-[18px] leading-none" aria-hidden="true">
                    {icono}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0A1628]">
                      {!n.leida && <span className="h-2 w-2 shrink-0 rounded-full bg-[#C63B3B]" aria-label="Sin leer" />}
                      {n.titulo}
                    </p>
                    {n.cuerpo && <p className="truncate text-[13px] text-[#5A6B7A]">{n.cuerpo}</p>}
                    <p className="text-[11px] text-[#5A6B7A]">{formatFechaCorta(n.created_at)}</p>
                  </div>
                </Card>
              </button>
            );
          })}
      </div>

      <BottomNav />
    </div>
  );
}
