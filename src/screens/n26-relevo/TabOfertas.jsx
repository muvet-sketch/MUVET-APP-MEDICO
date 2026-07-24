import { useEffect, useState } from 'react';
import { Card, Badge, Input, Button, Modal, Toast } from '../../components/ui';
import { fetchPublicacionesActivas, enviarMensaje } from '../../lib/relevo';

const ACTOR_BADGE = {
  clinica: { label: '🏥 Clínica Veterinaria', tone: 'info' },
  auxiliar: { label: '🧰 Auxiliar', tone: 'neutral' },
  medico: { label: '🩺 Médico', tone: 'neutral' },
};

const TIPO_OPCIONES = [
  { value: '', label: 'Todas' },
  { value: 'ofrezco', label: 'Ofrecen disponibilidad' },
  { value: 'busco', label: 'Buscan médico/auxiliar' },
];

export default function TabOfertas({ perfil, rolInicial, tipoInicial }) {
  const [zona, setZona] = useState('');
  const [tipo, setTipo] = useState(tipoInicial || '');
  const [rolActor, setRolActor] = useState(rolInicial || '');
  const [publicaciones, setPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aceptando, setAceptando] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function cargar() {
    setLoading(true);
    try {
      const data = await fetchPublicacionesActivas({ tipo: tipo || undefined, zona: zona || undefined });
      setPublicaciones(data.filter((p) => p.autor_id !== perfil.id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const visibles = publicaciones.filter((p) => {
    if (!rolActor) return true;
    if (p.tipo === 'ofrezco') return p.autor?.rol === rolActor;
    return p.rol_objetivo === rolActor;
  });

  async function handleAceptar(e) {
    e.preventDefault();
    if (!aceptando) return;
    setEnviando(true);
    try {
      // D-540: sigue siendo un mensaje único de contacto, no un hilo — "Aceptar
      // oferta" crea la solicitud (estado 'pendiente'); el dueño la confirma
      // desde "Mi Oferta" (0011: columna `estado` en relevo_mensajes).
      await enviarMensaje({
        publicacionId: aceptando.id,
        remitenteId: perfil.id,
        mensaje: mensaje.trim() || 'He aceptado tu oferta en MUVET Relevo.',
      });
      setAceptando(null);
      setMensaje('');
      showToast('Oferta aceptada. Queda pendiente de confirmación del autor.', 'ok');
    } catch {
      showToast('No se pudo aceptar la oferta.', 'critical');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <div className="flex flex-col gap-2">
        <Input
          label="Zona / Ciudad"
          placeholder="Filtrar ofertas por zona o ciudad"
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          onBlur={cargar}
        />

        <div className="flex gap-2">
          {TIPO_OPCIONES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTipo(o.value)}
              className={`flex-1 rounded-[10px] border px-2 py-2 text-[11px] ${
                tipo === o.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {['', 'medico', 'auxiliar', 'clinica'].map((r) => (
            <button
              key={r || 'todos'}
              type="button"
              onClick={() => setRolActor(r)}
              className={`flex-1 rounded-[10px] border px-2 py-2 text-[11px] ${
                rolActor === r ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
              }`}
            >
              {r ? ACTOR_BADGE[r].label : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
      {!loading && visibles.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">Sin ofertas disponibles en esta zona.</Card>
      )}

      {!loading &&
        visibles.map((p) => {
          const badge = ACTOR_BADGE[p.autor?.rol] ?? ACTOR_BADGE.medico;
          const nombreAutor = p.autor?.razon_social || p.autor?.nombre_completo || 'Usuario MUVET';
          return (
            <Card key={p.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] font-semibold text-[#0A1628]">{nombreAutor}</p>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </div>
              <p className="text-[13px] text-[#0A1628]">{p.descripcion || '(sin descripción)'}</p>
              <p className="text-[12px] text-[#5A6B7A]">
                {p.tipo === 'ofrezco' ? 'Ofrece disponibilidad' : `Busca ${p.rol_objetivo === 'auxiliar' ? 'auxiliar' : 'médico'}`}
                {p.zona ? ` · ${p.zona}` : ''}
                {p.tipo_jornada ? ` · ${p.tipo_jornada}` : ''}
              </p>
              <Button variant="secondary" fullWidth={false} className="!w-auto px-3 py-2 text-[12px]" onClick={() => setAceptando(p)}>
                Aceptar oferta
              </Button>
            </Card>
          );
        })}

      <Modal open={Boolean(aceptando)} onClose={() => setAceptando(null)} title="Aceptar oferta">
        <form onSubmit={handleAceptar} className="flex flex-col gap-3">
          <p className="text-[12px] text-[#5A6B7A]">
            Mensaje único de contacto — sin chat en tiempo real (D-540). El autor de la oferta verá tu solicitud en su
            sección "Solicitudes recibidas" y deberá confirmarla.
          </p>
          <textarea
            rows={4}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Mensaje (opcional)…"
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Aceptar oferta'}
          </Button>
        </form>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
