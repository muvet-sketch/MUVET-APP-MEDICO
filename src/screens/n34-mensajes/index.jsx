// N-34 · Mensajes — bandeja unificada, un ítem por PERSONA.
//
// Los tres módulos gremiales ya tienen su propia bandeja (N-26 › Conversaciones,
// N-30 › Mis Solicitudes, N-32 › Conversaciones) y N-9 agrega lo cerrado de los
// tres en orden cronológico. Lo que faltaba —y es lo que se pidió— es la vista
// por CONTACTO: con quién he hablado, sin importar por qué módulo, y qué tengo
// vivo con cada uno.
//
// No hay pantalla de chat nueva: cada conversación se abre en el hilo de su
// propio módulo, que es donde viven sus acciones (acuerdo, finalizar, adjuntos,
// dirección de encuentro). Ver lib/mensajesUnificados.js para la agregación.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, ScreenHeader, BottomNav, Avatar, Badge } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { formatFechaCorta } from '../../lib/format';
import { fetchContactosConMensajes, nombreContacto, MODULOS_MENSAJES } from '../../lib/mensajesUnificados';

const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

// Los módulos por los que he hablado con esta persona, sin repetir y en el
// orden en que aparecen sus conversaciones (la más reciente primero).
function modulosDe(contacto) {
  const vistos = [];
  contacto.conversaciones.forEach((c) => {
    if (!vistos.includes(c.origen)) vistos.push(c.origen);
  });
  return vistos;
}

export default function N34Mensajes() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;
    setLoading(true);
    fetchContactosConMensajes(perfil.id, perfil.rol)
      .then((data) => {
        if (activo) setContactos(data);
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar tus mensajes.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil?.id, perfil?.rol]);

  return (
    <div className="flex min-h-svh flex-col">
      <ScreenHeader
        title="Mensajes"
        fallbackTo={perfil?.rol === 'medico' ? '/home' : '/home-simplificado'}
        conCampana
      />

      <div className="flex flex-1 flex-col gap-3 px-5 py-5 pb-24">
        <p className="text-[12px] text-[#5A6B7A]">
          Las personas con las que has conversado en MUVET. Entra a una para ver su conversación activa y las
          anteriores.
        </p>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
        {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

        {!loading && !error && contactos.length === 0 && (
          <Card>
            <p className="text-[13px] text-[#5A6B7A]">
              Todavía no has conversado con nadie. Las conversaciones nacen al contactar una oferta o al ofrecerte a
              cubrir un servicio.
            </p>
          </Card>
        )}

        {!loading &&
          contactos.map((contacto) => {
            const nombre = nombreContacto(contacto.otro);
            return (
              <button
                key={contacto.id}
                type="button"
                onClick={() => navigate(`/mensajes/${contacto.id}`)}
                className="w-full text-left"
              >
                <Card className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar
                        fotoUrl={contacto.otro?.foto_url}
                        nombre={nombre}
                        rol={contacto.otro?.rol}
                        semilla={contacto.otro?.id}
                        size={36}
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0A1628]">
                          {contacto.noLeido && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-[#C63B3B]" aria-label="Sin leer" />
                          )}
                          <span className="truncate">{nombre}</span>
                        </p>
                        <p className="text-[11px] text-[#5A6B7A]">{ACTOR_LABEL[contacto.otro?.rol] ?? ''}</p>
                      </div>
                    </div>
                    {contacto.activas > 0 && (
                      <Badge tone="ok">
                        {contacto.activas === 1 ? 'Activa' : `${contacto.activas} activas`}
                      </Badge>
                    )}
                  </div>

                  <p className="text-[12px] text-[#5A6B7A]">
                    {modulosDe(contacto)
                      .map((origen) => `${MODULOS_MENSAJES[origen].icono} ${MODULOS_MENSAJES[origen].label}`)
                      .join(' · ')}
                  </p>
                  <p className="text-[11px] text-[#5A6B7A]">
                    {contacto.conversaciones.length === 1
                      ? '1 conversación'
                      : `${contacto.conversaciones.length} conversaciones`}
                    {contacto.ultimaActividad ? ` · ${formatFechaCorta(contacto.ultimaActividad)}` : ''}
                  </p>
                </Card>
              </button>
            );
          })}
      </div>

      <BottomNav />
    </div>
  );
}
