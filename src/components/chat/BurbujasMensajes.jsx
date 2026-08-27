import { useEffect, useRef, useState } from 'react';
import { formatFechaCorta } from '../../lib/format';

// Lista de burbujas de un chat, con auto-scroll al fondo y adjuntos resueltos
// a signed URL (0028).
//
// Nace de extraer la estructura visual que ChatCobertura (N-30) estrenó y que
// ConversacionRelevo (N-26) ya copiaba a mano. Lo estrena N-32; los otros dos
// pueden adoptarlo después sin prisa — el riesgo real de esos módulos está en
// sus RLS y triggers, no en pintar burbujas, y tocarlos hoy ensancharía el
// alcance sin ganancia.
//
// `resolverUrlAdjunto` se recibe por parámetro en vez de importar el de un
// módulo concreto: cada chat tiene su propio bucket privado.

function ArchivoAdjunto({ path, tipo, nombre, resolverUrl }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    resolverUrl(path)
      .then((signed) => {
        if (active) setUrl(signed);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [path, resolverUrl]);

  if (!url) return <p className="text-[12px] text-[#5A6B7A]">Cargando adjunto…</p>;

  if (tipo?.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={nombre || 'Adjunto'} className="max-h-48 rounded-[10px] object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[13px] underline">
      📎 {nombre || 'Archivo adjunto'}
    </a>
  );
}

export default function BurbujasMensajes({ mensajes, perfilId, resolverUrlAdjunto, vacio }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {mensajes.length === 0 && (
        <p className="py-8 text-center text-[13px] text-[#5A6B7A]">
          {vacio ?? 'Todavía no hay mensajes.'}
        </p>
      )}

      <div className="flex flex-col gap-2 pb-2">
        {mensajes.map((m) => {
          const esMio = m.remitente_id === perfilId;
          return (
            <div key={m.id} className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[80%] rounded-[12px] px-3 py-2 ${
                  esMio ? 'bg-[#0A1628] text-white' : 'bg-[#F4F7F9] text-[#0A1628]'
                }`}
              >
                {m.mensaje && <p className="whitespace-pre-wrap text-[13px]">{m.mensaje}</p>}
                {m.archivo_path && resolverUrlAdjunto && (
                  <ArchivoAdjunto
                    path={m.archivo_path}
                    tipo={m.archivo_tipo}
                    nombre={m.archivo_nombre}
                    resolverUrl={resolverUrlAdjunto}
                  />
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-[#5A6B7A]">{formatFechaCorta(m.created_at)}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
