import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select } from '../../components/ui';
import { ZONAS_COBERTURA } from '../../lib/municipios';
import {
  TIPOS_OFERTA,
  fetchOfertasEspecialista,
  iniciarConversacionOferta,
} from '../../lib/especialistas';
import OfertaCard from './OfertaCard';
import ContactarModal from './ContactarModal';

// Mitad B · El tablón, del lado de quien RESPONDE. Solo lo ven los médicos
// especialistas (lo cierra la pestaña en index.jsx y la policy de insert de
// conversaciones, que exige `es_especialista_directorio(auth.uid())`).
//
// Se muestran los DOS tipos de oferta: una 'busco' de un auxiliar es trabajo
// para el especialista, y una 'ofrezco' de otro especialista es un colega con
// quien colaborar. El filtro por tipo es una preferencia, no una regla.
const FILTROS_TIPO = [{ value: '', label: 'Todas' }, ...TIPOS_OFERTA.map((t) => ({ value: t.value, label: t.label }))];

export default function TabTablon({ perfil }) {
  const navigate = useNavigate();
  const [ofertas, setOfertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tipo, setTipo] = useState('');
  const [zona, setZona] = useState('');
  const [respondiendo, setRespondiendo] = useState(null);

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError('');
    fetchOfertasEspecialista({
      tipo: tipo || undefined,
      zona: zona || undefined,
      excluirAutorId: perfil.id,
    })
      .then((data) => {
        if (activo) setOfertas(data);
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar las ofertas.');
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [perfil.id, tipo, zona]);

  async function handleResponder(texto) {
    const conversacion = await iniciarConversacionOferta({
      ofertaId: respondiendo.id,
      interesadoId: perfil.id,
      mensaje: texto,
    });
    setRespondiendo(null);
    navigate(`/especialistas/conversacion/${conversacion.id}`);
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-5 pb-24">
      <p className="text-[12px] text-[#5A6B7A]">
        Ofertas publicadas por auxiliares y por otros especialistas. Responde la que te sirva y negocien por el chat.
      </p>

      <div className="flex gap-2">
        {FILTROS_TIPO.map((f) => (
          <button
            key={f.value || 'todas'}
            type="button"
            onClick={() => setTipo(f.value)}
            className={`flex-1 whitespace-nowrap rounded-[10px] border px-1 py-2 text-[11px] ${
              tipo === f.value ? 'border-[#1A7A5E] bg-[#1A7A5E1A] text-[#0A1628]' : 'border-[#E1E8ED] text-[#0A1628]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Select
        name="zona"
        value={zona}
        onChange={(e) => setZona(e.target.value)}
        placeholder="Toda zona"
        options={ZONAS_COBERTURA}
      />

      {error && <p className="text-[12px] text-[#C63B3B]">{error}</p>}
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}

      {!loading && ofertas.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">
          {tipo || zona ? 'Ninguna oferta coincide con estos filtros.' : 'Todavía no hay ofertas publicadas.'}
        </Card>
      )}

      {!loading &&
        ofertas.map((o) => <OfertaCard key={o.id} oferta={o} onResponder={setRespondiendo} />)}

      <ContactarModal
        open={Boolean(respondiendo)}
        onClose={() => setRespondiendo(null)}
        titulo="Responder oferta"
        ayuda="Se abre una conversación privada con quien publicó. El trato queda cerrado cuando los dos estén de acuerdo."
        placeholder="Preséntate y cuéntale por qué te interesa…"
        onEnviar={handleResponder}
      />
    </div>
  );
}
