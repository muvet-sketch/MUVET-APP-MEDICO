// N-28 · Home Auxiliar/Clínica (Fase 7). Dashboard simplificado: módulos
// gremiales + perfil — sin ningún rastro de flujo clínico ni Constelación
// (D-543).
//
// Mismo orden que la Home del médico (N-2): módulos → lo mío → tablones →
// historial. El botón "👤 Mi perfil" que había aquí desapareció: el perfil se
// alcanza por la pestaña de la barra inferior en los dos roles.
//
// El auxiliar participa en DOS módulos (MUVET Turnos y MUVET Auxiliar) y la
// clínica solo en uno, así que todo lo de /apoyo va tras `!esClinica`.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { fetchMisPublicaciones, fetchMisConversaciones } from '../../lib/relevo';
import { fetchMisPublicacionesApoyo, fetchMisConversacionesApoyo } from '../../lib/apoyo';
import { fetchMisOfertasEspecialista, fetchMisConversacionesEspecialista } from '../../lib/especialistas';
import {
  CORTO_AUXILIAR,
  CORTO_ESPECIALISTAS,
  CORTO_TURNOS,
  NOMBRE_AUXILIAR,
  NOMBRE_ESPECIALISTAS,
  NOMBRE_TURNOS,
} from '../../lib/nombresModulos';
import { Card, Button, BottomNav, NotificationBell, AppMenu } from '../../components/ui';
import OfertasRecientes from '../../components/home/OfertasRecientes';
import ApoyoDisponibles from '../../components/home/ApoyoDisponibles';
import MisPublicaciones from '../../components/home/MisPublicaciones';
import HistorialReciente from '../../components/home/HistorialReciente';
import ServiciosAceptados from '../../components/home/ServiciosAceptados';
import PerfilAuxiliarInline from './PerfilAuxiliarInline';
import HabilidadesPerfilSection from '../../components/HabilidadesPerfilSection';
import MetodosPagoSection from '../../components/MetodosPagoSection';

