import { useEffect, useState } from 'react';
import { Card, Input, Select, Button, Toast, Modal } from '../../components/ui';
import { ZONAS_COBERTURA } from '../../lib/municipios';
import { enlaceUbicacion } from '../../lib/mapas';
import { useAuth } from '../../app/AuthContext';
import {
  fetchSedes,
  crearSede,
  actualizarSede,
  eliminarSede,
  etiquetaSede,
  sincronizarZonaCobertura,
} from '../../lib/clinicaSedes';

// N-29 · Sedes de la clínica (migración 0030).
//
// Es lo que arregla que las ofertas de clínicas no aparecieran bajo el filtro
// de cercanía: la CIUDAD sale de acá, del catálogo cerrado, y es la que la
// oferta copia a su `zona`. La dirección exacta sigue siendo privada hasta el
// acuerdo (D-064) — eso lo resuelve el backend, no esta pantalla.
function SedeForm({ inicial, onGuardar, onCancelar, guardando }) {
  const [etiqueta, setEtiqueta] = useState(inicial?.etiqueta ?? '');
  const [ciudad, setCiudad] = useState(inicial?.ciudad ?? '');
  const [direccion, setDireccion] = useState(inicial?.direccion ?? '');
  const [linkMaps, setLinkMaps] = useState(inicial?.link_maps ?? '');

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-[#E1E8ED] p-3">
      <Input
        label="Nombre de la sede"
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        placeholder="Sede Norte"
      />
      <Select
        label="Ciudad"
        value={ciudad}
        onChange={(e) => setCiudad(e.target.value)}
        options={ZONAS_COBERTURA}
        placeholder="Selecciona la ciudad"
        hint="Define en qué búsquedas aparecen tus ofertas. Médicos y auxiliares de municipios vecinos también las verán."
      />
      <Input
        label="Dirección"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        placeholder="Calle 63 #11-24"
      />
      <Input
        label="Link de Google Maps (opcional)"
        value={linkMaps}
        onChange={(e) => setLinkMaps(e.target.value)}
        placeholder="Pega el enlace de tu ubicación"
      />
      <p className="text-[11px] text-[#5A6B7A]">
        La dirección y el link solo los ve la otra parte cuando el turno queda confirmado por ambos.
      </p>
      <div className="flex gap-2">
        {onCancelar && (
          <Button variant="ghost" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Button>
        )}
        <Button
          onClick={() => onGuardar({ etiqueta, ciudad, direccion, linkMaps })}
          disabled={guardando || !etiqueta.trim() || !direccion.trim()}
        >
          {guardando ? 'Guardando…' : inicial ? 'Guardar sede' : 'Agregar sede'}
        </Button>
      </div>
    </div>
  );
}

