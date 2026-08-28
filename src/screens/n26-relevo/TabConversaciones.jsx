// N-26 · MUVET Turnos — bandeja de conversaciones (reemplaza a TabMensajes).
//
// OJO: el identificador interno de este módulo sigue siendo `relevo` (ruta
// /relevo, lib/relevo.js, tablas relevo_*) pero de cara al usuario se llama
// "MUVET Turnos". Ver el bloque de lib/nombresModulos.js.
//
// Antes esta pestaña listaba los mensajes recibidos sobre mis publicaciones,
// solo de lectura y sin poder responder (D-540 original), y las postulaciones
// que yo había enviado vivían aparte, en "Mi Oferta › Mis postulaciones", sin
// mostrar nunca la respuesta del otro. Con el modelo de 0027 los dos lados son
// la misma cosa —una conversación— así que se listan juntos y ordenados por
// actividad.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Avatar } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import { fetchMisConversaciones, tieneNoLeidos, esParteAutora } from '../../lib/relevo';
import { NOMBRE_TURNOS } from '../../lib/nombresModulos';

const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

// "Turno confirmado" y no "Relevo confirmado": tras el cambio de nombres,
// "MUVET Relevo" es el OTRO módulo (médico↔médico, N-30). Dentro de Turnos el
// acuerdo cerrado es un turno. Los identificadores internos siguen diciendo
// `relevo` (ver lib/nombresModulos.js).
const ESTADO_BADGE = {
  abierta: { label: 'En conversación', tone: 'info' },
  aceptada: { label: 'Turno confirmado', tone: 'ok' },
  descartada: { label: 'Descartada', tone: 'critical' },
};

// Mismo patrón de chips que /notificaciones y /historial.
const FILTROS = [
  { value: '', label: 'Todas' },
  { value: 'abierta', label: 'Abiertas' },
  { value: 'cerrada', label: 'Cerradas' },
];

export default function TabConversaciones({ perfil }) {
  const navigate = useNavigate();
  const [conversaciones, setConversaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    let activo = true;
    setLoading(true);
    fetchMisConversaciones(perfil.id)
      .then((data) => {
        if (activo) setConversaciones(data);
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar tus conversaciones.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil.id]);

  const visibles = conversaciones.filter((c) => {
    if (filtro === 'abierta') return c.estado === 'abierta';
    if (filtro === 'cerrada') return c.estado !== 'abierta';
    return true;
  });

  return (
    <div className="flex flex-col gap-3 px-5 py-5 pb-24">
      <p className="text-[12px] text-[#5A6B7A]">
        Tus conversaciones de {NOMBRE_TURNOS}: las que abriste sobre ofertas de otros y las que recibiste sobre las
        tuyas.
      </p>

      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value || 'todas'}
            type="button"
            onClick={() => setFiltro(f.value)}
            className={`flex-1 whitespace-nowrap rounded-[10px] border px-1 py-2 text-[11px] ${
              filtro === f.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && visibles.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">
          {conversaciones.length === 0
            ? 'Aún no tienes conversaciones. Contacta una oferta desde la pestaña "Ofertas".'
            : 'Sin conversaciones en este filtro.'}
        </Card>
      )}

      {!loading &&
        visibles.map((c) => {
          const nombreOtro = c.otro?.razon_social || c.otro?.nombre_completo || 'Usuario MUVET';
          const estado = ESTADO_BADGE[c.estado] ?? ESTADO_BADGE.abierta;
          const noLeido = tieneNoLeidos(c, perfil.id);
          const soyAutora = esParteAutora(c, perfil.id);
          // Qué falta para cerrar: es la información más útil de la tarjeta
          // cuando la conversación sigue abierta.
          const miAcuerdo = soyAutora ? c.acuerdo_autor : c.acuerdo_interesado;
          const suAcuerdo = soyAutora ? c.acuerdo_interesado : c.acuerdo_autor;

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/relevo/conversacion/${c.id}`)}
              className="w-full text-left"
            >
              <Card className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar fotoUrl={c.otro?.foto_url} nombre={nombreOtro} size={28} />
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0A1628]">
                      {noLeido && <span className="h-2 w-2 rounded-full bg-[#C63B3B]" aria-label="Sin leer" />}
                      {nombreOtro}
                    </p>
                  </div>
                  <Badge tone={estado.tone}>{estado.label}</Badge>
                </div>
                <p className="text-[11px] text-[#5A6B7A]">
                  {ACTOR_LABEL[c.otro?.rol] ?? ''}
                  {soyAutora ? ' · sobre tu oferta' : ' · su oferta'}
                </p>
                <p className="text-[12px] text-[#5A6B7A]">
                  Sobre: {c.publicacion?.descripcion || '(sin descripción)'}
                </p>
                {c.estado === 'abierta' && (
                  <p className="text-[11px] text-[#5A6B7A]">
                    {miAcuerdo && !suAcuerdo && 'Esperando la confirmación de la otra parte.'}
                    {!miAcuerdo && suAcuerdo && (
                      <span className="font-medium text-[#1A7A5E]">Ya está de acuerdo · falta tu confirmación.</span>
                    )}
                    {!miAcuerdo && !suAcuerdo && 'Aclarando detalles.'}
                  </p>
                )}
                <p className="text-[11px] text-[#5A6B7A]">{formatFechaCorta(c.ultimo_mensaje_at)}</p>
              </Card>
            </button>
          );
        })}
    </div>
  );
}
