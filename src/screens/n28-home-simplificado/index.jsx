// N-28 · Home Auxiliar/Clínica (Fase 7). Dashboard simplificado: solo MUVET
// Turnos + perfil — sin ningún rastro de flujo clínico ni Constelación (D-543).
//
// Mismo orden que la Home del médico (N-2): módulo → ofertas recientes →
// historial. El botón "👤 Mi perfil" que había aquí desapareció: el perfil se
// alcanza por la pestaña de la barra inferior en los dos roles.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { fetchMisPublicaciones, fetchMisConversaciones } from '../../lib/relevo';
import { CORTO_TURNOS, NOMBRE_TURNOS } from '../../lib/nombresModulos';
import { Card, Button, BottomNav, NotificationBell, AppMenu } from '../../components/ui';
import OfertasRecientes from '../../components/home/OfertasRecientes';
import HistorialReciente from '../../components/home/HistorialReciente';
import ServiciosAceptados from '../../components/home/ServiciosAceptados';
import PerfilAuxiliarInline from './PerfilAuxiliarInline';
import HabilidadesPerfilSection from '../../components/HabilidadesPerfilSection';
import MetodosPagoSection from '../../components/MetodosPagoSection';

export default function N28HomeSimplificado() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [publicaciones, setPublicaciones] = useState([]);
  const [conversacionesAbiertas, setConversacionesAbiertas] = useState(0);
  const [loading, setLoading] = useState(true);

  // El panel de perfil del auxiliar se abre y se cierra desde la URL, no desde
  // un estado propio: la pestaña "Perfil" de la barra inferior navega a
  // /home-simplificado?perfil=1 y, estando ya en esta pantalla, eso cambia el
  // search param SIN remontar el componente. Derivarlo aquí es lo que hace que
  // el panel abra también en ese caso.
  const mostrarPerfil = searchParams.get('perfil') === '1';

  useEffect(() => {
    if (!perfil?.id) return;
    let active = true;
    Promise.all([fetchMisPublicaciones(perfil.id), fetchMisConversaciones(perfil.id)])
      .then(([pubs, conversaciones]) => {
        if (!active) return;
        setPublicaciones(pubs.filter((p) => p.activa));
        // Solo las vivas: una negociación cerrada ya no es algo que atender.
        setConversacionesAbiertas(conversaciones.filter((c) => c.estado === 'abierta').length);
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
        {/* 0028: "Salir" y "Mi perfil" viven ahora en el menú hamburguesa. */}
        <div className="flex items-center gap-1">
          <NotificationBell perfilId={perfil.id} />
          <AppMenu />
        </div>
      </div>

      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-[#0A1628]">{NOMBRE_TURNOS}</p>
          <p className="text-[12px] text-[#5A6B7A]">
            {loading
              ? 'Cargando…'
              : `${publicaciones.length} publicación(es) activa(s) · ${conversacionesAbiertas} conversación(es) abierta(s)`}
          </p>
        </div>
        <Button variant="outline" fullWidth={false} onClick={() => navigate('/relevo')}>
          {`Ir a ${CORTO_TURNOS}`}
        </Button>
      </Card>

      {/* Lo acordado que sigue en curso: con quién, dónde, y la puerta al
          chat (0028). El auxiliar ve Turnos + Auxiliar; la clínica solo
          Turnos, que es el único módulo en el que participa. */}
      <ServiciosAceptados perfil={perfil} />

      <OfertasRecientes perfil={perfil} />

      <HistorialReciente perfil={perfil} />

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

      {!esClinica && mostrarPerfil && (
        <>
          <PerfilAuxiliarInline onClose={() => setSearchParams({})} />
          {/* El auxiliar configura sus habilidades aquí; la clínica no las
              tiene en perfil (las declara por oferta, ver 0015). */}
          <HabilidadesPerfilSection />
          {/* Datos de pago del auxiliar (0029). La clínica no lleva esta
              sección; ya está fuera por el `!esClinica` de arriba. */}
          <MetodosPagoSection />
        </>
      )}

      <BottomNav />
    </div>
  );
}
