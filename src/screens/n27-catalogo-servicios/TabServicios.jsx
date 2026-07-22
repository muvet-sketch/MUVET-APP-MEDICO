import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCOP } from '../../lib/format';
import { Card, Button, Modal, Toast } from '../../components/ui';
import ServicioFormModal from './ServicioFormModal';
import ImportarCsvModal from './ImportarCsvModal';

export default function TabServicios() {
  const { perfil } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState({ message: '', tone: 'info', visible: false });

  const loadServicios = useCallback(async () => {
    if (!perfil?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('catalogo_servicios_medico')
      .select('*')
      .eq('medico_id', perfil.id)
      .order('created_at', { ascending: true });
    setServicios(data ?? []);
    setLoading(false);
  }, [perfil?.id]);

  useEffect(() => {
    loadServicios();
  }, [loadServicios]);

  function showToast(message, tone = 'info') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function handleSave(payload) {
    if (payload.id) {
      const { error } = await supabase
        .from('catalogo_servicios_medico')
        .update({
          nombre_servicio: payload.nombre_servicio,
          precio: payload.precio,
          descripcion: payload.descripcion,
        })
        .eq('id', payload.id);
      if (error) throw error;
      showToast('Servicio actualizado.', 'ok');
    } else {
      const { error } = await supabase.from('catalogo_servicios_medico').insert({
        medico_id: perfil.id,
        nombre_servicio: payload.nombre_servicio,
        precio: payload.precio,
        descripcion: payload.descripcion,
      });
      if (error) throw error;
      showToast('Servicio agregado.', 'ok');
    }
    await loadServicios();
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    const { error } = await supabase.from('catalogo_servicios_medico').delete().eq('id', deleting.id);
    setDeleting(null);
    if (!error) {
      showToast('Servicio eliminado.', 'ok');
      await loadServicios();
    } else {
      showToast('No se pudo eliminar el servicio.', 'critical');
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <p className="text-[12px] text-[#5A6B7A]">
        Configura los servicios que ofreces y sus tarifas. Necesitas al menos 1 servicio con precio para poder
        activar disponibilidad.
      </p>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && servicios.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">Aún no has agregado servicios.</Card>
      )}

      {!loading &&
        servicios.map((s) => (
          <Card key={s.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#0A1628]">{s.nombre_servicio}</p>
              <p className="text-[14px] font-semibold text-[#1A7A5E]">{formatCOP(s.precio)}</p>
              {s.descripcion && <p className="truncate text-[12px] text-[#5A6B7A]">{s.descripcion}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                aria-label="Editar servicio"
                onClick={() => {
                  setEditing(s);
                  setFormOpen(true);
                }}
                className="text-[16px]"
              >
                ✎
              </button>
              <button type="button" aria-label="Eliminar servicio" onClick={() => setDeleting(s)} className="text-[16px]">
                🗑
              </button>
            </div>
          </Card>
        ))}

      <Button
        variant="outline"
        onClick={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      >
        + Agregar servicio
      </Button>

      <Button variant="ghost" onClick={() => setImportOpen(true)}>
        📎 Importar CSV/Excel
      </Button>

      <ServicioFormModal
        open={formOpen}
        initial={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="¿Eliminar este servicio?">
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-[#5A6B7A]">
            {deleting?.nombre_servicio ? `"${deleting.nombre_servicio}" se eliminará de tu catálogo.` : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleConfirmDelete}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>

      <ImportarCsvModal open={importOpen} onClose={() => setImportOpen(false)} onDone={(msg) => showToast(msg, 'info')} />

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
