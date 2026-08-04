// N-28 · Home Auxiliar/Clínica (Fase 7). Dashboard simplificado: solo Relevo
// + perfil — sin ningún rastro de flujo clínico ni Constelación (D-543).
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { signOut } from '../../lib/auth';
import { fetchMisPublicaciones, fetchMensajesRecibidos } from '../../lib/relevo';
import { Card, Button, BottomNav, NotificationBell } from '../../components/ui';
import PerfilAuxiliarInline from './PerfilAuxiliarInline';
import HabilidadesPerfilSection from '../../components/HabilidadesPerfilSection';

export default function N28HomeSimplificado() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [publicaciones, setPublicaciones] = useState([]);
  const [mensajesCount, setMensajesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mostrarPerfil, setMostrarPerfil] = useState(searchParams.get('perfil') === '1');

  useEffect(() => {
    if (!perfil?.id) return;
    let active = true;
    Promise.all([fetchMisPublicaciones(perfil.id), fetchMensajesRecibidos(perfil.id)])
      .then(([pubs, mensajes]) => {
        if (!active) return;
        setPublicaciones(pubs.filter((p) => p.activa));
        setMensajesCount(mensajes.length);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id]);

  if (!perfil) return null;

  const esClinica = perfil.rol === 'clinica';
  const nombreMostrado = esClinica ? perfil.razon_social || perfil.nombre_completo : perfil.nombre_completo;

  return (
    <div className="flex min-h-svh flex-col gap-5 px-5 py-6 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] text-[#5A6B7A]">Hola,</p>
          <h1 className="text-[18px] font-semibold text-[#0A1628]">{nombreMostrado}</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell perfilId={perfil.id} />
          <button type="button" onClick={signOut} className="text-[12px] text-[#5A6B7A] underline underline-offset-2">
            Salir
          </button>
        </div>
      </div>

      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-[#0A1628]">MUVET Relevo</p>
          <p className="text-[12px] text-[#5A6B7A]">
            {loading ? 'Cargando…' : `${publicaciones.length} publicación(es) activa(s) · ${mensajesCount} mensaje(s)`}
          </p>
        </div>
        <Button variant="outline" fullWidth={false} onClick={() => navigate('/relevo')}>
          Ir a Relevo
        </Button>
      </Card>

      {!loading && publicaciones.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold text-[#5A6B7A]">Mis publicaciones activas</p>
          {publicaciones.map((p) => (
            <Card key={p.id} className="flex flex-col gap-1">
              <p className="text-[13px] font-medium text-[#0A1628]">{p.descripcion || '(sin descripción)'}</p>
              <p className="text-[12px] text-[#5A6B7A]">{p.zona || 'Sin zona'}</p>
            </Card>
          ))}
        </div>
      )}

      {esClinica ? (
        <Button variant="ghost" onClick={() => navigate('/perfil-clinica')}>
          👤 Mi perfil
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => setMostrarPerfil((v) => !v)}>
          👤 Mi perfil
        </Button>
      )}

      {!esClinica && mostrarPerfil && (
        <>
          <PerfilAuxiliarInline onClose={() => setMostrarPerfil(false)} />
          {/* El auxiliar configura sus habilidades aquí; la clínica no las
              tiene en perfil (las declara por oferta, ver 0015). */}
          <HabilidadesPerfilSection />
        </>
      )}

      <BottomNav />
    </div>
  );
}
