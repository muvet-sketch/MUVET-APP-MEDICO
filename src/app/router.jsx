import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

import N1Login from '../screens/n1-login';
import N2Home from '../screens/n2-home';
import N3Solicitudes from '../screens/n3-solicitudes';
import N4Constelacion from '../screens/n4-constelacion';
import N5CierreServicio from '../screens/n5-cierre-servicio';
import N8PerfilMedico from '../screens/n8-perfil-medico';
import N9Historial from '../screens/n9-historial';
import N10ExpedienteMascota from '../screens/n10-expediente-mascota';
import N12Formula from '../screens/n12-formula';
import N15OrdenesExternas from '../screens/n15-ordenes-externas';
import N17Seguimientos from '../screens/n17-seguimientos';
import N18Recomendaciones from '../screens/n18-recomendaciones';
import N19VacunasDesparasitaciones from '../screens/n19-vacunas-desparasitaciones';
import N21SustanciasControladas from '../screens/n21-sustancias-controladas';
import N26Relevo from '../screens/n26-relevo';
import N27CatalogoServicios from '../screens/n27-catalogo-servicios';
import N28HomeSimplificado from '../screens/n28-home-simplificado';
import N29PerfilClinica from '../screens/n29-perfil-clinica';

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<N1Login />} />
      <Route path="/login" element={<N1Login />} />

      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <N2Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home-simplificado"
        element={
          <ProtectedRoute>
            <N28HomeSimplificado />
          </ProtectedRoute>
        }
      />

      {/* TODO Fase 3+ — rutas placeholder, sin implementación real todavia */}
      <Route path="/solicitudes" element={<ProtectedRoute><N3Solicitudes /></ProtectedRoute>} />
      <Route path="/constelacion/:servicioId" element={<ProtectedRoute><N4Constelacion /></ProtectedRoute>} />
      <Route path="/cierre/:servicioId" element={<ProtectedRoute><N5CierreServicio /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><N8PerfilMedico /></ProtectedRoute>} />
      <Route path="/historial" element={<ProtectedRoute><N9Historial /></ProtectedRoute>} />
      <Route path="/mascotas/:mascotaId" element={<ProtectedRoute><N10ExpedienteMascota /></ProtectedRoute>} />
      <Route path="/formula/:servicioId" element={<ProtectedRoute><N12Formula /></ProtectedRoute>} />
      <Route path="/ordenes/:servicioId" element={<ProtectedRoute><N15OrdenesExternas /></ProtectedRoute>} />
      <Route path="/seguimientos" element={<ProtectedRoute><N17Seguimientos /></ProtectedRoute>} />
      <Route path="/recomendaciones/:servicioId" element={<ProtectedRoute><N18Recomendaciones /></ProtectedRoute>} />
      <Route path="/vacunas/:mascotaId" element={<ProtectedRoute><N19VacunasDesparasitaciones /></ProtectedRoute>} />
      <Route path="/sustancias-controladas" element={<ProtectedRoute><N21SustanciasControladas /></ProtectedRoute>} />
      <Route path="/relevo" element={<ProtectedRoute><N26Relevo /></ProtectedRoute>} />
      <Route path="/servicios" element={<ProtectedRoute><N27CatalogoServicios /></ProtectedRoute>} />
      <Route path="/perfil-clinica" element={<ProtectedRoute><N29PerfilClinica /></ProtectedRoute>} />
    </Routes>
  );
}
