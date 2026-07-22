import { useEffect, useState } from 'react';
import { Card } from '../../components/ui';
import { fetchMisPublicaciones } from '../../lib/relevo';

export default function MisPublicacionesSection({ perfil }) {
  const [publicaciones, setPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchMisPublicaciones(perfil.id)
      .then((data) => {
        if (active) setPublicaciones(data.filter((p) => p.activa));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil.id]);

  return (
    <Card className="flex flex-col gap-2">
      <p className="text-[14px] font-semibold text-[#0A1628]">Publicaciones activas en Relevo</p>
      {loading && <p className="text-[12px] text-[#5A6B7A]">Cargando…</p>}
      {!loading && publicaciones.length === 0 && <p className="text-[12px] text-[#5A6B7A]">Sin publicaciones activas.</p>}
      {!loading &&
        publicaciones.map((p) => (
          <div key={p.id} className="rounded-[10px] bg-[#F4F7F9] px-3 py-2.5">
            <p className="text-[13px] font-medium text-[#0A1628]">{p.descripcion || '(sin descripción)'}</p>
            <p className="text-[12px] text-[#5A6B7A]">{p.zona || 'Sin zona'}</p>
          </div>
        ))}
    </Card>
  );
}
