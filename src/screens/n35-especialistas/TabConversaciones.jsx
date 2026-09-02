import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Avatar } from '../../components/ui';
import { formatFechaCorta } from '../../lib/format';
import {
  fetchMisConversacionesEspecialista,
  tieneNoLeidosEspecialista,
  esParteAutora,
  asuntoConversacion,
} from '../../lib/especialistas';

// Bandeja del módulo: las conversaciones de los DOS lados y de las DOS mitades,
// ordenadas por actividad. `origen` solo cambia la línea de contexto — la
// negociación es la misma.
const ESTADO_BADGE = {
  abierta: { label: 'En conversación', tone: 'info' },
  aceptada: { label: 'Servicio confirmado', tone: 'ok' },
  finalizada: { label: 'Servicio finalizado', tone: 'neutral' },
  descartada: { label: 'Descartada', tone: 'critical' },
};

const FILTROS = [
  { value: '', label: 'Todas' },
  { value: 'activa', label: 'Activas' },
  { value: 'cerrada', label: 'Cerradas' },
];

const ACTIVAS = ['abierta', 'aceptada'];

export default function TabConversaciones({ perfil }) {
  const navigate = useNavigate();
  const [conversaciones, setConversaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    let activo = true;
    setLoading(true);
    fetchMisConversacionesEspecialista(perfil.id)
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
    if (filtro === 'activa') return ACTIVAS.includes(c.estado);
    if (filtro === 'cerrada') return !ACTIVAS.includes(c.estado);
    return true;
  });

  return (
    <div className="flex flex-col gap-3 px-5 py-5 pb-24">
      <p className="text-[12px] text-[#5A6B7A]">
        Tus conversaciones de MUVET Especialistas: las que abriste desde el directorio o el tablón, y las que
        recibiste.
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
            ? 'Aún no tienes conversaciones. Contacta a un especialista desde el directorio.'
            : 'Sin conversaciones en este filtro.'}
        </Card>
      )}

      {!loading &&
        visibles.map((c) => {
          const nombreOtro = c.otro?.nombre_completo || c.otro?.razon_social || 'Usuario MUVET';
          const estado = ESTADO_BADGE[c.estado] ?? ESTADO_BADGE.abierta;
          const noLeido = tieneNoLeidosEspecialista(c, perfil.id);
          const soyAutora = esParteAutora(c, perfil.id);
          const miAcuerdo = soyAutora ? c.acuerdo_autor : c.acuerdo_interesado;
          const suAcuerdo = soyAutora ? c.acuerdo_interesado : c.acuerdo_autor;

          // Quién es quién en cada mitad: en el directorio el "autor" es el
          // especialista contactado (aunque no publicó nada); en el tablón es
          // quien publicó la oferta.
          const contexto =
            c.origen === 'directorio'
              ? soyAutora
                ? 'Te contactó desde el directorio'
                : 'Lo contactaste desde el directorio'
              : soyAutora
                ? 'Respondió tu oferta'
                : 'Respondiste su oferta';

          return (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/especialistas/conversacion/${c.id}`)}
              className="w-full text-left"
            >
              <Card className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      fotoUrl={c.otro?.foto_url}
                      nombre={nombreOtro}
                      rol={c.otro?.rol}
                      semilla={c.otro?.id}
                      size={28}
                    />
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0A1628]">
                      {noLeido && <span className="h-2 w-2 rounded-full bg-[#C63B3B]" aria-label="Sin leer" />}
                      {nombreOtro}
                    </p>
                  </div>
                  <Badge tone={estado.tone}>{estado.label}</Badge>
                </div>

                <p className="text-[11px] text-[#5A6B7A]">{contexto}</p>
                <p className="text-[12px] text-[#5A6B7A]">Sobre: {asuntoConversacion(c)}</p>

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
