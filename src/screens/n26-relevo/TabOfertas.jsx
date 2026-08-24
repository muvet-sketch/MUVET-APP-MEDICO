import { useEffect, useState } from 'react';
import { Card, Badge, Button, Modal, Toast } from '../../components/ui';
import { formatCOP } from '../../lib/format';
import {
  fetchPublicacionesActivas,
  fetchMisPostulaciones,
  fetchMensajesRecibidos,
  fetchFichaContacto,
  enviarMensaje,
  decidirPostulacion,
  contarRelevosConfirmados,
  normalizarCupos,
  formatFranjaHoraria,
} from '../../lib/relevo';

const ACTOR_BADGE = {
  clinica: { label: '🏥 Clínica Veterinaria', tone: 'info' },
  auxiliar: { label: '🧰 Auxiliar', tone: 'neutral' },
  medico: { label: '🩺 Médico', tone: 'neutral' },
};

const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

// Estado de la decisión única (0020) — mismo criterio que en Mi Oferta.
const ESTADO_BADGE = {
  pendiente: { label: 'Pendiente de tu decisión', tone: 'alert' },
  aceptada: { label: 'Aceptada', tone: 'ok' },
  rechazada: { label: 'Rechazada', tone: 'critical' },
};

// Pregunta previa (0019): no es una postulación, así que no usa el badge de
// decisión de arriba.
const CONSULTA_BADGE = { label: 'Consulta previa', tone: 'info' };

// Mismo criterio de HeaderPerfil/MatriculaSection (N-8) para la matrícula
// COMVEZCOL del médico, reutilizado aquí en la ficha de contacto (0022).
const ESTADO_VALIDACION_BADGE = {
  validado: { tone: 'ok', label: '✅ Vigente' },
  pendiente: { tone: 'alert', label: '⏳ En validación' },
  rechazado: { tone: 'critical', label: '❌ Rechazada' },
};

// Ficha de contacto ampliada (0022): datos que `perfiles_publico` no expone
// a cualquier autenticado y que solo llegan aquí una vez que hay un mensaje
// de por medio (ver fetchFichaContacto/relevo_ficha_contacto). `ficha` es
// null mientras carga o si el backend no encuentra relación — en ese caso no
// se muestra nada y el modal se queda con los datos básicos de siempre.
function FichaContacto({ ficha, cargando }) {
  if (cargando) return <p className="text-[12px] text-[#5A6B7A]">Cargando ficha…</p>;
  if (!ficha) return null;

  if (ficha.rol === 'clinica') {
    if (!ficha.nit && !ficha.direccion_sede && !ficha.telefono) return null;
    return (
      <div className="flex flex-col gap-1 rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] p-3">
        <p className="text-[12px] font-semibold text-[#0A1628]">Datos de la clínica</p>
        {ficha.nit && <p className="text-[12px] text-[#5A6B7A]">NIT: {ficha.nit}</p>}
        {ficha.direccion_sede && <p className="text-[12px] text-[#5A6B7A]">Dirección: {ficha.direccion_sede}</p>}
        {ficha.telefono && <p className="text-[12px] text-[#5A6B7A]">Tel: {ficha.telefono}</p>}
      </div>
    );
  }

  const estado = ESTADO_VALIDACION_BADGE[ficha.estado_validacion] ?? ESTADO_VALIDACION_BADGE.pendiente;
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#E1E8ED] bg-[#F4F7F9] p-3">
      <p className="text-[12px] font-semibold text-[#0A1628]">Ficha del perfil</p>
      {ficha.matricula_comvezcol && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#5A6B7A]">Matrícula {ficha.matricula_comvezcol}</span>
          <Badge tone={estado.tone}>{estado.label}</Badge>
        </div>
      )}
      {ficha.especialidad && <p className="text-[12px] text-[#5A6B7A]">{ficha.especialidad}</p>}
      {ficha.zona_cobertura && <p className="text-[12px] text-[#5A6B7A]">Zona: {ficha.zona_cobertura}</p>}
      {ficha.bio && <p className="text-[12px] text-[#0A1628]">{ficha.bio}</p>}
      {ficha.telefono && <p className="text-[12px] text-[#5A6B7A]">Tel: {ficha.telefono}</p>}
    </div>
  );
}

