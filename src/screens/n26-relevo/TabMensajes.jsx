import { useEffect, useState } from 'react';
import { Card } from '../../components/ui';
import { fetchMensajesRecibidos } from '../../lib/relevo';

const ACTOR_LABEL = { clinica: '🏥 Clínica', auxiliar: '🧰 Auxiliar', medico: '🩺 Médico' };

export default function TabMensajes({ perfil }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchMensajesRecibidos(perfil.id)
      .then((data) => {
        if (active) setMensajes(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil.id]);

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      <p className="text-[12px] text-[#5A6B7A]">Mensajes recibidos sobre tus publicaciones.</p>

      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
      {!loading && mensajes.length === 0 && (
        <Card className="text-center text-[12px] text-[#5A6B7A]">Aún no tienes mensajes.</Card>
      )}

      {!loading &&
        mensajes.map((m) => {
          const nombreRemitente = m.remitente?.razon_social || m.remitente?.nombre_completo || 'Usuario MUVET';
          return (
            <Card key={m.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[#0A1628]">{nombreRemitente}</p>
                <span className="text-[11px] text-[#5A6B7A]">{ACTOR_LABEL[m.remitente?.rol] ?? ''}</span>
              </div>
              <p className="text-[12px] text-[#5A6B7A]">Sobre: {m.publicacion?.descripcion || '(sin descripción)'}</p>
              <p className="text-[13px] text-[#0A1628]">{m.mensaje}</p>
            </Card>
          );
        })}
    </div>
  );
}
