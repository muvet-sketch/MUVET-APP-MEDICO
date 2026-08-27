import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Card } from '../../components/ui';
import {
  SUBTIPOS_SERVICIO,
  fetchPublicacionesDisponibles,
  fetchMisConversacionesApoyo,
  filtrarPorZona,
  iniciarConversacionApoyo,
} from '../../lib/apoyo';
import PublicacionApoyoCard from './PublicacionApoyoCard';

// Tablón de N-32: cada rol ve las publicaciones del rol complementario.
//   médico   → auxiliares que ofrecen disponibilidad
//   auxiliar → médicos que buscan apoyo (con el subtipo ya definido)
//
// Cuando el médico contacta a un auxiliar disponible, TIENE que elegir el
// subtipo de servicio: la publicación del auxiliar no lo trae, porque el
// auxiliar ofrece su tiempo, no un servicio concreto. Cuando el auxiliar
// contacta a un médico, el subtipo ya viene en la publicación y no se pregunta.
export default function TabDisponibles({ perfil, showToast }) {
  const navigate = useNavigate();
  const [publicaciones, setPublicaciones] = useState([]);
  const [conversacionesPorPublicacion, setConversacionesPorPublicacion] = useState({});
  const [loading, setLoading] = useState(true);
  const [contactando, setContactando] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [subtipo, setSubtipo] = useState(SUBTIPOS_SERVICIO[0].value);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const esMedico = perfil.rol === 'medico';

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let activo = true;

    Promise.all([
      fetchPublicacionesDisponibles({ paraRol: perfil.rol, excluirAutorId: perfil.id }),
      fetchMisConversacionesApoyo(perfil.id),
    ])
      .then(([pubs, conversaciones]) => {
        if (!activo) return;
        setPublicaciones(filtrarPorZona(pubs, perfil.zona_cobertura));
        setConversacionesPorPublicacion(
          Object.fromEntries((conversaciones ?? []).map((c) => [c.publicacion_id, c.id])),
        );
      })
      .catch(() => {
        if (activo) setPublicaciones([]);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [perfil?.id, perfil?.rol, perfil?.zona_cobertura]);

  function abrirContacto(publicacion) {
    setContactando(publicacion);
    setMensaje('');
    setError('');
    // Si la publicación ya trae subtipo (la publicó el médico), no se pregunta.
    setSubtipo(publicacion.servicio_subtipo ?? SUBTIPOS_SERVICIO[0].value);
  }

  async function handleContactar() {
    if (!mensaje.trim()) {
      setError('Escribe un mensaje para iniciar la conversación.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const conversacion = await iniciarConversacionApoyo({
        publicacionId: contactando.id,
        interesadoId: perfil.id,
        // Solo se manda cuando la publicación no lo define; si lo define, el
        // trigger de 0028 ignora lo que llegue del cliente.
        servicioSubtipo: contactando.servicio_subtipo ?? subtipo,
        mensaje,
      });
      setContactando(null);
      navigate(`/apoyo/conversacion/${conversacion.id}`);
    } catch (err) {
      setError(err.message ?? 'No se pudo iniciar la conversación.');
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return <p className="px-5 py-5 text-[12px] text-[#5A6B7A]">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-4 pb-24">
      {publicaciones.length === 0 && (
        <Card className="text-center text-[13px] text-[#5A6B7A]">
          {esMedico
            ? 'Todavía no hay auxiliares disponibles en tus zonas.'
            : 'Todavía no hay médicos buscando apoyo en tus zonas.'}
        </Card>
      )}

      {publicaciones.map((p) => {
        const conversacionId = conversacionesPorPublicacion[p.id];
        return (
          <PublicacionApoyoCard key={p.id} publicacion={p}>
            {conversacionId ? (
              <button
                type="button"
                onClick={() => navigate(`/apoyo/conversacion/${conversacionId}`)}
                className="text-left text-[13px] font-medium text-[#1A7A5E]"
              >
                Ver conversación →
              </button>
            ) : (
              <Button variant="secondary" onClick={() => abrirContacto(p)}>
                Contactar
              </Button>
            )}
          </PublicacionApoyoCard>
        );
      })}

      <Modal open={Boolean(contactando)} onClose={() => setContactando(null)} title="Iniciar conversación">
        <div className="flex flex-col gap-3">
          {/* El médico elige aquí para qué necesita al auxiliar. El auxiliar no
              ve este selector: el subtipo ya viene en la oferta del médico. */}
          {contactando && !contactando.servicio_subtipo && (
            <div className="w-full text-left">
              <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
                ¿Para qué necesitas al auxiliar?
              </label>
              <select
                value={subtipo}
                onChange={(e) => setSubtipo(e.target.value)}
                className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628]"
              >
                {SUBTIPOS_SERVICIO.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#5A6B7A]">
                {SUBTIPOS_SERVICIO.find((s) => s.value === subtipo)?.ayuda}
              </p>
            </div>
          )}

          <div className="w-full text-left">
            <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Mensaje</label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={4}
              placeholder="Preséntate y cuenta qué necesitas coordinar."
              className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
            />
          </div>

          <p className="text-[11px] text-[#5A6B7A]">
            Toda la coordinación ocurre por este chat. El punto de encuentro se comparte cuando ambos
            estén de acuerdo.
          </p>

          {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

          <Button disabled={enviando} onClick={handleContactar}>
            {enviando ? 'Enviando…' : 'Enviar y abrir conversación'}
          </Button>
          <Button variant="ghost" onClick={() => setContactando(null)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
