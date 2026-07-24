import { useEffect, useState } from 'react';
import { Card, Badge, Input, Button, Toggle, Modal, Toast } from '../../components/ui';
import {
  crearPublicacion,
  actualizarPublicacion,
  fetchMisPublicaciones,
  activarPublicacion,
  desactivarPublicacion,
  fetchMensajesRecibidos,
  enviarMensaje,
  aceptarSolicitud,
} from '../../lib/relevo';

const TIPO_JORNADA = ['Medio día', 'Día completo', 'Varios días'];
const ROL_LABEL = { medico: 'Médico', auxiliar: 'Auxiliar', clinica: 'Clínica' };
const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };
const ESTADO_BADGE = {
  pendiente: { label: 'Pendiente', tone: 'alert' },
  aceptada: { label: 'Aceptada', tone: 'ok' },
  rechazada: { label: 'Rechazada', tone: 'critical' },
};

function OfertaForm({ perfil, initial, onSaved, onCancel, showToast }) {
  const esClinica = perfil.rol === 'clinica';
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '');
  const [zona, setZona] = useState(initial?.zona ?? perfil.zona_cobertura ?? '');
  const [fechaInicio, setFechaInicio] = useState(initial?.fecha_inicio ?? '');
  const [fechaFin, setFechaFin] = useState(initial?.fecha_fin ?? '');
  const [tipoJornada, setTipoJornada] = useState(initial?.tipo_jornada ?? TIPO_JORNADA[0]);
  const [rolObjetivo, setRolObjetivo] = useState(initial?.rol_objetivo ?? 'medico');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (initial) {
        await actualizarPublicacion(initial.id, perfil.id, { descripcion, zona, fechaInicio, fechaFin, tipoJornada });
        showToast('Oferta actualizada.', 'ok');
      } else {
        await crearPublicacion({
          autorId: perfil.id,
          autorRol: perfil.rol,
          tipo: esClinica ? 'busco' : 'ofrezco',
          rolObjetivo: esClinica ? rolObjetivo : null,
          descripcion,
          zona,
          fechaInicio,
          fechaFin,
          tipoJornada,
        });
        showToast('Oferta publicada.', 'ok');
      }
      onSaved();
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la oferta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">
        {esClinica ? 'Busco médico/auxiliar' : 'Ofrezco disponibilidad'}
      </p>

      {esClinica && (
        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Buscas</label>
          <div className="flex gap-2">
            {['medico', 'auxiliar'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRolObjetivo(r)}
                disabled={Boolean(initial)}
                className={`flex-1 rounded-[10px] border px-3 py-2 text-[13px] disabled:opacity-50 ${
                  rolObjetivo === r ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
                }`}
              >
                {ROL_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full text-left">
        <label htmlFor="descripcion" className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
          Descripción
        </label>
        <textarea
          id="descripcion"
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
        />
      </div>

      <Input label="Zona / Ciudad" value={zona} onChange={(e) => setZona(e.target.value)} />

      <div className="flex gap-2">
        <Input label="Desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        <Input label="Hasta" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
      </div>

      <div className="w-full text-left">
        <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Jornada</label>
        <div className="flex gap-2">
          {TIPO_JORNADA.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoJornada(t)}
              className={`flex-1 rounded-[10px] border px-2 py-2 text-[12px] ${
                tipoJornada === t ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <div className="flex gap-2">
        {initial && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Publicar'}
        </Button>
      </div>
    </form>
  );
}

export default function TabMiOferta({ perfil }) {
  const [misPublicaciones, setMisPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true);
  const [detalle, setDetalle] = useState(null);
  const [respondiendo, setRespondiendo] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function cargarMiOferta() {
    setLoading(true);
    try {
      const data = await fetchMisPublicaciones(perfil.id);
      setMisPublicaciones(data);
    } finally {
      setLoading(false);
    }
  }

  async function cargarSolicitudes() {
    setLoadingSolicitudes(true);
    try {
      const data = await fetchMensajesRecibidos(perfil.id);
      // Excluye las respuestas que yo mismo envié como dueño de la oferta —
      // fetchMensajesRecibidos filtra por publicación, no por remitente.
      setSolicitudes(data.filter((m) => m.remitente_id !== perfil.id));
    } finally {
      setLoadingSolicitudes(false);
    }
  }

  useEffect(() => {
    cargarMiOferta();
    cargarSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  const miOferta = misPublicaciones[0] ?? null;

  async function handleToggle(activa) {
    if (!miOferta) return;
    setToggling(true);
    try {
      if (activa) {
        await activarPublicacion(miOferta.id, perfil.id);
        showToast('Oferta publicada.', 'ok');
      } else {
        await desactivarPublicacion(miOferta.id, perfil.id);
        showToast('Oferta desactivada.', 'ok');
      }
      await cargarMiOferta();
    } catch {
      showToast('No se pudo actualizar la oferta.', 'critical');
    } finally {
      setToggling(false);
    }
  }

  async function handleResponder(e) {
    e.preventDefault();
    if (!respondiendo || !respuesta.trim()) return;
    setEnviando(true);
    try {
      await enviarMensaje({ publicacionId: respondiendo.publicacion_id, remitenteId: perfil.id, mensaje: respuesta.trim() });
      setRespondiendo(null);
      setRespuesta('');
      showToast('Mensaje enviado.', 'ok');
    } catch {
      showToast('No se pudo enviar el mensaje.', 'critical');
    } finally {
      setEnviando(false);
    }
  }

  async function handleAceptar(id) {
    try {
      await aceptarSolicitud(id);
      showToast('Solicitud aceptada.', 'ok');
      await cargarSolicitudes();
    } catch {
      showToast('No se pudo aceptar la solicitud.', 'critical');
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && (!miOferta || editando) && (
        <OfertaForm
          perfil={perfil}
          initial={editando ? miOferta : null}
          onCancel={() => setEditando(false)}
          onSaved={async () => {
            setEditando(false);
            await cargarMiOferta();
          }}
          showToast={showToast}
        />
      )}

      {!loading && miOferta && !editando && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#0A1628]">Mi oferta</p>
            <Badge tone={miOferta.activa ? 'ok' : 'neutral'}>{miOferta.activa ? 'Publicada' : 'No publicada'}</Badge>
          </div>
          <p className="text-[13px] text-[#0A1628]">{miOferta.descripcion || '(sin descripción)'}</p>
          <p className="text-[12px] text-[#5A6B7A]">
            {miOferta.tipo === 'ofrezco'
              ? 'Ofrezco disponibilidad'
              : `Busco ${miOferta.rol_objetivo === 'auxiliar' ? 'auxiliar' : 'médico'}`}
            {miOferta.zona ? ` · ${miOferta.zona}` : ''}
            {miOferta.tipo_jornada ? ` · ${miOferta.tipo_jornada}` : ''}
          </p>

          <div className="mt-1 flex items-center justify-between gap-2 border-t border-[#E1E8ED] pt-3">
            <span className="text-[12px] font-medium text-[#5A6B7A]">Hacer pública mi oferta</span>
            <Toggle checked={miOferta.activa} onChange={handleToggle} disabled={toggling} label="Publicar oferta" />
          </div>

          <Button variant="outline" fullWidth={false} className="!w-auto self-start px-3 py-2 text-[12px]" onClick={() => setEditando(true)}>
            Editar oferta
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold text-[#5A6B7A]">Solicitudes recibidas</p>
        {loadingSolicitudes && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
        {!loadingSolicitudes && solicitudes.length === 0 && (
          <Card className="text-center text-[12px] text-[#5A6B7A]">Aún no tienes solicitudes.</Card>
        )}
        {!loadingSolicitudes &&
          solicitudes.map((m) => {
            const nombreRemitente = m.remitente?.razon_social || m.remitente?.nombre_completo || 'Usuario MUVET';
            const estado = ESTADO_BADGE[m.estado] ?? ESTADO_BADGE.pendiente;
            return (
              <Card key={m.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[#0A1628]">{nombreRemitente}</p>
                  <Badge tone={estado.tone}>{estado.label}</Badge>
                </div>
                <p className="text-[11px] text-[#5A6B7A]">{ACTOR_LABEL[m.remitente?.rol] ?? ''}</p>
                <p className="truncate text-[13px] text-[#0A1628]">{m.mensaje}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" fullWidth={false} className="!w-auto px-2 py-1 text-[12px]" onClick={() => setDetalle(m)}>
                    Ver detalles
                  </Button>
                  <Button
                    variant="outline"
                    fullWidth={false}
                    className="!w-auto px-2 py-1 text-[12px]"
                    onClick={() => setRespondiendo(m)}
                  >
                    Enviar mensaje
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    className="!w-auto px-2 py-1 text-[12px]"
                    disabled={m.estado === 'aceptada'}
                    onClick={() => handleAceptar(m.id)}
                  >
                    {m.estado === 'aceptada' ? 'Aceptada' : 'Aceptar oferta'}
                  </Button>
                </div>
              </Card>
            );
          })}
      </div>

      <Modal open={Boolean(detalle)} onClose={() => setDetalle(null)} title="Detalle de la solicitud">
        {detalle && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-[#0A1628]">
              {detalle.remitente?.razon_social || detalle.remitente?.nombre_completo || 'Usuario MUVET'}
            </p>
            <p className="text-[12px] text-[#5A6B7A]">{ACTOR_LABEL[detalle.remitente?.rol] ?? ''}</p>
            {detalle.remitente?.telefono && <p className="text-[12px] text-[#5A6B7A]">Tel: {detalle.remitente.telefono}</p>}
            <p className="text-[12px] text-[#5A6B7A]">Sobre: {detalle.publicacion?.descripcion || '(sin descripción)'}</p>
            <p className="text-[14px] text-[#0A1628]">{detalle.mensaje}</p>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(respondiendo)} onClose={() => setRespondiendo(null)} title="Enviar mensaje">
        <form onSubmit={handleResponder} className="flex flex-col gap-3">
          <p className="text-[12px] text-[#5A6B7A]">Mensaje único de contacto — sin chat en tiempo real (D-540).</p>
          <textarea
            rows={4}
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            placeholder="Escribe tu mensaje…"
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Button type="submit" disabled={enviando || !respuesta.trim()}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
