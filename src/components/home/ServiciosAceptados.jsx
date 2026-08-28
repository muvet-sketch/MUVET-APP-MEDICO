import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Avatar } from '../ui';
import { fetchServiciosAceptados } from '../../lib/serviciosAceptados';
import { enlaceUbicacion } from '../../lib/mapas';

// "Servicios aceptados": lo acordado y todavía en curso, en el Home de los
// tres roles (0028).
//
// Cubre el pedido de que al aceptar un servicio el usuario lo vea en su Home,
// entre y encuentre lo importante —con quién es y dónde es— más el acceso al
// chat. La tarjeta muestra nombre y dirección/punto de encuentro; el detalle
// completo y el historial del chat viven en la pantalla de la conversación,
// que es a donde lleva la fila.
//
// La dirección la decide el backend: para MUVET Auxiliar sale de
// `apoyo_direccion` (que solo se lee tras el acuerdo), para MUVET Turnos de
// `relevo_ficha_contacto` (que revela la sede de la oferta tras el acuerdo) y
// para MUVET Relevo de `cobertura_direccion` (0032). Si no llega, se dice que
// se coordina por el chat en vez de mentir con un vacío.
//
// La tarjeta ofrece además abrir la ubicación en la app de mapas del
// dispositivo (D-536, ver lib/mapas.js): antes la dirección era texto muerto y
// había que entrar al chat para poder abrirla.
export default function ServiciosAceptados({ perfil }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    setLoading(true);
    fetchServiciosAceptados(perfil.id)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        // Mismo criterio que OfertasRecientes/HistorialReciente: el Home no se
        // rompe porque falle una fuente; la sección queda vacía.
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  // A diferencia del historial, esta sección desaparece si no hay nada: un
  // "no tienes servicios aceptados" permanente solo ocupa el Home.
  if (loading || items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] font-semibold text-[#0A1628]">Servicios aceptados</p>

      {items.map((item) => {
        // El enlace a mapas es un <a> hermano del botón, no un hijo: la tarjeta
        // entera era un solo <button> y anidar un enlace dentro habría sido
        // HTML inválido además de robarle el clic a la navegación al chat.
        const enlace = enlaceUbicacion({ direccion: item.direccion, linkMaps: item.linkMaps });

        return (
          <Card key={item.id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => navigate(item.to)}
              className="flex w-full flex-col gap-1 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar fotoUrl={item.fotoUrl} nombre={item.titulo} size={28} />
                  <p className="text-[14px] font-semibold text-[#0A1628]">
                    <span aria-hidden="true">{item.icono} </span>
                    {item.titulo}
                  </p>
                </div>
                <Badge tone="ok">Confirmado</Badge>
              </div>

              {item.subtitulo && <p className="text-[12px] text-[#5A6B7A]">{item.subtitulo}</p>}

              {item.direccion ? (
                <p className="text-[13px] text-[#0A1628]">
                  📍 {item.direccion}
                  {item.referencia ? ` · ${item.referencia}` : ''}
                </p>
              ) : (
                <p className="text-[12px] text-[#5A6B7A]">
                  {item.referencia ? `📍 ${item.referencia} · ` : ''}
                  Punto de encuentro por definir en el chat
                </p>
              )}
            </button>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={() => navigate(item.to)}
                className="text-[12px] font-medium text-[#1A7A5E]"
              >
                Abrir servicio y chat →
              </button>
              {enlace && (
                <a
                  href={enlace}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-medium text-[#1A7A5E]"
                >
                  Abrir en mapas →
                </a>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