// La pestaña ya solo trae publicaciones dirigidas a mi rol (`rol_objetivo ===
// perfil.rol`, ver cargar() más abajo), así que "Aceptar oferta" nunca queda
// habilitado fuera de la audiencia declarada de la publicación — coincide
// siempre con la matriz D-545 (PUBLICACIONES_PERMITIDAS_POR_ROL).
//
// Sub-filtro por rol del AUTOR sobre ese conjunto ya acotado. Con el matching
// por rol_objetivo, el propio rol nunca aparece como autor de una publicación
// dirigida a mí (nadie se dirige a su propio rol en la matriz D-545), así que
// se excluye de las opciones para no mostrar un botón que siempre está vacío.
const FILTROS_AUTOR_BASE = [
  { value: 'clinica', label: 'Clínicas' },
  { value: 'medico', label: 'Médicos' },
  { value: 'auxiliar', label: 'Auxiliares' },
];

const AUDIENCIA_LABEL = { clinica: 'clínicas', medico: 'médicos', auxiliar: 'auxiliares' };

// Habilidades de la publicación agrupadas por catálogo (0015). `habilidades`
// es el campo libre previo a esa migración y se sigue mostrando como "otras".
function HabilidadesResumen({ publicacion }) {
  const esperadas = publicacion.autor?.rol === 'clinica';
  const grupos = [
    { titulo: esperadas ? 'Profesionales que espera' : 'Profesionales', items: publicacion.habilidades_profesionales, tone: 'ok' },
    { titulo: esperadas ? 'Personales que espera' : 'Personales', items: publicacion.habilidades_personales, tone: 'alert' },
    { titulo: 'Otras', items: publicacion.habilidades, tone: 'neutral' },
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

export default function TabOfertas({ perfil, rolInicial }) {
  const [rolActor, setRolActor] = useState(rolInicial || '');
  const FILTROS_AUTOR = [
    { value: '', label: 'Todo' },
    ...FILTROS_AUTOR_BASE.filter((f) => f.value !== perfil.rol),
  ];
  const [publicaciones, setPublicaciones] = useState([]);
  const [postulaciones, setPostulaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [validando, setValidando] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  // Pregunta previa (0019): la clínica (o cualquiera que reciba una oferta
  // "ofrezco") puede escribirle al autor antes de decidir si acepta, sin que
  // eso cuente como postulación (ver enviarMensaje con esPostulacion: false).
  const [preguntando, setPreguntando] = useState(null);
  const [pregunta, setPregunta] = useState('');
  const [enviandoPregunta, setEnviandoPregunta] = useState(false);

  // Solicitudes recibidas sobre mis propias ofertas (antes en "Mi Oferta").
  // Se muestran debajo del listado de ofertas de otros.
  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true);
  const [detalle, setDetalle] = useState(null);
  const [fichaDetalle, setFichaDetalle] = useState(null);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [respondiendo, setRespondiendo] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);

  // La zona de búsqueda ya no se escribe aquí: sale de `zona_cobertura` del
  // perfil, que es donde se configura (N-8, perfil inline del auxiliar en
  // N-28, datos de la clínica en N-29). Es una lista separada por comas, así
  // que se filtra en cliente contra cualquiera de esas zonas — `ilike` en el
  // servidor solo admite un patrón.
  const zonasPerfil = (perfil.zona_cobertura ?? '')
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);

  function showToast(message, tone = 'ok') {
    setToast({ message, tone, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500);
  }

  async function cargar() {
    setLoading(true);
    try {
      // Matching D-545: solo publicaciones dirigidas a mi rol
      // (`rol_objetivo === perfil.rol`) — un médico ve lo que auxiliares
      // (ofrezco:medico) y clínicas (busco:medico) dirigieron a médicos; un
      // auxiliar ve lo que clínicas (busco:auxiliar) y médicos (busco:auxiliar)
      // dirigieron a auxiliares; una clínica ve lo que médicos y auxiliares
      // (ambos ofrezco:clinica) dirigieron a clínicas. Lo propio se descarta
      // igual (se gestiona en "Mi Oferta").
      const [data, mias] = await Promise.all([
        fetchPublicacionesActivas({ paraRol: perfil.rol }),
        fetchMisPostulaciones(perfil.id),
      ]);
      setPublicaciones(data.filter((p) => p.autor_id !== perfil.id));
      setPostulaciones(mias);
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
    cargar();
    cargarSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  // Al abrir "Ver detalles" se pide la ficha ampliada (0022) — solo el
  // backend sabe si ya hay un mensaje de por medio que la habilite.
  useEffect(() => {
    if (!detalle) {
      setFichaDetalle(null);
      return undefined;
    }
    let activo = true;
    setCargandoFicha(true);
    fetchFichaContacto(detalle.remitente_id)
      .then((ficha) => {
        if (activo) setFichaDetalle(ficha);
      })
      .catch(() => {
        if (activo) setFichaDetalle(null);
      })
      .finally(() => {
        if (activo) setCargandoFicha(false);
      });
    return () => {
      activo = false;
    };
  }, [detalle]);

  const idsPostulados = new Set(postulaciones.map((m) => m.publicacion_id));
  const visibles = publicaciones.filter((p) => {
    if (rolActor && p.autor?.rol !== rolActor) return false;
    if (zonasPerfil.length === 0) return true;
    const zonaPublicacion = (p.zona ?? '').toLowerCase();
    return zonasPerfil.some((z) => zonaPublicacion.includes(z.toLowerCase()));
  });

  async function handleValidar(e) {
    e.preventDefault();
    if (!validando) return;
    setEnviando(true);
    try {
      // D-540: sigue siendo un mensaje único de contacto, no un hilo.
      // "Validar Oferta" crea la postulación y notifica al autor de la
      // oferta; la única decisión que falta es la suya — aceptar o rechazar
      // (0020, reemplaza la doble confirmación de 0016).
      await enviarMensaje({
        publicacionId: validando.id,
        remitenteId: perfil.id,
        mensaje: mensaje.trim() || 'He validado tu oferta en MUVET Relevo.',
      });
      setValidando(null);
      setMensaje('');
      showToast('Oferta validada. Te avisaremos cuando el autor decida.', 'ok');
      await cargar();
    } catch {
      showToast('No se pudo validar la oferta.', 'critical');
    } finally {
      setEnviando(false);
    }
  }

  async function handlePreguntar(e) {
    e.preventDefault();
    if (!preguntando || !pregunta.trim()) return;
    setEnviandoPregunta(true);
    try {
      // esPostulacion: false — es solo una pregunta antes de decidir, no
      // "Aceptar oferta" (D-540: mensaje único de contacto, no un hilo).
      await enviarMensaje({
        publicacionId: preguntando.id,
        remitenteId: perfil.id,
        mensaje: pregunta.trim(),
        esPostulacion: false,
      });
      setPreguntando(null);
      setPregunta('');
      showToast('Mensaje enviado. Podrás validar la oferta cuando quieras.', 'ok');
    } catch {
      showToast('No se pudo enviar el mensaje.', 'critical');
    } finally {
      setEnviandoPregunta(false);
    }
  }

  async function handleResponder(e) {
    e.preventDefault();
    if (!respondiendo || !respuesta.trim()) return;
    setEnviandoRespuesta(true);
    try {
      await enviarMensaje({ publicacionId: respondiendo.publicacion_id, remitenteId: perfil.id, mensaje: respuesta.trim() });
      setRespondiendo(null);
      setRespuesta('');
      showToast('Mensaje enviado.', 'ok');
    } catch {
      showToast('No se pudo enviar el mensaje.', 'critical');
    } finally {
      setEnviandoRespuesta(false);
    }
  }

  async function handleDecidir(id, decision) {
    try {
      await decidirPostulacion(id, decision);
      showToast(
        decision === 'aceptada' ? 'Postulación aceptada. Ya pueden escribirse.' : 'Postulación rechazada.',
        'ok',
      );
      await cargarSolicitudes();
    } catch {
      showToast('No se pudo actualizar la postulación.', 'critical');
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5 pb-24">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-[#5A6B7A]">
          {zonasPerfil.length > 0 ? (
            <>
              Zona de búsqueda: <span className="font-medium text-[#0A1628]">{zonasPerfil.join(', ')}</span> · edítala en
              tu perfil.
            </>
          ) : (
            <>Sin zona configurada: se muestran todas las ofertas. Define tu zona en tu perfil.</>
          )}
        </p>

        <div className="flex gap-2">
          {FILTROS_AUTOR.map((b) => (
            <button
              key={b.value || 'todo'}
              type="button"
              onClick={() => setRolActor(b.value)}
              className={`flex-1 whitespace-nowrap rounded-[10px] border px-1 py-2 text-[11px] ${
                rolActor === b.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
      {!loading && visibles.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">
          {zonasPerfil.length > 0
            ? `Sin ofertas activas en ${zonasPerfil.join(', ')}. Ajusta tu zona en el perfil para ver otras.`
            : 'Sin ofertas activas por ahora.'}
        </Card>
      )}

      {!loading &&
        visibles.map((p) => {
          const badge = ACTOR_BADGE[p.autor?.rol] ?? ACTOR_BADGE.medico;
          const nombreAutor = p.autor?.razon_social || p.autor?.nombre_completo || 'Usuario MUVET';
          const yaPostulado = idsPostulados.has(p.id);
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
                {formatFranjaHoraria(p) ? ` · ${formatFranjaHoraria(p)}` : ''}
              </p>
              <p className="text-[11px] text-[#5A6B7A]">
                {p.rol_objetivo ? `Dirigida a ${AUDIENCIA_LABEL[p.rol_objetivo] ?? p.rol_objetivo}` : ''}
                {p.cupos > 1 ? `${p.rol_objetivo ? ' · ' : ''}${p.cupos} cupos` : ''}
              </p>
              {p.tarifa != null && <p className="text-[13px] font-semibold text-[#1A7A5E]">{formatCOP(p.tarifa)}</p>}
              {p.procedimientos?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.procedimientos.map((proc) => (
                    <Badge key={proc} tone="ok">
                      {proc}
                    </Badge>
                  ))}
                </div>
              )}
              {p.turnos?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.turnos.map((t) => (
                    <Badge key={t} tone="info">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Una clínica publica las habilidades que ESPERA del candidato;
                  médico y auxiliar publican las suyas (migración 0015). */}
              <HabilidadesResumen publicacion={p} />
              {yaPostulado ? (
                <p className="text-[12px] font-medium text-[#1A7A5E]">
                  ✓ Ya validaste esta oferta · verás la respuesta en "Mi Oferta › Mis postulaciones"
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    fullWidth={false}
                    className="!w-auto px-3 py-2 text-[12px]"
                    onClick={() => setPreguntando(p)}
                  >
                    Enviar mensaje
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    className="!w-auto px-3 py-2 text-[12px]"
                    onClick={() => setValidando(p)}
                  >
                    Validar Oferta
                  </Button>
                </div>
              )}
            </Card>
          );
        })}

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold text-[#5A6B7A]">Solicitudes activas</p>
        {loadingSolicitudes && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
        {!loadingSolicitudes && solicitudes.length === 0 && (
          <Card className="text-center text-[12px] text-[#5A6B7A]">Aún no tienes solicitudes.</Card>
        )}
        {!loadingSolicitudes &&
          solicitudes.map((m) => {
            const nombreRemitente = m.remitente?.razon_social || m.remitente?.nombre_completo || 'Usuario MUVET';
            // Una pregunta previa (0019, es_postulacion=false) no es una
            // postulación: no tiene decisión que mostrar ni botones de
            // aceptar/rechazar (esa fila nunca podrá llegar a 'aceptada', lo
            // impide el trigger de la migración 0020).
            const esPostulacion = m.es_postulacion !== false;
            const estado = esPostulacion ? ESTADO_BADGE[m.estado] ?? ESTADO_BADGE.pendiente : CONSULTA_BADGE;
            // Cupos de la publicación a la que pertenece esta solicitud
            // (viene embebida en el join de fetchMensajesRecibidos).
            const hermanas = solicitudes.filter((s) => s.publicacion_id === m.publicacion_id);
            const cuposLlenos = contarRelevosConfirmados(hermanas) >= normalizarCupos(m.publicacion?.cupos);
            // El contacto directo (0020) se activa recién cuando acepto la
            // postulación — antes de eso solo puedo aceptarla o rechazarla.
            const puedeContactar = !esPostulacion || m.estado === 'aceptada';
            return (
              <Card key={m.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[#0A1628]">{nombreRemitente}</p>
                  <Badge tone={estado.tone}>{estado.label}</Badge>
                </div>
                <p className="text-[11px] text-[#5A6B7A]">{ACTOR_LABEL[m.remitente?.rol] ?? ''}</p>
                <p className="text-[11px] text-[#5A6B7A]">Sobre: {m.publicacion?.descripcion || '(sin descripción)'}</p>
                <p className="truncate text-[13px] text-[#0A1628]">{m.mensaje}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" fullWidth={false} className="!w-auto px-2 py-1 text-[12px]" onClick={() => setDetalle(m)}>
                    Ver detalles
                  </Button>
                  {puedeContactar && (
                    <Button
                      variant="outline"
                      fullWidth={false}
                      className="!w-auto px-2 py-1 text-[12px]"
                      onClick={() => setRespondiendo(m)}
                    >
                      Enviar mensaje
                    </Button>
                  )}
                  {/* Decisión única (0020): reemplaza la confirmación doble
                      de 0016 — el autor acepta o rechaza una sola vez y la
                      decisión queda cerrada. */}
                  {esPostulacion && m.estado === 'pendiente' && (
                    <>
                      <Button
                        variant="secondary"
                        fullWidth={false}
                        className="!w-auto px-2 py-1 text-[12px]"
                        disabled={cuposLlenos}
                        onClick={() => handleDecidir(m.id, 'aceptada')}
                      >
                        Aceptar
                      </Button>
                      <Button
                        variant="danger"
                        fullWidth={false}
                        className="!w-auto px-2 py-1 text-[12px]"
                        onClick={() => handleDecidir(m.id, 'rechazada')}
                      >
                        Rechazar
                      </Button>
                    </>
                  )}
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
            <p className="text-[12px] text-[#5A6B7A]">Sobre: {detalle.publicacion?.descripcion || '(sin descripción)'}</p>
            <p className="text-[14px] text-[#0A1628]">{detalle.mensaje}</p>
            <FichaContacto ficha={fichaDetalle} cargando={cargandoFicha} />
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
          <Button type="submit" disabled={enviandoRespuesta || !respuesta.trim()}>
            {enviandoRespuesta ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(preguntando)} onClose={() => setPreguntando(null)} title="Enviar mensaje">
        <form onSubmit={handlePreguntar} className="flex flex-col gap-3">
          <p className="text-[12px] text-[#5A6B7A]">
            Pregunta algo antes de decidir — esto no acepta la oferta ni cuenta como postulación. Mensaje único de
            contacto, sin chat en tiempo real (D-540).
          </p>
          <textarea
            rows={4}
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder="Escribe tu pregunta…"
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Button type="submit" disabled={enviandoPregunta || !pregunta.trim()}>
            {enviandoPregunta ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      </Modal>

      <Modal open={Boolean(validando)} onClose={() => setValidando(null)} title="Validar Oferta">
        <form onSubmit={handleValidar} className="flex flex-col gap-3">
          <p className="text-[12px] text-[#5A6B7A]">
            Mensaje único de contacto — sin chat en tiempo real (D-540). Se enviará una notificación a quien publicó la
            oferta, con tu perfil, para que la acepte o la rechace. Si la acepta, podrán escribirse directamente.
          </p>
          <textarea
            rows={4}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Mensaje (opcional)…"
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Validar Oferta'}
          </Button>
        </form>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