export default function N28HomeSimplificado() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Contadores del subtítulo de cada tarjeta de módulo. El listado de "Mis
  // publicaciones" ya no sale de acá: lo trae su propio componente, que además
  // cubre los tres módulos y deja activar/pausar desde la Home.
  const [contadores, setContadores] = useState({
    turnosPubs: 0,
    turnosConversaciones: 0,
    apoyoPubs: 0,
    apoyoConversaciones: 0,
    especialistasOfertas: 0,
    especialistasConversaciones: 0,
  });
  const [loading, setLoading] = useState(true);

  // El panel de perfil del auxiliar se abre y se cierra desde la URL, no desde
  // un estado propio: la pestaña "Perfil" de la barra inferior navega a
  // /home-simplificado?perfil=1 y, estando ya en esta pantalla, eso cambia el
  // search param SIN remontar el componente. Derivarlo aquí es lo que hace que
  // el panel abra también en ese caso.
  const mostrarPerfil = searchParams.get('perfil') === '1';

  useEffect(() => {
    if (!perfil?.id) return undefined;
    let active = true;
    const esAuxiliar = perfil.rol === 'auxiliar';
    const vacio = Promise.resolve([]);

    // allSettled: que falle MUVET Auxiliar no debe dejar en blanco los
    // contadores de MUVET Turnos, ni al revés.
    // La clínica no publica en el tablón de N-35 (solo busca en el directorio),
    // así que sus ofertas propias no se piden.
    Promise.allSettled([
      fetchMisPublicaciones(perfil.id),
      fetchMisConversaciones(perfil.id),
      esAuxiliar ? fetchMisPublicacionesApoyo(perfil.id) : vacio,
      esAuxiliar ? fetchMisConversacionesApoyo(perfil.id) : vacio,
      esAuxiliar ? fetchMisOfertasEspecialista(perfil.id) : vacio,
      fetchMisConversacionesEspecialista(perfil.id),
    ])
      .then(([turnosPubs, turnosConv, apoyoPubs, apoyoConv, espOfertas, espConv]) => {
        if (!active) return;
        const filas = (r) => (r.status === 'fulfilled' ? r.value ?? [] : []);
        // Solo las vivas: una negociación cerrada ya no es algo que atender.
        const abiertas = (cs) => cs.filter((c) => c.estado === 'abierta').length;
        setContadores({
          turnosPubs: filas(turnosPubs).filter((p) => p.activa).length,
          turnosConversaciones: abiertas(filas(turnosConv)),
          apoyoPubs: filas(apoyoPubs).filter((p) => p.activa && p.estado === 'abierta').length,
          apoyoConversaciones: abiertas(filas(apoyoConv)),
          especialistasOfertas: filas(espOfertas).filter((o) => o.activa && o.estado === 'abierta').length,
          especialistasConversaciones: abiertas(filas(espConv)),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfil?.id, perfil?.rol]);

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
              : `${contadores.turnosPubs} publicación(es) activa(s) · ${contadores.turnosConversaciones} conversación(es) abierta(s)`}
          </p>
        </div>
        <Button variant="outline" fullWidth={false} onClick={() => navigate('/relevo')}>
          {`Ir a ${CORTO_TURNOS}`}
        </Button>
      </Card>

      {/* El segundo módulo del auxiliar. Hasta ahora solo se alcanzaba por la
          barra inferior. La clínica no participa (es médico↔auxiliar). */}
      {!esClinica && (
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-[#0A1628]">{NOMBRE_AUXILIAR}</p>
            <p className="text-[12px] text-[#5A6B7A]">
              {loading
                ? 'Cargando…'
                : `${contadores.apoyoPubs} publicación(es) activa(s) · ${contadores.apoyoConversaciones} conversación(es) abierta(s)`}
            </p>
          </div>
          <Button variant="outline" fullWidth={false} onClick={() => navigate('/apoyo')}>
            {`Ir a ${CORTO_AUXILIAR}`}
          </Button>
        </Card>
      )}

      {/* MUVET Especialistas (N-35, 0039). Los dos roles entran, a cosas
          distintas: la clínica busca especialistas en el directorio (no publica
          en el tablón, de ahí que no se le cuenten ofertas propias) y el
          auxiliar publica para que los especialistas lo encuentren. Qué ve cada
          uno lo deciden las pestañas de N-35 y la RLS de 0039. */}
      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-[#0A1628]">{NOMBRE_ESPECIALISTAS}</p>
          <p className="text-[12px] text-[#5A6B7A]">
            {loading
              ? 'Cargando…'
              : esClinica
                ? `Busca especialistas · ${contadores.especialistasConversaciones} conversación(es) abierta(s)`
                : `${contadores.especialistasOfertas} oferta(s) activa(s) · ${contadores.especialistasConversaciones} conversación(es) abierta(s)`}
          </p>
        </div>
        <Button variant="outline" fullWidth={false} onClick={() => navigate('/especialistas')}>
          {`Ir a ${CORTO_ESPECIALISTAS}`}
        </Button>
      </Card>

      {/* Lo acordado que sigue en curso: con quién, dónde, y la puerta al
          chat (0028). El auxiliar ve Turnos + Auxiliar; la clínica solo
          Turnos, que es el único módulo en el que participa. */}
      <ServiciosAceptados perfil={perfil} />

      {/* Sustituye al antiguo bloque plano "Mis publicaciones activas", que
          solo listaba MUVET Turnos, mostraba descripción y zona y no dejaba
          hacer nada. Ahora cubre los dos módulos del auxiliar y permite
          activar o pausar sin salir del Home. */}
      <MisPublicaciones perfil={perfil} />

      <OfertasRecientes perfil={perfil} />

      {!esClinica && <ApoyoDisponibles perfil={perfil} />}

      {/* N-35 no tiene vista previa acá: su tarjeta de módulo está arriba, con
          las de Turnos y Auxiliar. Un directorio no caduca —a diferencia de los
          tablones— así que listar tres fichas sueltas no aportaría nada que la
          tarjeta de arriba no diga ya. */}

      <HistorialReciente perfil={perfil} />

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
