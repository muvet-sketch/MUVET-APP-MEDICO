// N-26 · MUVET Turnos (identificador interno `relevo`, ver
// lib/nombresModulos.js) — pestaña "Ofertas": el tablón de las ofertas dirigidas
// a mi rol.
//
// Antes esta pantalla tenía DOS botones que se solapaban ("Enviar mensaje",
// que era una pregunta previa sin compromiso, y "Validar Oferta", que ya era
// la postulación) y además el bloque "Solicitudes activas" con Aceptar/Rechazar
// sobre lo recibido en mis propias ofertas. Con el modelo de 0027 todo eso se
// unifica: un solo botón "Contactar" que abre la negociación sin comprometer a
// nada, y las dos puntas de esa negociación viven en la pestaña
// "Conversaciones". El relevo se cierra con el acuerdo de ambas partes.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button, Modal, Toast, Avatar } from '../../components/ui';
import { formatCOP } from '../../lib/format';
import {
  fetchPublicacionesActivas,
  fetchMisConversaciones,
  iniciarConversacion,
  formatFranjaHoraria,
  zonaCoincide,
  PUBLICACIONES_PERMITIDAS_POR_ROL,
} from '../../lib/relevo';

const ACTOR_BADGE = {
  clinica: { label: '🏥 Clínica Veterinaria', tone: 'info' },
  auxiliar: { label: '🧰 Auxiliar', tone: 'neutral' },
  medico: { label: '🩺 Médico', tone: 'neutral' },
};

// La pestaña ya solo trae publicaciones dirigidas a mi rol (`rol_objetivo ===
// perfil.rol`, ver cargar() más abajo), y desde 0027 eso además lo exige la
// policy de insert de relevo_conversaciones — así que "Contactar" nunca queda
// habilitado fuera de la audiencia declarada de la publicación.
//
// Sub-filtro por rol del AUTOR sobre ese conjunto ya acotado.
//
// Las opciones se DERIVAN de la matriz (PUBLICACIONES_PERMITIDAS_POR_ROL) en
// vez de listar los tres roles menos el propio: tras 0028 esa resta ya no da
// el conjunto correcto. Un médico solo ve ofertas dirigidas a médicos, y la
// única que las publica es la clínica — un chip "Auxiliares" estaría siempre
// vacío. Derivarlo evita que la lista se vuelva a desalinear si la matriz
// cambia otra vez.
const ROL_LABEL_PLURAL = { clinica: 'Clínicas', medico: 'Médicos', auxiliar: 'Auxiliares' };

function filtrosAutorPara(rol) {
  const autores = Object.entries(PUBLICACIONES_PERMITIDAS_POR_ROL)
    .filter(([autorRol, combos]) => autorRol !== rol && combos.some((c) => c.rolObjetivo === rol))
    .map(([autorRol]) => autorRol);
  return autores.map((r) => ({ value: r, label: ROL_LABEL_PLURAL[r] ?? r }));
}

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
  const navigate = useNavigate();
  const [rolActor, setRolActor] = useState(rolInicial || '');
  const FILTROS_AUTOR = [{ value: '', label: 'Todo' }, ...filtrosAutorPara(perfil.rol)];
  const [publicaciones, setPublicaciones] = useState([]);
  const [conversaciones, setConversaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactando, setContactando] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState({ message: '', tone: 'ok', visible: false });

  // La zona de búsqueda no se escribe aquí: sale de `zona_cobertura` del
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
        fetchMisConversaciones(perfil.id),
      ]);
      setPublicaciones(data.filter((p) => p.autor_id !== perfil.id));
      setConversaciones(mias);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.id]);

  // Con qué ofertas ya tengo conversación abierta, para no ofrecer "Contactar"
  // dos veces sobre la misma (el UNIQUE de 0027 lo impediría igual, pero el
  // botón correcto es "Ver conversación").
  const conversacionPorPublicacion = new Map(
    conversaciones.filter((c) => c.interesado_id === perfil.id).map((c) => [c.publicacion_id, c]),
  );

  // 0030: la cercanía ya no es match exacto de nombre. `zonaCoincide` acepta la
  // misma ciudad o la misma área metropolitana, así que alguien en Envigado ve
  // lo de Bello sin que le entren ofertas del otro lado del país.
  const visibles = publicaciones.filter((p) => {
    if (rolActor && p.autor?.rol !== rolActor) return false;
    return zonaCoincide(p.zona, zonasPerfil);
  });

  async function handleContactar(e) {
    e.preventDefault();
    if (!contactando || !mensaje.trim()) return;
    setEnviando(true);
    try {
      const conversacion = await iniciarConversacion({
        publicacionId: contactando.id,
        interesadoId: perfil.id,
        mensaje,
      });
      setContactando(null);
      setMensaje('');
      navigate(`/relevo/conversacion/${conversacion.id}`);
    } catch (err) {
      showToast(err.message ?? 'No se pudo iniciar la conversación.', 'critical');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-5 pb-24">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-[#5A6B7A]">
          {zonasPerfil.length > 0 ? (
            <>
              Zona de búsqueda: <span className="font-medium text-[#0A1628]">{zonasPerfil.join(', ')}</span> y municipios
              vecinos · edítala en tu perfil.
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
            ? `Sin ofertas activas en ${zonasPerfil.join(', ')} ni en municipios vecinos. Ajusta tu zona en el perfil para ver otras.`
            : 'Sin ofertas activas por ahora.'}
        </Card>
      )}

      {!loading &&
        visibles.map((p) => {
          const badge = ACTOR_BADGE[p.autor?.rol] ?? ACTOR_BADGE.medico;
          const nombreAutor = p.autor?.razon_social || p.autor?.nombre_completo || 'Usuario MUVET';
          const conversacion = conversacionPorPublicacion.get(p.id);
          return (
            <Card key={p.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar
                    fotoUrl={p.autor?.foto_url}
                    nombre={nombreAutor}
                    rol={p.autor?.rol}
                    semilla={p.autor?.id}
                    size={32}
                  />
                  <p className="text-[14px] font-semibold text-[#0A1628]">{nombreAutor}</p>
                </div>
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
              {conversacion ? (
                <Button
                  variant="outline"
                  fullWidth={false}
                  className="!w-auto self-start px-3 py-2 text-[12px]"
                  onClick={() => navigate(`/relevo/conversacion/${conversacion.id}`)}
                >
                  Ver conversación →
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth={false}
                  className="!w-auto self-start px-3 py-2 text-[12px]"
                  onClick={() => setContactando(p)}
                >
                  Contactar
                </Button>
              )}
            </Card>
          );
        })}

      <Modal open={Boolean(contactando)} onClose={() => setContactando(null)} title="Contactar">
        <form onSubmit={handleContactar} className="flex flex-col gap-3">
          <p className="text-[12px] text-[#5A6B7A]">
            Abre una conversación privada para aclarar dudas. <span className="font-medium text-[#0A1628]">No te
            compromete a nada</span>: el turno se cierra solo cuando las dos partes marquen que están de acuerdo.
          </p>
          <textarea
            rows={4}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Preséntate o pregunta lo que necesites saber…"
            className="w-full rounded-[10px] border border-[#E1E8ED] bg-white px-3 py-2.5 text-[14px] text-[#0A1628] outline-none focus:border-[#1A7A5E]"
          />
          <Button type="submit" disabled={enviando || !mensaje.trim()}>
            {enviando ? 'Abriendo…' : 'Contactar'}
          </Button>
        </form>
      </Modal>

      <Toast message={toast.message} tone={toast.tone} visible={toast.visible} />
    </div>
  );
}
