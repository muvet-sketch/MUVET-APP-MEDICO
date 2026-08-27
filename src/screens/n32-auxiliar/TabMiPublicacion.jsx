import { useEffect, useState } from 'react';
import { Card, Input, Button, Toggle, Modal } from '../../components/ui';
import { ZONAS_COBERTURA } from '../../lib/municipios';
import {
  SUBTIPOS_SERVICIO,
  TIPO_PUBLICACION_POR_ROL,
  crearPublicacionApoyo,
  actualizarPublicacionApoyo,
  fetchMisPublicacionesApoyo,
  activarPublicacionApoyo,
  desactivarPublicacionApoyo,
  cancelarPublicacionApoyo,
} from '../../lib/apoyo';
import PublicacionApoyoCard from './PublicacionApoyoCard';

function Select({ label, value, onChange, options, placeholder, ayuda }) {
  return (
    <div className="w-full text-left">
      <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628]"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
      {ayuda && <p className="mt-1 text-[11px] text-[#5A6B7A]">{ayuda}</p>}
    </div>
  );
}

// "Mi publicación" de N-32. A diferencia de TabMiOferta (N-26), aquí no hay
// subpestañas de audiencia: el rol ya determina qué se publica —el auxiliar
// ofrece disponibilidad, el médico pide apoyo— y la audiencia es siempre el
// rol complementario.
function PublicacionForm({ perfil, inicial, onGuardada, onCancel, showToast }) {
  const esMedico = perfil.rol === 'medico';
  const [subtipo, setSubtipo] = useState(inicial?.servicio_subtipo ?? SUBTIPOS_SERVICIO[0].value);
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [zona, setZona] = useState(inicial?.zona ?? '');
  const [fecha, setFecha] = useState(inicial?.fecha ?? '');
  const [horaInicio, setHoraInicio] = useState(inicial?.hora_inicio?.slice(0, 5) ?? '');
  const [horaFin, setHoraFin] = useState(inicial?.hora_fin?.slice(0, 5) ?? '');
  const [tarifa, setTarifa] = useState(inicial?.tarifa ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const campos = {
        servicioSubtipo: esMedico ? subtipo : null,
        descripcion,
        zona,
        fecha,
        horaInicio,
        horaFin,
        tarifa: tarifa === '' ? null : Number(tarifa),
      };
      if (inicial) {
        await actualizarPublicacionApoyo(inicial.id, perfil.id, campos);
        showToast('Publicación actualizada.', 'ok');
      } else {
        await crearPublicacionApoyo({ autorId: perfil.id, autorRol: perfil.rol, ...campos });
        showToast('Publicación creada y visible.', 'ok');
      }
      onGuardada();
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la publicación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[14px] font-semibold text-[#0A1628]">
        {inicial ? 'Editar publicación' : esMedico ? 'Solicitar apoyo de un auxiliar' : 'Ofrecer mi disponibilidad'}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {esMedico && (
          <Select
            label="Tipo de servicio"
            value={subtipo}
            onChange={(e) => setSubtipo(e.target.value)}
            options={SUBTIPOS_SERVICIO}
            ayuda={SUBTIPOS_SERVICIO.find((s) => s.value === subtipo)?.ayuda}
          />
        )}

        <Select
          label="Zona"
          value={zona}
          onChange={(e) => setZona(e.target.value)}
          options={ZONAS_COBERTURA}
          placeholder="Selecciona una zona"
        />

        <Input label="Fecha (opcional)" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        <div className="grid grid-cols-2 gap-2">
          <Input label="Desde" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          <Input label="Hasta" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        </div>

        <Input
          label="Tarifa (COP, opcional)"
          type="number"
          min="0"
          value={tarifa}
          onChange={(e) => setTarifa(e.target.value)}
        />

        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Descripción</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder={
              esMedico
                ? 'Qué tarea necesitas, con qué especie, qué debe llevar el auxiliar.'
                : 'Tu experiencia, en qué procedimientos apoyas, tu disponibilidad.'
            }
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <p className="mt-1 text-[11px] text-[#5A6B7A]">
            No incluyas teléfonos ni direcciones: la coordinación va por el chat y el punto de
            encuentro se comparte al llegar a un acuerdo.
          </p>
        </div>

        {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Publicar'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function TabMiPublicacion({ perfil, showToast }) {
  const [publicaciones, setPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrandoForm, setMostrandoForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cancelando, setCancelando] = useState(null);

  const esMedico = perfil.rol === 'medico';
  const puedePublicar = Boolean(TIPO_PUBLICACION_POR_ROL[perfil.rol]);

  async function cargar() {
    setLoading(true);
    try {
      setPublicaciones(await fetchMisPublicacionesApoyo(perfil.id));
    } catch {
      setPublicaciones([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (perfil?.id) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);

  async function handleToggle(publicacion) {
    try {
      if (publicacion.activa) {
        await desactivarPublicacionApoyo(publicacion.id, perfil.id);
      } else {
        await activarPublicacionApoyo(publicacion.id, perfil.id);
      }
      cargar();
    } catch (err) {
      showToast(err.message ?? 'No se pudo cambiar la publicación.', 'critical');
    }
  }

  async function handleCancelar() {
    try {
      await cancelarPublicacionApoyo(cancelando.id, perfil.id);
      showToast('Publicación cancelada.', 'ok');
      setCancelando(null);
      cargar();
    } catch (err) {
      showToast(err.message ?? 'No se pudo cancelar.', 'critical');
    }
  }

  if (!puedePublicar) {
    return (
      <div className="px-5 py-4">
        <Card className="text-center text-[13px] text-[#5A6B7A]">
          Tu rol no publica en este módulo.
        </Card>
      </div>
    );
  }

  if (loading) {
    return <p className="px-5 py-5 text-[12px] text-[#5A6B7A]">Cargando…</p>;
  }

  const abiertas = publicaciones.filter((p) => p.estado === 'abierta');
  const cerradas = publicaciones.filter((p) => p.estado !== 'abierta');

  return (
    <div className="flex flex-col gap-3 px-5 py-4 pb-24">
      {(mostrandoForm || editando) && (
        <PublicacionForm
          perfil={perfil}
          inicial={editando}
          showToast={showToast}
          onGuardada={() => {
            setMostrandoForm(false);
            setEditando(null);
            cargar();
          }}
          onCancel={() => {
            setMostrandoForm(false);
            setEditando(null);
          }}
        />
      )}

      {!mostrandoForm && !editando && (
        <Button onClick={() => setMostrandoForm(true)}>
          {esMedico ? '+ Solicitar apoyo' : '+ Ofrecer disponibilidad'}
        </Button>
      )}

      {abiertas.map((p) => (
        <PublicacionApoyoCard key={p.id} publicacion={p}>
          <div className="flex flex-col gap-2 border-t border-[#E1E8ED] pt-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-[#0A1628]">
                {p.activa ? 'Visible para la otra parte' : 'Pausada'}
              </span>
              <Toggle
                checked={p.activa}
                onChange={() => handleToggle(p)}
                label={p.activa ? 'Pausar publicación' : 'Publicar'}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" fullWidth={false} className="!w-auto flex-1 px-3 py-2 text-[13px]" onClick={() => setEditando(p)}>
                Editar
              </Button>
              <Button variant="danger" fullWidth={false} className="!w-auto px-3 py-2 text-[13px]" onClick={() => setCancelando(p)}>
                Cancelar
              </Button>
            </div>
          </div>
        </PublicacionApoyoCard>
      ))}

      {abiertas.length === 0 && !mostrandoForm && !editando && (
        <Card className="text-center text-[13px] text-[#5A6B7A]">
          {esMedico
            ? 'No tienes ninguna solicitud de apoyo publicada.'
            : 'No has publicado tu disponibilidad todavía.'}
        </Card>
      )}

      {cerradas.length > 0 && (
        <>
          <p className="mt-2 text-[12px] font-semibold text-[#5A6B7A]">Cerradas</p>
          {cerradas.map((p) => (
            <PublicacionApoyoCard key={p.id} publicacion={p} />
          ))}
        </>
      )}

      <Modal open={Boolean(cancelando)} onClose={() => setCancelando(null)} title="Cancelar publicación">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#0A1628]">
            La publicación se cierra de forma permanente y las conversaciones que sigan abiertas se
            descartan. Los servicios ya acordados no se tocan.
          </p>
          <Button variant="danger" onClick={handleCancelar}>
            Sí, cancelar
          </Button>
          <Button variant="ghost" onClick={() => setCancelando(null)}>
            Volver
          </Button>
        </div>
      </Modal>
    </div>
  );
}