export default function SedesSection({ perfil }) {
  const { refreshPerfil } = useAuth();
  const [sedes, setSedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // id de la sede en edición
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function cargar() {
    setLoading(true);
    try {
      setSedes(await fetchSedes(perfil.id));
    } catch {
      setSedes([]);
    } finally {
      setLoading(false);
    }
  }

  // Tras cada cambio de sedes se recarga la lista Y se reescribe la zona de
  // búsqueda del perfil con las ciudades resultantes: es lo que hace que la
  // clínica también vea las ofertas de médicos y auxiliares cercanos.
  async function recargarYSincronizar() {
    const actuales = await fetchSedes(perfil.id);
    setSedes(actuales);
    try {
      await sincronizarZonaCobertura(perfil.id, actuales);
      await refreshPerfil();
    } catch {
      // Las sedes ya quedaron guardadas; que falle la sincronía de la zona de
      // búsqueda no debe presentarse como si el guardado hubiera fallado.
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  async function handleCrear(campos) {
    setGuardando(true);
    setError('');
    try {
      await crearSede({ clinicaId: perfil.id, ...campos });
      setCreando(false);
      await recargarYSincronizar();
      showToast('Sede agregada.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo agregar la sede.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleActualizar(id, campos) {
    setGuardando(true);
    setError('');
    try {
      await actualizarSede(id, perfil.id, campos);
      setEditando(null);
      await recargarYSincronizar();
      showToast('Sede actualizada.', 'ok');
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar la sede.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar() {
    if (!confirmandoBorrado) return;
    setGuardando(true);
    try {
      await eliminarSede(confirmandoBorrado.id, perfil.id);
      setConfirmandoBorrado(null);
      await recargarYSincronizar();
      showToast('Sede eliminada.', 'ok');
    } catch (err) {
      showToast(err.message ?? 'No se pudo eliminar la sede.', 'critical');
    } finally {
      setGuardando(false);
    }
  }

  const sinCiudad = sedes.filter((s) => !s.ciudad);

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-[14px] font-semibold text-[#0A1628]">Sedes</p>
        <p className="mt-1 text-[12px] text-[#5A6B7A]">
          Cada oferta que publiques se asocia a una sede. Su ciudad es la que determina qué médicos y
          auxiliares la ven.
        </p>
      </div>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && sinCiudad.length > 0 && (
        <p className="rounded-[10px] border border-[#E8A33D] bg-[#E8A33D1A] px-3 py-2.5 text-[12px] text-[#0A1628]">
          {sinCiudad.length === 1
            ? 'Una de tus sedes no tiene ciudad configurada, así que no puedes publicar ofertas desde ella. Edítala y elige su ciudad.'
            : `${sinCiudad.length} de tus sedes no tienen ciudad configurada, así que no puedes publicar ofertas desde ellas. Edítalas y elige su ciudad.`}
        </p>
      )}

      {!loading &&
        sedes.map((sede) =>
          editando === sede.id ? (
            <SedeForm
              key={sede.id}
              inicial={sede}
              guardando={guardando}
              onCancelar={() => {
                setEditando(null);
                setError('');
              }}
              onGuardar={(campos) => handleActualizar(sede.id, campos)}
            />
          ) : (
            <div key={sede.id} className="flex flex-col gap-1 rounded-[10px] border border-[#E1E8ED] p-3">
              <p className="text-[14px] font-medium text-[#0A1628]">{etiquetaSede(sede)}</p>
              <p className="text-[13px] text-[#0A1628]">📍 {sede.direccion}</p>
              {!sede.ciudad && (
                <p className="text-[11px] font-medium text-[#C63B3B]">Sin ciudad · no aparece en búsquedas</p>
              )}
              {enlaceUbicacion({ direccion: sede.direccion, linkMaps: sede.link_maps }) && (
                <a
                  href={enlaceUbicacion({ direccion: sede.direccion, linkMaps: sede.link_maps })}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-medium text-[#1A7A5E]"
                >
                  Abrir en la app de mapas →
                </a>
              )}
              <div className="mt-1 flex gap-2">
                <Button
                  variant="outline"
                  fullWidth={false}
                  className="!w-auto px-3 py-1.5 text-[12px]"
                  onClick={() => {
                    setEditando(sede.id);
                    setCreando(false);
                    setError('');
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="danger"
                  fullWidth={false}
                  className="!w-auto px-3 py-1.5 text-[12px]"
                  onClick={() => setConfirmandoBorrado(sede)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ),
        )}

      {!loading && sedes.length === 0 && !creando && (
        <p className="text-[12px] text-[#5A6B7A]">
          Todavía no registras ninguna sede. Agrega al menos una para poder publicar ofertas.
        </p>
      )}

      {creando ? (
        <SedeForm
          guardando={guardando}
          onCancelar={() => {
            setCreando(false);
            setError('');
          }}
          onGuardar={handleCrear}
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            setCreando(true);
            setEditando(null);
            setError('');
          }}
        >
          + Agregar sede
        </Button>
      )}

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}

      <Modal
        open={Boolean(confirmandoBorrado)}
        onClose={() => (guardando ? null : setConfirmandoBorrado(null))}
        title="Eliminar sede"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#0A1628]">
            Se elimina “{confirmandoBorrado?.etiqueta}”. Las ofertas que ya publicaste desde esta sede no se
            borran, pero dejarán de mostrar su dirección.
          </p>
          <Button variant="danger" disabled={guardando} onClick={handleEliminar}>
            {guardando ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmandoBorrado(null)}>
            Volver
          </Button>
        </div>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </Card>
  );
}
