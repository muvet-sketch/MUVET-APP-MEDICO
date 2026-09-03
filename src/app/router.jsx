import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

import N1Login from '../screens/n1-login';
import N2Home from '../screens/n2-home';
import N4Constelacion from '../screens/n4-constelacion';
import N21AperturaServicio from '../screens/n21-apertura-servicio';
import N19CierreServicio from '../screens/n19-cierre-servicio';
import N8PerfilMedico from '../screens/n8-perfil-medico';
import N9Historial from '../screens/n9-historial';
import N5ExpedienteMascota from '../screens/n5-expediente-mascota';
import N10ConstelacionHub from '../screens/n10-constelacion-hub';
import N15Soap from '../screens/n15-soap';
import N12Formula from '../screens/n12-formula';
import N17OrdenesExternas from '../screens/n17-ordenes-externas';
import Seguimientos from '../screens/seguimientos';
import N18Recomendaciones from '../screens/n18-recomendaciones';
import VacunasDesparasitaciones from '../screens/vacunas-desparasitaciones';
import N26Relevo from '../screens/n26-relevo';
import ConversacionRelevo from '../screens/n26-relevo/ConversacionRelevo';
import N27CatalogoServicios from '../screens/n27-catalogo-servicios';
import N28HomeSimplificado from '../screens/n28-home-simplificado';
import N28PerfilAuxiliar from '../screens/n28-perfil-auxiliar';
import N29PerfilClinica from '../screens/n29-perfil-clinica';
import N30CoberturaServicio from '../screens/n30-cobertura-servicio';
import ChatCobertura from '../screens/n30-cobertura-servicio/ChatCobertura';
import N31Notificaciones from '../screens/n31-notificaciones';
import N32Auxiliar from '../screens/n32-auxiliar';
import ConversacionApoyo from '../screens/n32-auxiliar/ConversacionApoyo';
import N35Especialistas from '../screens/n35-especialistas';
import ConversacionEspecialista from '../screens/n35-especialistas/ConversacionEspecialista';
import Soporte from '../screens/soporte';
import N33Mejoras from '../screens/n33-mejoras';
import N34Mensajes from '../screens/n34-mensajes';
import N34MensajesContacto from '../screens/n34-mensajes/HistorialContacto';

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<N1Login />} />
      <Route path="/login" element={<N1Login />} />

      <Route
        path="/home"
        element={
          <ProtectedRoute allowedRoles={['medico']}>
            <N2Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home-simplificado"
        element={
          <ProtectedRoute allowedRoles={['auxiliar', 'clinica']}>
            <N28HomeSimplificado />
          </ProtectedRoute>
        }
      />

      {/*
        -- SUPUESTO (confirmado con el fundador): N-3 (Solicitud recibida) se
        implementó como overlay montado desde N2Home (ver
        src/screens/n3-solicitudes/index.jsx), no como ruta navegable — así
        se cumple "no navegable hacia atrás manualmente" sin depender de
        bloquear el historial del navegador. Por eso no hay ruta /solicitudes.
      */}
      <Route path="/constelacion/:servicioId" element={<ProtectedRoute allowedRoles={['medico']}><N4Constelacion /></ProtectedRoute>} />
      {/* N-21: Apertura (check-in D-537 + doble consentimiento D-116) — implementada en
          Fase 4, renumerada en Fase 5 (Acción 0, DESP-CLAUDECODE-P-EI-AppMedico-005). */}
      <Route path="/servicio/:servicioId/apertura" element={<ProtectedRoute allowedRoles={['medico']}><N21AperturaServicio /></ProtectedRoute>} />
      {/* N-10: Hub de Constelación (shell) — implementado en Fase 4. Solo accesible tras
          completar Apertura (estado 'activa'); el propio componente redirige si no. */}
      <Route path="/servicio/:servicioId/activo" element={<ProtectedRoute allowedRoles={['medico']}><N10ConstelacionHub /></ProtectedRoute>} />
      {/* N-15: SOAP + constantes vitales — implementada en Fase 5. */}
      <Route path="/soap/:servicioId" element={<ProtectedRoute allowedRoles={['medico']}><N15Soap /></ProtectedRoute>} />
      <Route path="/cierre/:servicioId" element={<ProtectedRoute allowedRoles={['medico']}><N19CierreServicio /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute allowedRoles={['medico']}><N8PerfilMedico /></ProtectedRoute>} />
      {/* /historial: historial único de MUVET Relevo + MUVET Turnos. Abierta a
          los 3 actores, igual que /relevo — un auxiliar o una clínica también
          acumulan ofertas y conversaciones cerradas. Lo de MUVET Relevo
          (médico↔médico) simplemente les vuelve vacío. El historial de
          DOMICILIOS ya no está aquí: vive en /servicios (N-27). */}
      <Route path="/historial" element={<ProtectedRoute><N9Historial /></ProtectedRoute>} />
      {/* N-34: Mensajes — bandeja unificada AGRUPADA POR CONTACTO (las mismas
          tres fuentes que /historial, pero abierto + cerrado y por persona en
          vez de cronológico). Abierta a los 3 actores, igual que /historial:
          cada rol ve solo los módulos en los que participa (la clínica no tiene
          MUVET Relevo ni MUVET Auxiliar, y le queda solo Turnos).
          No hay pantalla de chat propia: cada conversación se abre en el hilo
          de su módulo, que es donde viven sus acciones y su RLS. */}
      <Route path="/mensajes" element={<ProtectedRoute><N34Mensajes /></ProtectedRoute>} />
      <Route path="/mensajes/:contactoId" element={<ProtectedRoute><N34MensajesContacto /></ProtectedRoute>} />
      {/* N-5: Expediente del paciente — implementado en Fase 3, renumerado en Fase 4
          (Acción 0, ver CLAUDE.md/D-56X-ENM). Acepta ?modo=lectura (desde N-4) y el id
          literal 'nuevo' (caso paciente sin expediente previo). */}
      <Route path="/mascotas/:mascotaId" element={<ProtectedRoute allowedRoles={['medico']}><N5ExpedienteMascota /></ProtectedRoute>} />
      {/* N-12: Fórmula médica (DCI + aviso sustancias controladas D-539) — Fase 5. */}
      <Route path="/formula/:servicioId" element={<ProtectedRoute allowedRoles={['medico']}><N12Formula /></ProtectedRoute>} />
      <Route path="/ordenes/:servicioId" element={<ProtectedRoute allowedRoles={['medico']}><N17OrdenesExternas /></ProtectedRoute>} />
      <Route path="/seguimientos" element={<ProtectedRoute allowedRoles={['medico']}><Seguimientos /></ProtectedRoute>} />
      <Route path="/recomendaciones/:servicioId" element={<ProtectedRoute allowedRoles={['medico']}><N18Recomendaciones /></ProtectedRoute>} />
      <Route path="/vacunas/:mascotaId" element={<ProtectedRoute allowedRoles={['medico']}><VacunasDesparasitaciones /></ProtectedRoute>} />
      {/* /relevo = MUVET Turnos en la UI (la bolsa gremial), NO "MUVET Relevo",
          que es /cobertura-servicio. Ver lib/nombresModulos.js.
          Abierta a los 3 tipos de actor (D-540/D-545). El hilo de
          negociación va en ruta propia para que las notificaciones de 0027
          puedan hacer deep-link a una conversación concreta; quién puede
          abrirla lo decide la RLS de relevo_conversaciones, no el router
          (mismo criterio que /cobertura-servicio/chat/:solicitudId). */}
      <Route path="/relevo" element={<ProtectedRoute><N26Relevo /></ProtectedRoute>} />
      <Route path="/relevo/conversacion/:conversacionId" element={<ProtectedRoute><ConversacionRelevo /></ProtectedRoute>} />
      <Route path="/servicios" element={<ProtectedRoute allowedRoles={['medico']}><N27CatalogoServicios /></ProtectedRoute>} />
      <Route path="/perfil-auxiliar" element={<ProtectedRoute allowedRoles={['auxiliar']}><N28PerfilAuxiliar /></ProtectedRoute>} />
      <Route path="/perfil-clinica" element={<ProtectedRoute allowedRoles={['clinica']}><N29PerfilClinica /></ProtectedRoute>} />
      {/* MUVET Relevo (N-30): médico↔médico, pasar un servicio ya agendado.
          ⚠️ La ruta conserva el nombre viejo del módulo, "cobertura-servicio":
          en la UI esto es "MUVET Relevo" y /relevo es "MUVET Turnos". No es un
          error — ver el bloque de lib/nombresModulos.js.
          Ver supabase/migrations/0023_cobertura_servicio.sql para el detalle y la
          excepción explícita a D-540 (chat en tiempo real) confirmada con el fundador. */}
      <Route path="/cobertura-servicio" element={<ProtectedRoute allowedRoles={['medico']}><N30CoberturaServicio /></ProtectedRoute>} />
      <Route path="/cobertura-servicio/chat/:solicitudId" element={<ProtectedRoute allowedRoles={['medico']}><ChatCobertura /></ProtectedRoute>} />
      {/* MUVET Auxiliar (N-32, migración 0028): médico↔auxiliar. Salió de
          MUVET Turnos, que se queda con lo que involucra a una clínica.
          ⚠️ La ruta es /apoyo y las tablas apoyo_*: el identificador interno NO
          es `auxiliar` porque ese ya es un valor de perfiles.rol. Ver el bloque
          de lib/nombresModulos.js.
          Solo médico y auxiliar: la clínica no participa en este matching. */}
      <Route path="/apoyo" element={<ProtectedRoute allowedRoles={['medico', 'auxiliar']}><N32Auxiliar /></ProtectedRoute>} />
      <Route path="/apoyo/conversacion/:conversacionId" element={<ProtectedRoute allowedRoles={['medico', 'auxiliar']}><ConversacionApoyo /></ProtectedRoute>} />
      {/* MUVET Especialistas (N-35, migración 0039): directorio de médicos
          especialistas + tablón de ofertas.
          ✅ A diferencia de los otros tres módulos gremiales, acá la ruta, las
          tablas y el nombre visible SÍ coinciden (ver lib/nombresModulos.js).
          Abierta a los 3 actores, pero cada uno ve cosas distintas y eso NO lo
          decide el router: el médico y la clínica ven el directorio (lo cierra
          el WHERE de la vista `especialistas_directorio`), el auxiliar solo
          publica en el tablón, y responder ofertas exige estar en el directorio
          (policy de insert de `especialista_conversaciones`).
          El hilo va en ruta propia para que las notificaciones de 0039 puedan
          hacer deep-link a una conversación concreta — mismo criterio que
          /relevo/conversacion/:id y /apoyo/conversacion/:id.
          ⚠️ Solo médico y clínica: por decisión del fundador el auxiliar ya no
          entra a MUVET Especialistas (antes publicaba en el tablón). */}
      <Route path="/especialistas" element={<ProtectedRoute allowedRoles={['medico', 'clinica']}><N35Especialistas /></ProtectedRoute>} />
      <Route path="/especialistas/conversacion/:conversacionId" element={<ProtectedRoute allowedRoles={['medico', 'clinica']}><ConversacionEspecialista /></ProtectedRoute>} />
      {/* N-31: Notificaciones (migración 0026). Abierta a los 3 actores, igual
          que /relevo y /historial — las notificaciones de MUVET Turnos le
          llegan a cualquiera de ellos; las de MUVET Relevo (médico↔médico)
          simplemente no existen para auxiliar ni clínica.
          Ya no hay pestaña "Alertas" en BottomNav: aquí se llega por la campana
          del header (ScreenHeader conCampana) y la de los dos Home. */}
      <Route path="/notificaciones" element={<ProtectedRoute><N31Notificaciones /></ProtectedRoute>} />
      {/* Soporte: abierta a los 3 actores. Es además la pantalla donde aterriza
          quien quedó bloqueado por posible suplantación (0025) — ProtectedRoute
          redirige aquí todo lo demás mientras dure la controversia. */}
      <Route path="/soporte" element={<ProtectedRoute><Soporte /></ProtectedRoute>} />
      {/* N-33: "Ayúdanos a Mejorar" (migración 0036). Abierta a los 3 actores,
          igual que /soporte — cualquiera tiene algo que decir del producto.
          Solo se envía: el fundador lo lee por el Dashboard (vista
          sugerencias_mejora_pendientes), no se responde dentro de la app.
          Quien está en disputa (0025) no llega: ProtectedRoute lo rebota a
          /soporte, y la RLS del insert exige `not perfil_en_disputa()`. */}
      <Route path="/mejoras" element={<ProtectedRoute><N33Mejoras /></ProtectedRoute>} />
    </Routes>
  );
}
