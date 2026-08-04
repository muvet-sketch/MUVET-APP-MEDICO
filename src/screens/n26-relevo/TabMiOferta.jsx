import { useEffect, useState } from 'react';
import { Card, Badge, Input, Button, Toggle, Toast, ChipMultiSelect, ProgressSteps, Modal } from '../../components/ui';
import { useAuth } from '../../app/AuthContext';
import { formatCOP } from '../../lib/format';
import {
  crearPublicacion,
  actualizarPublicacion,
  fetchMisPublicaciones,
  activarPublicacion,
  desactivarPublicacion,
  cancelarPublicacion,
  finalizarPublicacion,
  calcularPasoPublicacion,
  PASOS_PUBLICACION,
  fetchMensajesRecibidos,
  fetchMisPostulaciones,
  enviarMensaje,
  marcarPostulacionesLeidas,
  contarRelevosConfirmados,
  normalizarCupos,
  PUBLICACIONES_PERMITIDAS_POR_ROL,
} from '../../lib/relevo';
import {
  HABILIDADES_PROFESIONALES,
  HABILIDADES_PERSONALES,
  guardarHabilidadesPerfil,
  normalizarHabilidades,
  tieneHabilidadesDePerfil,
} from '../../lib/habilidades';
import { ZONAS_COBERTURA, parseZonas, serializarZonas } from '../../lib/municipios';

const TIPO_JORNADA = ['Medio día', 'Día completo', 'Varios días'];
const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

// Etiquetas de cada combinación (tipo, rol_objetivo) permitida por rol —
// ver PUBLICACIONES_PERMITIDAS_POR_ROL en lib/relevo.js (D-545 revisado).
const OPCION_LABEL_POR_ROL = {
  medico: {
    'ofrezco:clinica': 'Ofrezco disponibilidad a establecimientos',
    'busco:auxiliar': 'Solicito apoyo de un auxiliar',
  },
  auxiliar: {
    'ofrezco:clinica': 'Ofrezco disponibilidad a establecimientos',
    'ofrezco:medico': 'Ofrezco disponibilidad a médicos',
  },
  clinica: {
    'busco:medico': 'Busco médico',
    'busco:auxiliar': 'Busco auxiliar',
  },
};
const TURNOS_OPCIONES = ['Turno día', 'Turno noche', 'Hospitalización', 'Consulta'];
// Estado de la decisión única (0020, reemplaza la confirmación doble de
// 0016): la escribe directamente el autor de la publicación al aceptar o
// rechazar, así que basta con leerla.
const ESTADO_BADGE = {
  pendiente: { label: 'Pendiente de respuesta', tone: 'alert' },
  aceptada: { label: 'Aceptada', tone: 'ok' },
  rechazada: { label: 'Rechazada', tone: 'critical' },
};

// Estado de la propia publicación (0018: cancelación/finalización, distinto
// de `activa`, que es solo el toggle de "publicada / no publicada").
const ESTADO_PUBLICACION_BADGE = {
  cancelada: { label: 'Cancelada', tone: 'critical' },
  finalizada: { label: 'Finalizada', tone: 'ok' },
};


