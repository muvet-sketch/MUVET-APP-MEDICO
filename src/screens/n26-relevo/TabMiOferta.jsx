import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  fetchMisConversaciones,
  contarRelevosConfirmados,
  normalizarCupos,
  PUBLICACIONES_PERMITIDAS_POR_ROL,
  sumarHoras,
  calcularDuracionHoras,
  formatFranjaHoraria,
} from '../../lib/relevo';
import {
  HABILIDADES_PROFESIONALES,
  HABILIDADES_PERSONALES,
  guardarHabilidadesPerfil,
  normalizarHabilidades,
  tieneHabilidadesDePerfil,
} from '../../lib/habilidades';
import { ZONAS_COBERTURA, parseZonas, serializarZonas } from '../../lib/municipios';

const TIPO_JORNADA = ['Turno completo', 'Medio turno', 'Turno 12 Horas', 'Varios días'];
// Compatibilidad con publicaciones creadas antes del renombre — `tipo_jornada`
// no tiene CHECK constraint en BD (texto libre), así que las filas viejas
// conservan la etiqueta anterior tal cual; esto solo remapea al abrir el
// formulario de edición para que el botón correspondiente quede resaltado.
const MIGRAR_TIPO_JORNADA = { 'Día completo': 'Turno completo', 'Medio día': 'Medio turno' };
// Duración por defecto de cada turno (0022): ya no hay un campo de "duración
// del turno" editable — la hora de fin se autocompleta con estos valores al
// elegir el turno o al cambiar la hora de inicio, y el usuario puede
// sobreescribirla directamente si el turno real no calza con el preset.
const DURACION_PREDETERMINADA = { 'Turno completo': 8, 'Medio turno': 4, 'Turno 12 Horas': 12, 'Varios días': 8 };
// Procedimientos que un médico puede solicitarle a un auxiliar (aparte de
// pedir su apoyo por jornada completa) — pedido puntual para la combinación
// médico → auxiliar (busco:auxiliar).
const PROCEDIMIENTOS_AUXILIAR = [
  'Asistencia en consulta',
  'Asistencia en cirugía',
  'Asistencia en ecografía',
  'Asistencia en rayos X',
  'Toma de muestras',
];
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

  // Solo el médico solicitando apoyo a un auxiliar (busco:auxiliar) puede
  // definir la oferta por procedimiento en vez de por jornada — pedido
  // puntual para esa combinación, no aplica a las demás.
  const puedeElegirProcedimiento = perfil.rol === 'medico' && opcionSeleccionada?.rolObjetivo === 'auxiliar';
  const [modoOferta, setModoOferta] = useState(initial?.procedimientos?.length > 0 ? 'procedimiento' : 'jornada');
  const [procedimientos, setProcedimientos] = useState(initial?.procedimientos ?? []);
  const mostrarJornada = !puedeElegirProcedimiento || modoOferta === 'jornada';

  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '');
  // La clínica tiene una sola sede física (D-544): su "zona" de la oferta es
  // la dirección del establecimiento, de solo lectura, no un catálogo de
  // zonas para elegir (eso es para médico/auxiliar, que se desplazan).
  const esClinica = perfil.rol === 'clinica';
  const zonaClinica = perfil.direccion_sede?.trim() || '';
  // Mismo catálogo cerrado que el resto del perfil (lib/municipios.js) en vez
  // de texto libre, para que el matching por zona en TabOfertas compare
  // valores consistentes (antes un Input libre no ofrecía ningún buscador
  // real ni garantizaba que el texto coincidiera con el catálogo).
  const [zonas, setZonas] = useState(parseZonas(initial?.zona ?? perfil.zona_cobertura));
  const [tipoJornada, setTipoJornada] = useState(
    MIGRAR_TIPO_JORNADA[initial?.tipo_jornada] ?? initial?.tipo_jornada ?? TIPO_JORNADA[0],
  );
  // Medio turno / Turno completo arrancan en hoy (un solo día); Varios días
  // arranca vacío para que el rango lo defina el usuario. Por procedimiento
  // también es de un solo día (mismo criterio que medio turno/turno completo).
  const [fechaInicio, setFechaInicio] = useState(
    initial?.fecha_inicio ?? (tipoJornada === 'Varios días' && mostrarJornada ? '' : new Date().toISOString().slice(0, 10)),
  );
  const [fechaFin, setFechaFin] = useState(
    initial?.fecha_fin ?? (tipoJornada === 'Varios días' && mostrarJornada ? '' : new Date().toISOString().slice(0, 10)),
  );
  // Franja horaria (0021, revisado en 0022): la hora de fin ya no depende de
  // un campo de "duración" que el usuario deba escribir — se autocompleta al
  // elegir un turno con duración fija (Turno completo/Medio turno/Turno 12
  // Horas) o al cambiar la hora de inicio. Sigue siendo un input normal, así
  // que el usuario puede sobreescribirla después si el turno real no calza
  // con el preset.
  const [horaInicio, setHoraInicio] = useState(initial?.hora_inicio?.slice(0, 5) ?? '08:00');
  const [horaFin, setHoraFin] = useState(
    initial?.hora_fin?.slice(0, 5) ||
      sumarHoras(initial?.hora_inicio?.slice(0, 5) ?? '08:00', DURACION_PREDETERMINADA[tipoJornada] ?? 8),
  );

  function handleHoraInicio(value) {
    setHoraInicio(value);
    setHoraFin(sumarHoras(value, DURACION_PREDETERMINADA[tipoJornada] ?? 8));
  }
  const [tarifa, setTarifa] = useState(initial?.tarifa ?? '');
  const [turnos, setTurnos] = useState(initial?.turnos ?? []);
  const [nuevoTurno, setNuevoTurno] = useState('');
  const habilidades = initial?.habilidades ?? [];
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

  // Medio turno / Turno completo son de un solo día: al elegirlos el
  // calendario se adelanta a hoy para que el médico no tenga que abrirlo.
  // "Varios días" sí necesita un rango, así que ahí se deja Desde/Hasta en
  // manos del usuario. La duración también vuelve a su valor por defecto
  // (8h turno completo / 4h medio turno) al cambiar de jornada.
  function handleTipoJornada(t) {
    setTipoJornada(t);
    setHoraFin(sumarHoras(horaInicio, DURACION_PREDETERMINADA[t] ?? 8));
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const tarifaNum = tarifa === '' ? null : Number(tarifa);
      // Por jornada y por procedimiento son mutuamente excluyentes: se manda
      // uno u otro, nunca los dos, para que la etiqueta de la oferta no
      // mezcle una jornada con procedimientos de una elección anterior.
      const campos = {
        descripcion,
        zona: esClinica ? zonaClinica : serializarZonas(zonas),
        fechaInicio,
        fechaFin,
        tipoJornada: mostrarJornada ? tipoJornada : null,
        horaInicio,
        horaFin,
        duracionHoras: calcularDuracionHoras(horaInicio, horaFin),
        procedimientos: puedeElegirProcedimiento && modoOferta === 'procedimiento' ? procedimientos : [],
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

      {esClinica ? (
        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Zona / Ciudad</label>
          <p className="rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] px-3 py-2.5 text-[14px] text-[#0A1628]">
            {zonaClinica || 'Configura la dirección del establecimiento en tu perfil.'}
          </p>
        </div>
      ) : (
        <ChipMultiSelect
          searchable
          label={`Zona / Ciudad (${zonas.length})`}
          options={ZONAS_COBERTURA}
          value={zonas}
          onChange={setZonas}
        />
      )}

      {puedeElegirProcedimiento && (
        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">¿Cómo defines esta oferta?</label>
          <div className="flex gap-2">
            {[
              { value: 'jornada', label: 'Por jornada' },
              { value: 'procedimiento', label: 'Por procedimiento' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setModoOferta(o.value)}
                className={`flex-1 rounded-[10px] border px-2 py-2 text-[12px] ${
                  modoOferta === o.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mostrarJornada ? (
        <div className="w-full text-left">
          <label className="mb-1 block text-[12px] font-medium text-[#5A6B7A]">Jornada</label>
          <div className="flex flex-wrap gap-2">
            {TIPO_JORNADA.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTipoJornada(t)}
                className={`min-w-[45%] flex-1 rounded-[10px] border px-2 py-2 text-[12px] ${
                  tipoJornada === t ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ChipMultiSelect
          allowCustom
          label={`Procedimientos solicitados (${procedimientos.length})`}
          options={PROCEDIMIENTOS_AUXILIAR}
          value={procedimientos}
          onChange={setProcedimientos}
        />
      )}

      {mostrarJornada && tipoJornada === 'Varios días' ? (
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

      <div className="flex gap-2">
        <Input label="Hora de inicio" type="time" value={horaInicio} onChange={(e) => handleHoraInicio(e.target.value)} />
        <Input label="Hora de fin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
      </div>

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
        allowCustom
        label={usaPerfil ? 'Habilidades profesionales' : 'Habilidades profesionales que esperas del candidato'}
        hint={usaPerfil ? 'También puedes configurarlas desde tu perfil.' : undefined}
        options={HABILIDADES_PROFESIONALES}
        value={habProfesionales}
        onChange={setHabProfesionales}
      />

      <ChipMultiSelect
        collapsible
        allowCustom
        label={usaPerfil ? 'Habilidades personales' : 'Habilidades personales que esperas del candidato'}
        options={HABILIDADES_PERSONALES}
        value={habPersonales}
        onChange={setHabPersonales}
      />

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
// (`conversaciones` solo se usa para ese conteo y para la barra de progreso —
// las conversaciones en sí se gestionan en la pestaña "Conversaciones"). La
// usan tanto el auxiliar (una instancia por pestaña, con `comboFiltro` fijo)
// como médico/clínica (una sola instancia, sin `comboFiltro`).
function OfertaSeccion({ perfil, comboFiltro, oferta, loading, conversaciones, onOfertaChange, onPerfilChange, showToast }) {
  const [editando, setEditando] = useState(false);
  const [toggling, setToggling] = useState(false);
  // 'cancelar' | 'finalizar' | null — qué confirmación está abierta (0018:
  // ambas son terminales, así que se pide confirmación explícita antes de
  // llamar a la capa de acceso a datos).
  const [confirmando, setConfirmando] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const cuposOferta = normalizarCupos(oferta?.cupos);
  const confirmados = contarRelevosConfirmados(conversaciones);
  const cuposLlenos = Boolean(oferta) && confirmados >= cuposOferta;
  const terminal = Boolean(oferta) && oferta.estado && oferta.estado !== 'abierta';
  const paso = calcularPasoPublicacion(oferta, conversaciones);
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
            {formatFranjaHoraria(oferta) ? ` · ${formatFranjaHoraria(oferta)}` : ''}
          </p>
          {oferta.tarifa != null && (
            <p className="text-[14px] font-semibold text-[#1A7A5E]">{formatCOP(oferta.tarifa)}</p>
          )}
          {oferta.procedimientos?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {oferta.procedimientos.map((p) => (
                <Badge key={p} tone="ok">
                  {p}
                </Badge>
              ))}
            </div>
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
                {confirmados} de {cuposOferta} turno(s) confirmado(s)
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
              "Dar por finalizada" se habilita cuando al menos un turno quede confirmado.
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
              ? 'Esta acción es permanente: la oferta dejará de ser pública y las conversaciones todavía abiertas quedarán descartadas. Los relevos ya confirmados no se tocan. No podrás reactivarla — tendrás que publicar una nueva.'
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

// "Mis postulaciones" se retiró de aquí (0027): las ofertas de otros que
// contacté ya no son un listado aparte esperando la decisión ajena — son
// conversaciones, y viven junto a las que recibí en la pestaña
// "Conversaciones". Antes esta sección solo podía decir "Esperando la decisión
// del autor", porque el modelo plano no dejaba ver la respuesta del otro lado.
//
// La sección "Ofertas anteriores en esta pestaña" también se retiró: las
// ofertas canceladas o finalizadas (0018: ambas terminales) están en el
// historial único de /historial (N-9), junto a las conversaciones cerradas y
// al historial de MUVET Relevo (N-30). Ver lib/historialUnificado.js.

export default function TabMiOferta({ perfil }) {
  // El formulario puede escribir las habilidades de catálogo en `perfiles`
  // (médico/auxiliar), así que hay que refrescar el perfil del contexto para
  // que la siguiente oferta arranque con los valores nuevos.
  const { refreshPerfil } = useAuth();
  const navigate = useNavigate();
  const [misPublicaciones, setMisPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  // Solo para el conteo de cupos y la barra de progreso: las conversaciones se
  // gestionan en su propia pestaña.
  const [conversaciones, setConversaciones] = useState([]);

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
    // Cancelar una oferta descarta sus conversaciones abiertas (trigger de
    // 0027), así que el conteo de cupos hay que releerlo junto con la oferta.
    await cargarConversaciones();
  }

  async function cargarConversaciones() {
    try {
      const data = await fetchMisConversaciones(perfil.id);
      // Solo las de MIS publicaciones: las que abrí yo sobre ofertas ajenas no
      // dicen nada del avance de mi propia oferta.
      setConversaciones(data.filter((c) => c.autor_id === perfil.id));
    } catch {
      setConversaciones([]);
    }
  }

  useEffect(() => {
    cargarMiOferta();
    cargarConversaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  const activa = tabs.find((t) => t.key === subTab) ?? tabs[0];
  // Puede haber varias filas históricas por (tipo, rol_objetivo) — 0018 hizo
  // que cancelar/finalizar sean terminales, así que una vez cerrada una
  // oferta hace falta publicar una fila nueva. `oferta` es siempre la vigente
  // ('abierta'); las demás quedan como historial de solo lectura.
  const publicacionesTab = activa
    ? misPublicaciones.filter((p) => p.tipo === activa.tipo && p.rol_objetivo === activa.rolObjetivo)
    : [];
  const oferta = publicacionesTab.find((p) => !p.estado || p.estado === 'abierta') ?? null;
  // Cada pestaña es exclusiva: solo cuentan las conversaciones de la
  // publicación de esa pestaña, nunca las de la otra audiencia. Esto es lo que
  // permite tener las dos ofertas del rol activas a la vez, cada una con su
  // propio conteo de cupos.
  const conversacionesTab = oferta ? conversaciones.filter((c) => c.publicacion_id === oferta.id) : [];

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
          conversaciones={conversacionesTab}
          onOfertaChange={cargarMiOferta}
          onPerfilChange={refreshPerfil}
          showToast={showToast}
        />
      )}

      <button
        type="button"
        onClick={() => navigate('/historial')}
        className="self-start text-[12px] font-medium text-[#1A7A5E]"
      >
        Ver historial de ofertas y conversaciones cerradas →
      </button>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
