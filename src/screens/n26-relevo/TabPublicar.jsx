import { useEffect, useState } from 'react';
import { Card, Input, Button, Toast } from '../../components/ui';
import { crearPublicacion, fetchMisPublicaciones, desactivarPublicacion } from '../../lib/relevo';

const TIPO_JORNADA = ['Medio día', 'Día completo', 'Varios días'];

const ROL_LABEL = { medico: 'Médico', auxiliar: 'Auxiliar', clinica: 'Clínica' };

export default function TabPublicar({ perfil }) {
  const esClinica = perfil.rol === 'clinica';
  const [descripcion, setDescripcion] = useState('');
  const [zona, setZona] = useState(perfil.zona_cobertura ?? '');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [tipoJornada, setTipoJornada] = useState(TIPO_JORNADA[0]);
  const [rolObjetivo, setRolObjetivo] = useState('medico');
  const [misPublicaciones, setMisPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function cargarMisPublicaciones() {
    setLoading(true);
    try {
      const data = await fetchMisPublicaciones(perfil.id);
      setMisPublicaciones(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarMisPublicaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
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
      setDescripcion('');
      setFechaInicio('');
      setFechaFin('');
      showToast('Publicación creada.', 'ok');
      await cargarMisPublicaciones();
    } catch (err) {
      setError(err.message ?? 'No se pudo crear la publicación.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDesactivar(id) {
    try {
      await desactivarPublicacion(id, perfil.id);
      showToast('Publicación desactivada.', 'ok');
      await cargarMisPublicaciones();
    } catch {
      showToast('No se pudo desactivar.', 'critical');
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
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
                  className={`flex-1 rounded-[10px] border px-3 py-2 text-[13px] ${
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

        <Input label="Zona" value={zona} onChange={(e) => setZona(e.target.value)} />

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

        <Button type="submit" disabled={saving}>
          {saving ? 'Publicando…' : 'Publicar'}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold text-[#5A6B7A]">Mis publicaciones activas</p>
        {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
        {!loading && misPublicaciones.filter((p) => p.activa).length === 0 && (
          <Card className="text-center text-[12px] text-[#5A6B7A]">Sin publicaciones activas.</Card>
        )}
        {!loading &&
          misPublicaciones
            .filter((p) => p.activa)
            .map((p) => (
              <Card key={p.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#0A1628]">{p.descripcion || '(sin descripción)'}</p>
                  <p className="text-[12px] text-[#5A6B7A]">{p.zona || 'Sin zona'}</p>
                </div>
                <Button variant="ghost" fullWidth={false} className="!w-auto px-2 py-1 text-[12px]" onClick={() => handleDesactivar(p.id)}>
                  Desactivar
                </Button>
              </Card>
            ))}
      </div>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