function OfertaForm({ perfil, initial, comboFiltro, onSaved, onCancel, showToast, onPerfilChange }) {
  // Opciones de (tipo, rol_objetivo) permitidas para este rol (D-545
  // revisado) con su etiqueta. `initial` fija cuál se usó al crear — no se
  // puede cambiar al editar (mismo criterio que antes para `rolObjetivo`).
  // Cuando `comboFiltro` viene dado (auxiliar con pestañas Clínicas / Apoyo
  // Médico exclusivas), se restringe a esa única combinación para que el
  // selector "Tipo de publicación" no permita crear la oferta equivocada
  // dentro de la pestaña activa.
  const opcionesRol = (PUBLICACIONES_PERMITIDAS_POR_ROL[perfil.rol] || []).map((o) => {
    const key = `${o.tipo}:${o.rolObjetivo}`;
    return { ...o, key, label: OPCION_LABEL_POR_ROL[perfil.rol]?.[key] ?? key };
  });
  const opciones = comboFiltro
    ? opcionesRol.filter((o) => o.tipo === comboFiltro.tipo && o.rolObjetivo === comboFiltro.rolObjetivo)
    : opcionesRol;
  const initialKey = initial ? `${initial.tipo}:${initial.rol_objetivo}` : opciones[0]?.key;
  const [opcionKey, setOpcionKey] = useState(initialKey);
  const opcionSeleccionada = opciones.find((o) => o.key === opcionKey) ?? opciones[0];

  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '');
  // Mismo catálogo cerrado que el resto del perfil (lib/municipios.js) en vez
  // de texto libre, para que el matching por zona en TabOfertas compare
  // valores consistentes (antes un Input libre no ofrecía ningún buscador
  // real ni garantizaba que el texto coincidiera con el catálogo).
  const [zonas, setZonas] = useState(parseZonas(initial?.zona ?? perfil.zona_cobertura));
  const [tipoJornada, setTipoJornada] = useState(initial?.tipo_jornada ?? TIPO_JORNADA[0]);
  // Medio día / Día completo arrancan en hoy (un solo día); Varios días
  // arranca vacío para que el rango lo defina el usuario.
  const [fechaInicio, setFechaInicio] = useState(
    initial?.fecha_inicio ?? (tipoJornada === 'Varios días' ? '' : new Date().toISOString().slice(0, 10)),
  );
  const [fechaFin, setFechaFin] = useState(
    initial?.fecha_fin ?? (tipoJornada === 'Varios días' ? '' : new Date().toISOString().slice(0, 10)),
  );
  const [tarifa, setTarifa] = useState(initial?.tarifa ?? '');
  const [turnos, setTurnos] = useState(initial?.turnos ?? []);
  const [nuevoTurno, setNuevoTurno] = useState('');
  const [habilidades, setHabilidades] = useState(initial?.habilidades ?? []);
  const [nuevaHabilidad, setNuevaHabilidad] = useState('');
  // Cupos (0016): solo la clínica puede pedir varios médicos o auxiliares con
  // una misma publicación; médico y auxiliar se ofrecen a sí mismos (1).
  const [cupos, setCupos] = useState(initial?.cupos ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Habilidades de catálogo (0015). Médico y auxiliar arrancan una oferta
  // nueva con lo que tengan configurado en su perfil; al guardar se escribe
  // en ambos lados, así que el perfil sigue siendo la fuente de verdad y la
  // oferta se puede editar desde aquí sin desincronizarse. La clínica no
  // tiene habilidades de perfil: las que elige aquí son las que ESPERA del
  // candidato que vea o acepte la oferta.
  const usaPerfil = tieneHabilidadesDePerfil(perfil.rol);
  const [habProfesionales, setHabProfesionales] = useState(
    normalizarHabilidades(
      initial?.habilidades_profesionales ?? (usaPerfil ? perfil.habilidades_profesionales : []),
      HABILIDADES_PROFESIONALES,
    ),
  );
  const [habPersonales, setHabPersonales] = useState(
    normalizarHabilidades(
      initial?.habilidades_personales ?? (usaPerfil ? perfil.habilidades_personales : []),
      HABILIDADES_PERSONALES,
    ),
  );

  // SUPUESTO: tarifa y turnos quedan disponibles para los 3 roles (médico,
  // auxiliar y clínica) — el pedido no distinguió, y para una clínica
  // ("busco") estos campos sirven para describir el turno ofrecido.

  // Medio día / Día completo son de un solo día: al elegirlos el calendario
  // se adelanta a hoy para que el médico no tenga que abrirlo. "Varios días"
  // sí necesita un rango, así que ahí se deja Desde/Hasta en manos del usuario.
  function handleTipoJornada(t) {
    setTipoJornada(t);
    if (t !== 'Varios días') {
      const hoy = new Date().toISOString().slice(0, 10);
      setFechaInicio(hoy);
      setFechaFin(hoy);
    }
  }

  function toggleTurno(t) {
    setTurnos((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function quitarTurno(t) {
    setTurnos((prev) => prev.filter((x) => x !== t));
  }

  function agregarTurno() {
    const t = nuevoTurno.trim();
    if (!t) return;
    setTurnos((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNuevoTurno('');
  }

  function quitarHabilidad(h) {
    setHabilidades((prev) => prev.filter((x) => x !== h));
  }

  function agregarHabilidad() {
    const h = nuevaHabilidad.trim();
    if (!h) return;
    setHabilidades((prev) => (prev.includes(h) ? prev : [...prev, h]));
    setNuevaHabilidad('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const tarifaNum = tarifa === '' ? null : Number(tarifa);
      const campos = {
        descripcion,
        zona: serializarZonas(zonas),
        fechaInicio,
        fechaFin,
        tipoJornada,
        tarifa: tarifaNum,
        turnos,
        habilidades,
        habilidadesProfesionales: habProfesionales,
        habilidadesPersonales: habPersonales,
        cupos: perfil.rol === 'clinica' ? cupos : 1,
      };

      if (initial) {
        await actualizarPublicacion(initial.id, perfil.id, campos);
        showToast('Oferta actualizada.', 'ok');
      } else {
        await crearPublicacion({
          autorId: perfil.id,
          autorRol: perfil.rol,
          tipo: opcionSeleccionada.tipo,
          rolObjetivo: opcionSeleccionada.rolObjetivo,
          ...campos,
        });
        showToast('Oferta publicada.', 'ok');
      }

      // Médico/auxiliar: lo elegido aquí también queda como su configuración
      // de perfil, para que se reaplique cada vez que activen una oferta.
      if (usaPerfil) {
        await guardarHabilidadesPerfil(perfil.id, { profesionales: habProfesionales, personales: habPersonales });
        await onPerfilChange?.();
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
      <p className="text-[14px] font-semibold text-[#0A1628]">{opcionSeleccionada?.label ?? 'Publicar'}</p>

      {opciones.length > 1 && (
        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Tipo de publicación</label>
          <div className="flex gap-2">
            {opciones.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setOpcionKey(o.key)}
                disabled={Boolean(initial)}
                className={`flex-1 rounded-[10px] border px-3 py-2 text-[13px] disabled:opacity-50 ${
                  opcionKey === o.key ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
                }`}
              >
                {o.label}
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

      <ChipMultiSelect
        searchable
        label={`Zona / Ciudad (${zonas.length})`}
        options={ZONAS_COBERTURA}
        value={zonas}
        onChange={setZonas}
      />

      <div className="w-full text-left">
        <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Jornada</label>
        <div className="flex gap-2">
          {TIPO_JORNADA.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTipoJornada(t)}
              className={`flex-1 rounded-[10px] border px-2 py-2 text-[12px] ${
                tipoJornada === t ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tipoJornada === 'Varios días' ? (
        <div className="flex gap-2">
          <Input label="Desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          <Input label="Hasta" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        </div>
      ) : (
        <Input
          label="Fecha"
          type="date"
          value={fechaInicio}
          onChange={(e) => {
            setFechaInicio(e.target.value);
            setFechaFin(e.target.value);
          }}
        />
      )}

      {perfil.rol === 'clinica' && (
        <Input
          label={`Cantidad de ${opcionSeleccionada?.rolObjetivo === 'auxiliar' ? 'auxiliares' : 'médicos'} que necesitas`}
          type="number"
          min="1"
          step="1"
          value={cupos}
          onChange={(e) => setCupos(e.target.value)}
          onBlur={() => setCupos(normalizarCupos(cupos))}
        />
      )}

      <Input
        label="Tarifa solicitada (COP)"
        type="number"
        min="0"
        step="1000"
        placeholder="Ej: 80000"
        value={tarifa}
        onChange={(e) => setTarifa(e.target.value)}
      />

      <div className="w-full text-left">
        <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">
          Disponibilidad ofrecida (elige una o varias)
        </label>
        <div className="flex flex-wrap gap-2">
          {[...TURNOS_OPCIONES, ...turnos.filter((t) => !TURNOS_OPCIONES.includes(t))]
            .map((t) => {
              const esPersonalizado = !TURNOS_OPCIONES.includes(t);
              const seleccionado = turnos.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => (esPersonalizado ? quitarTurno(t) : toggleTurno(t))}
                  className={`rounded-[10px] border px-3 py-2 text-[12px] ${
                    seleccionado ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
                  }`}
                >
                  {seleccionado ? '✓ ' : ''}
                  {t}
                  {esPersonalizado ? ' ×' : ''}
                </button>
              );
            })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={nuevoTurno}
            onChange={(e) => setNuevoTurno(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregarTurno();
              }
            }}
            placeholder="Otro…"
            className="flex-1 rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2 text-[13px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            className="!w-auto px-3 py-2 text-[12px]"
            onClick={agregarTurno}
          >
            + Agregar
          </Button>
        </div>
      </div>

      <ChipMultiSelect
        collapsible
        label={usaPerfil ? 'Habilidades profesionales' : 'Habilidades profesionales que esperas del candidato'}
        hint={usaPerfil ? 'También puedes configurarlas desde tu perfil.' : undefined}
        options={HABILIDADES_PROFESIONALES}
        value={habProfesionales}
        onChange={setHabProfesionales}
      />

      <ChipMultiSelect
        collapsible
        label={usaPerfil ? 'Habilidades personales' : 'Habilidades personales que esperas del candidato'}
        options={HABILIDADES_PERSONALES}
        value={habPersonales}
        onChange={setHabPersonales}
      />

      <div className="w-full text-left">
        <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Otras habilidades</label>
        {habilidades.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {habilidades.map((h) => (
              <span
                key={h}
                className="flex items-center gap-1 rounded-full bg-[#F4F7F9] px-3 py-1 text-[12px] text-[#0A1628]"
              >
                {h}
                <button type="button" aria-label={`Quitar ${h}`} onClick={() => quitarHabilidad(h)} className="text-[#5A6B7A]">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={nuevaHabilidad}
            onChange={(e) => setNuevaHabilidad(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregarHabilidad();
              }
            }}
            placeholder="Agregar otra habilidad…"
            className="flex-1 rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2 text-[13px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            className="!w-auto px-3 py-2 text-[12px]"
            onClick={agregarHabilidad}
          >
            + Agregar
          </Button>
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

// D-545: cada rol tiene dos combinaciones (tipo, rol_objetivo) permitidas
// (ver PUBLICACIONES_PERMITIDAS_POR_ROL en lib/relevo.js) y cada una vive en
// su propia pestaña, gestionada de forma independiente (activar/desactivar,
// editar, solicitudes propias) sin mezclar audiencias. Esto es lo que permite
// "crear una oferta nueva": basta con cambiar de pestaña y publicar la que
// falte, sin perder la que ya está activa en la otra.
const TABS_POR_ROL = {
  medico: [
    { key: 'clinica', tipo: 'ofrezco', rolObjetivo: 'clinica', label: 'A clínicas' },
    { key: 'auxiliar', tipo: 'busco', rolObjetivo: 'auxiliar', label: 'Busco auxiliar' },
  ],
  auxiliar: [
    { key: 'clinica', tipo: 'ofrezco', rolObjetivo: 'clinica', label: 'Clínicas' },
    { key: 'medico', tipo: 'ofrezco', rolObjetivo: 'medico', label: 'Apoyo Médico' },
  ],
  clinica: [
    { key: 'medico', tipo: 'busco', rolObjetivo: 'medico', label: 'Busco médico' },
    { key: 'auxiliar', tipo: 'busco', rolObjetivo: 'auxiliar', label: 'Busco auxiliar' },
  ],
};

// Habilidades de la oferta agrupadas por catálogo (0015); `habilidades` es el
// campo libre previo a esa migración y se sigue mostrando como "otras".
function HabilidadesOferta({ oferta, esperadas }) {
  const grupos = [
    { titulo: esperadas ? 'Profesionales que espero' : 'Profesionales', items: oferta.habilidades_profesionales, tone: 'ok' },
    { titulo: esperadas ? 'Personales que espero' : 'Personales', items: oferta.habilidades_personales, tone: 'alert' },
    { titulo: 'Otras', items: oferta.habilidades, tone: 'neutral' },
  ].filter((g) => g.items?.length > 0);

  if (grupos.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {grupos.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-[#5A6B7A]">{g.titulo}</p>
          <div className="flex flex-wrap gap-1">
            {g.items.map((h) => (
              <Badge key={h} tone={g.tone}>
                {h}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Sección completa de "una oferta": formulario/tarjeta + conteo de cupos
// (`solicitudes` solo se usa para ese conteo — el listado de solicitudes en
// sí se muestra en la pestaña "Ofertas", debajo del listado de ofertas de
// otros). La usan tanto el auxiliar (una instancia por pestaña, con
// `comboFiltro` fijo) como médico/clínica (una sola instancia, sin
// `comboFiltro`, igual que antes).
function OfertaSeccion({ perfil, comboFiltro, oferta, loading, solicitudes, onOfertaChange, onPerfilChange, showToast }) {
  const [editando, setEditando] = useState(false);
  const [toggling, setToggling] = useState(false);
  // 'cancelar' | 'finalizar' | null — qué confirmación está abierta (0018:
  // ambas son terminales, así que se pide confirmación explícita antes de
  // llamar a la capa de acceso a datos).
  const [confirmando, setConfirmando] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const cuposOferta = normalizarCupos(oferta?.cupos);
  const confirmados = contarRelevosConfirmados(solicitudes);
  const cuposLlenos = Boolean(oferta) && confirmados >= cuposOferta;
  const terminal = Boolean(oferta) && oferta.estado && oferta.estado !== 'abierta';
  const paso = calcularPasoPublicacion(oferta, solicitudes);
  const estadoBadge = terminal
    ? ESTADO_PUBLICACION_BADGE[oferta.estado]
    : { label: oferta?.activa ? 'Publicada' : 'No publicada', tone: oferta?.activa ? 'ok' : 'neutral' };

  async function handleToggle(activa) {
    if (!oferta) return;
    setToggling(true);
    try {
      if (activa) {
        // Las habilidades configuradas en el perfil quedan activas cada vez
        // que se publica la oferta (0015). La clínica no manda nada: su
        // oferta conserva las habilidades que espera del candidato.
        const habilidadesPerfil = tieneHabilidadesDePerfil(perfil.rol)
          ? { profesionales: perfil.habilidades_profesionales ?? [], personales: perfil.habilidades_personales ?? [] }
          : null;
        await activarPublicacion(oferta.id, perfil.id, habilidadesPerfil);
        showToast('Oferta publicada.', 'ok');
      } else {
        await desactivarPublicacion(oferta.id, perfil.id);
        showToast('Oferta desactivada.', 'ok');
      }
      await onOfertaChange();
    } catch (err) {
      showToast(err.message ?? 'No se pudo actualizar la oferta.', 'critical');
    } finally {
      setToggling(false);
    }
  }

  async function handleConfirmarAccion() {
    if (!oferta || !confirmando) return;
    setProcesando(true);
    try {
      if (confirmando === 'cancelar') {
        await cancelarPublicacion(oferta.id, perfil.id);
        showToast('Oferta cancelada.', 'ok');
      } else {
        await finalizarPublicacion(oferta.id, perfil.id);
        showToast('Oferta marcada como finalizada.', 'ok');
      }
      setConfirmando(null);
      await onOfertaChange();
    } catch (err) {
      showToast(err.message ?? 'No se pudo actualizar la oferta.', 'critical');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <>
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && (!oferta || editando) && (
        <OfertaForm
          perfil={perfil}
          initial={editando ? oferta : null}
          comboFiltro={comboFiltro}
          onPerfilChange={onPerfilChange}
          onCancel={() => setEditando(false)}
          onSaved={async () => {
            setEditando(false);
            await onOfertaChange();
          }}
          showToast={showToast}
        />
      )}

      {!loading && oferta && !editando && (
        <Card className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#0A1628]">Mi oferta</p>
            <Badge tone={estadoBadge.tone}>{estadoBadge.label}</Badge>
          </div>
          <p className="text-[13px] text-[#0A1628]">{oferta.descripcion || '(sin descripción)'}</p>
          <p className="text-[12px] text-[#5A6B7A]">
            {OPCION_LABEL_POR_ROL[perfil.rol]?.[`${oferta.tipo}:${oferta.rol_objetivo}`] ??
              (oferta.tipo === 'ofrezco'
                ? 'Ofrezco disponibilidad'
                : `Busco ${oferta.rol_objetivo === 'auxiliar' ? 'auxiliar' : 'médico'}`)}
            {oferta.zona ? ` · ${oferta.zona}` : ''}
            {oferta.tipo_jornada ? ` · ${oferta.tipo_jornada}` : ''}
          </p>
          {oferta.tarifa != null && (
            <p className="text-[14px] font-semibold text-[#1A7A5E]">{formatCOP(oferta.tarifa)}</p>
          )}
          {oferta.turnos?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {oferta.turnos.map((t) => (
                <Badge key={t} tone="info">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          <HabilidadesOferta oferta={oferta} esperadas={!tieneHabilidadesDePerfil(perfil.rol)} />

          <div className="mt-1 border-t border-[#E1E8ED] pt-3">
            {paso != null ? (
              <ProgressSteps steps={PASOS_PUBLICACION} currentIndex={paso} />
            ) : (
              <p className="text-[11px] text-[#5A6B7A]">Esta oferta fue cancelada antes de completarse.</p>
            )}
          </div>

          {!terminal && (
            <div className="flex flex-col gap-2 border-t border-[#E1E8ED] pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-[#5A6B7A]">Hacer pública mi oferta</span>
                <Toggle
                  checked={oferta.activa}
                  onChange={handleToggle}
                  disabled={toggling || cuposLlenos}
                  label="Publicar oferta"
                />
              </div>
              <p className="text-[11px] text-[#5A6B7A]">
                {confirmados} de {cuposOferta} relevo(s) confirmado(s)
                {cuposLlenos ? ' · cupos llenos, la oferta dejó de ser pública.' : ''}
              </p>
            </div>
          )}

          {!terminal && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" fullWidth={false} className="!w-auto px-3 py-2 text-[12px]" onClick={() => setEditando(true)}>
                Editar oferta
              </Button>
              <Button
                variant="secondary"
                fullWidth={false}
                className="!w-auto px-3 py-2 text-[12px]"
                disabled={confirmados < 1}
                onClick={() => setConfirmando('finalizar')}
              >
                Dar por finalizada
              </Button>
              <Button
                variant="danger"
                fullWidth={false}
                className="!w-auto px-3 py-2 text-[12px]"
                onClick={() => setConfirmando('cancelar')}
              >
                Cancelar oferta
              </Button>
            </div>
          )}
          {!terminal && confirmados < 1 && (
            <p className="text-[11px] text-[#5A6B7A]">
              "Dar por finalizada" se habilita cuando al menos un relevo quede confirmado.
            </p>
          )}
        </Card>
      )}

      <Modal
        open={Boolean(confirmando)}
        onClose={() => (procesando ? null : setConfirmando(null))}
        title={confirmando === 'cancelar' ? 'Cancelar oferta' : 'Dar por finalizada'}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#0A1628]">
            {confirmando === 'cancelar'
              ? 'Esta acción es permanente: la oferta dejará de ser pública y las postulaciones sin confirmar quedarán rechazadas. No podrás reactivarla — tendrás que publicar una nueva.'
              : 'Confirma que la labor ya se cumplió. Esta acción es permanente y la oferta dejará de ser pública.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmando(null)} disabled={procesando}>
              Volver
            </Button>
            <Button
              variant={confirmando === 'cancelar' ? 'danger' : 'secondary'}
              onClick={handleConfirmarAccion}
              disabled={procesando}
            >
              {procesando ? 'Guardando…' : confirmando === 'cancelar' ? 'Sí, cancelar' : 'Sí, finalizar'}
            </Button>
          </div>
        </div>
      </Modal>

    </>
  );
}

// Lado del interesado en la decisión única (0020, reemplaza la confirmación
// doble de 0016): las ofertas de OTROS que validé desde la pestaña "Ofertas"
// y cuya decisión (del autor) espero o ya conozco. Vive aquí en vez de en una
// cuarta pestaña para no apretar el header a 390px.
function MisPostulacionesSeccion({ perfil, postulaciones, loading, showToast }) {
  const [respondiendo, setRespondiendo] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleEnviar(e) {
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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-semibold text-[#5A6B7A]">Mis postulaciones</p>
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
      {!loading && postulaciones.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">
          Aún no has validado ninguna oferta. Explóralas en la pestaña "Ofertas".
        </Card>
      )}
      {!loading &&
        postulaciones.map((m) => {
          const autor = m.autorPublicacion;
          const nombreAutor = autor?.razon_social || autor?.nombre_completo || 'Usuario MUVET';
          const estado = ESTADO_BADGE[m.estado] ?? ESTADO_BADGE.pendiente;
          return (
            <Card key={m.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[#0A1628]">{nombreAutor}</p>
                <Badge tone={estado.tone}>{estado.label}</Badge>
              </div>
              <p className="text-[11px] text-[#5A6B7A]">{ACTOR_LABEL[autor?.rol] ?? ''}</p>
              <p className="text-[12px] text-[#5A6B7A]">
                Sobre: {m.publicacion?.descripcion || '(sin descripción)'}
                {m.publicacion?.zona ? ` · ${m.publicacion.zona}` : ''}
              </p>
              {m.estado === 'pendiente' && (
                <p className="text-[11px] text-[#5A6B7A]">Esperando la decisión del autor de la oferta.</p>
              )}
              {m.estado === 'aceptada' && (
                <>
                  <p className="text-[11px] text-[#1A7A5E]">Aceptada — ya pueden escribirse.</p>
                  <Button
                    variant="outline"
                    fullWidth={false}
                    className="!w-auto self-start px-3 py-2 text-[12px]"
                    onClick={() => setRespondiendo(m)}
                  >
                    Enviar mensaje
                  </Button>
                </>
              )}
            </Card>
          );
        })}

      <Modal open={Boolean(respondiendo)} onClose={() => setRespondiendo(null)} title="Enviar mensaje">
        <form onSubmit={handleEnviar} className="flex flex-col gap-3">
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
    </div>
  );
}

// Ofertas ya cerradas (canceladas o finalizadas) de la pestaña activa —
// solo lectura, para no perder el rastro de "todos los pasos" una vez la
// oferta vigente cambió de fila (0018: cancelar/finalizar son terminales).
function HistorialOfertasSeccion({ historial }) {
  if (historial.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-semibold text-[#5A6B7A]">Ofertas anteriores en esta pestaña</p>
      {historial.map((p) => {
        const badge = ESTADO_PUBLICACION_BADGE[p.estado] ?? { label: p.estado, tone: 'neutral' };
        return (
          <Card key={p.id} className="flex flex-col gap-2 opacity-80">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-medium text-[#0A1628]">{p.descripcion || '(sin descripción)'}</p>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
            {p.zona && <p className="text-[11px] text-[#5A6B7A]">{p.zona}</p>}
          </Card>
        );
      })}
    </div>
  );
}

export default function TabMiOferta({ perfil }) {
  // El formulario puede escribir las habilidades de catálogo en `perfiles`
  // (médico/auxiliar), así que hay que refrescar el perfil del contexto para
  // que la siguiente oferta arranque con los valores nuevos.
  const { refreshPerfil } = useAuth();
  const [misPublicaciones, setMisPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true);

  const [postulaciones, setPostulaciones] = useState([]);
  const [loadingPostulaciones, setLoadingPostulaciones] = useState(true);

  const tabs = TABS_POR_ROL[perfil.rol] ?? [];
  const [subTab, setSubTab] = useState(tabs[0]?.key);

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

  async function cargarPostulaciones() {
    setLoadingPostulaciones(true);
    try {
      setPostulaciones(await fetchMisPostulaciones(perfil.id));
    } finally {
      setLoadingPostulaciones(false);
    }
  }

  useEffect(() => {
    cargarMiOferta();
    cargarSolicitudes();
    cargarPostulaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  // Al abrir "Mi Oferta" (donde vive "Mis postulaciones") se dan por vistas
  // las decisiones pendientes de notificar — limpia el badge de la campana
  // del lado del interesado (0020), mismo criterio que TabMensajes con
  // marcarMensajesLeidos del lado del autor.
  useEffect(() => {
    marcarPostulacionesLeidas(perfil.id).catch(() => {});
  }, [perfil.id]);

  const seccionPostulaciones = (
    <MisPostulacionesSeccion perfil={perfil} postulaciones={postulaciones} loading={loadingPostulaciones} showToast={showToast} />
  );

  const activa = tabs.find((t) => t.key === subTab) ?? tabs[0];
  // Puede haber varias filas históricas por (tipo, rol_objetivo) — 0018 hizo
  // que cancelar/finalizar sean terminales, así que una vez cerrada una
  // oferta hace falta publicar una fila nueva. `oferta` es siempre la vigente
  // ('abierta'); las demás quedan como historial de solo lectura.
  const publicacionesTab = activa
    ? misPublicaciones.filter((p) => p.tipo === activa.tipo && p.rol_objetivo === activa.rolObjetivo)
    : [];
  const oferta = publicacionesTab.find((p) => !p.estado || p.estado === 'abierta') ?? null;
  const historialTab = publicacionesTab.filter((p) => p.id !== oferta?.id);
  // Cada pestaña es exclusiva: solo se muestran las solicitudes dirigidas a
  // la publicación de esa pestaña, nunca las de la otra audiencia. Esto es lo
  // que permite tener las dos ofertas del rol activas a la vez, cada una con
  // sus propias solicitudes.
  const solicitudesTab = oferta ? solicitudes.filter((m) => m.publicacion_id === oferta.id) : [];

  return (
    <div className="flex flex-col gap-4 px-5 py-5 pb-24">
      <div className="flex gap-1 rounded-[10px] bg-[#F2F5F7] p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={`flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
              subTab === t.key ? 'bg-white text-[#0A1628] shadow-sm' : 'text-[#5A6B7A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activa && (
        <OfertaSeccion
          key={activa.key}
          perfil={perfil}
          comboFiltro={{ tipo: activa.tipo, rolObjetivo: activa.rolObjetivo }}
          oferta={oferta}
          loading={loading}
          solicitudes={solicitudesTab}
          onOfertaChange={cargarMiOferta}
          onPerfilChange={refreshPerfil}
          showToast={showToast}
        />
      )}

      <HistorialOfertasSeccion historial={historialTab} />

      {seccionPostulaciones}

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
