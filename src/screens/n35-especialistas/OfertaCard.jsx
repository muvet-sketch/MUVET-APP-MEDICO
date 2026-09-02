import { Card, Badge, Avatar, Button } from '../../components/ui';
import { formatCOP } from '../../lib/format';
import { formatFechaOferta, formatFranjaOferta, labelTipoOferta } from '../../lib/especialistas';

// Tarjeta de una oferta del tablón (mitad B). La usa TabTablon (ofertas ajenas,
// con botón de responder) y TabMiOferta (las propias, con las acciones de
// gestión pasadas como `children`).
//
// `autor_rol` viene denormalizado en la fila (lo escribe el trigger de alta):
// `perfiles` no es legible entre usuarios, así que sin esa columna habría que
// resolver el rol contra `perfiles_publico` solo para pintar una etiqueta.
const ROL_LABEL = { medico: '🩺 Especialista', auxiliar: '🧰 Auxiliar' };

const TIPO_TONE = { ofrezco: 'ok', busco: 'info' };

export default function OfertaCard({ oferta, onResponder, children }) {
  const autor = oferta.autor;
  const nombre = autor?.nombre_completo || autor?.razon_social || 'Usuario MUVET';
  const fecha = formatFechaOferta(oferta);
  const franja = formatFranjaOferta(oferta);

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        {autor ? (
          <div className="flex items-center gap-2">
            <Avatar
              fotoUrl={autor.foto_url}
              nombre={nombre}
              rol={autor.rol}
              semilla={autor.id}
              size={28}
            />
            <div className="flex flex-col">
              <p className="text-[13px] font-semibold text-[#0A1628]">{nombre}</p>
              <p className="text-[11px] text-[#5A6B7A]">{ROL_LABEL[oferta.autor_rol] ?? ''}</p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] font-semibold text-[#0A1628]">{ROL_LABEL[oferta.autor_rol] ?? 'Oferta'}</p>
        )}
        <Badge tone={TIPO_TONE[oferta.tipo] ?? 'neutral'}>{labelTipoOferta(oferta.tipo)}</Badge>
      </div>

      {oferta.especialidad && (
        <p className="text-[13px] font-medium text-[#0A1628]">{oferta.especialidad}</p>
      )}

      <p className="text-[13px] text-[#0A1628]">{oferta.descripcion || '(sin descripción)'}</p>

      <p className="text-[12px] text-[#5A6B7A]">
        {oferta.zona ? `📍 ${oferta.zona}` : ''}
        {fecha ? `${oferta.zona ? ' · ' : ''}${fecha}` : ''}
        {franja ? ` · ${franja}` : ''}
      </p>

      {oferta.tarifa != null && (
        <p className="text-[13px] font-semibold text-[#1A7A5E]">{formatCOP(oferta.tarifa)}</p>
      )}

      {onResponder && (
        <Button variant="secondary" onClick={() => onResponder(oferta)}>
          Responder
        </Button>
      )}

      {children}
    </Card>
  );
}
