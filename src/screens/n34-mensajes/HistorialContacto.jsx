// N-34 · Mensajes › ficha de un contacto: la conversación activa con esta
// persona y el historial de las cerradas, de todos los módulos a la vez.
//
// Puede haber MÁS DE UNA conversación activa con el mismo contacto: nada impide
// tener una negociación abierta en MUVET Turnos y otra en MUVET Auxiliar con la
// misma persona al mismo tiempo. Por eso "activa" es una sección y no una sola
// tarjeta.
//
// Se reconsulta por `contactoId` en vez de arrastrar el ítem desde la lista:
// así la pantalla funciona con deep link y tras recargar. Ver
// lib/mensajesUnificados.js.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, ScreenHeader, BottomNav, Avatar } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { fetchConversacionesConContacto, nombreContacto } from '../../lib/mensajesUnificados';
import ItemConversacion from './ItemConversacion';

const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

export default function N34MensajesContacto() {
  const { perfil } = useAuth();
  const { contactoId } = useParams();
  const [contacto, setContacto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!perfil?.id || !contactoId) return undefined;
    let activo = true;
    setLoading(true);
    fetchConversacionesConContacto(perfil.id, perfil.rol, contactoId)
      .then((data) => {
        if (activo) setContacto(data);
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar las conversaciones.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil?.id, perfil?.rol, contactoId]);

  const nombre = contacto ? nombreContacto(contacto.otro) : 'Mensajes';
  const activas = contacto?.conversaciones.filter((c) => c.activa) ?? [];
  const cerradas = contacto?.conversaciones.filter((c) => !c.activa) ?? [];

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader title={nombre} fallbackTo="/mensajes" conCampana />

      <div className="flex flex-1 flex-col gap-3 px-5 py-5 pb-24">
        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

        {!loading && !error && !contacto && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">No tienes conversaciones con esta persona.</p>
          </Card>
        )}

        {!loading && contacto && (
          <>
            <Card className="flex items-center gap-3">
              <Avatar
                fotoUrl={contacto.otro?.foto_url}
                nombre={nombre}
                rol={contacto.otro?.rol}
                semilla={contacto.otro?.id}
                size={44}
              />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#0A1628]">{nombre}</p>
                <p className="text-[12px] text-[#5A6B7A]">{ACTOR_LABEL[contacto.otro?.rol] ?? ''}</p>
              </div>
            </Card>

            {/* Los datos de contacto directo NO se muestran acá: cada módulo los
                revela dentro de su propio hilo y solo tras el acuerdo (D-064 y
                el mismo criterio en D-540). Esta pantalla solo agrupa. */}

            {activas.length > 0 && (
              <>
                <h2 className="mt-1 text-[13px] font-semibold text-[#0A1628]">
                  {activas.length === 1 ? 'Conversación activa' : 'Conversaciones activas'}
                </h2>
                {activas.map((c) => (
                  <ItemConversacion key={c.id} conversacion={c} perfilId={perfil?.id} />
                ))}
              </>
            )}

            {cerradas.length > 0 && (
              <>
                <h2 className="mt-1 text-[13px] font-semibold text-[#0A1628]">Historial</h2>
                {cerradas.map((c) => (
                  <ItemConversacion key={c.id} conversacion={c} perfilId={perfil?.id} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
