import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { routeForRol } from '../lib/auth';
import { estaEnDisputa } from '../lib/verificacionComvezcol';

// Únicas rutas accesibles para un perfil marcado como posible suplantación
// ('en_disputa', ver 0025): actualizar sus datos y resolver la controversia
// con soporte. Todo lo demás redirige a /soporte, que explica el bloqueo.
const RUTAS_PERMITIDAS_EN_DISPUTA = ['/perfil', '/soporte'];

// D-543: auxiliar/clínica no tienen acceso al flujo clínico — "directamente
// ausente de la UI", no solo un botón deshabilitado. La ausencia en QuickAccess
// ya cubre la navegación normal; allowedRoles cierra también el acceso
// directo por URL. Sin allowedRoles, la ruta queda abierta a cualquier rol
// autenticado (comportamiento previo, sin cambios).
export default function ProtectedRoute({ children, allowedRoles }) {
  const { session, perfil, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  // Bloqueo por posible suplantación. Es solo la capa de UI: el control real
  // vive en las policies de RLS y en el trigger de perfiles (0025), porque
  // esconder la navegación no impide llamar a la API directamente.
  if (estaEnDisputa(perfil) && !RUTAS_PERMITIDAS_EN_DISPUTA.includes(location.pathname)) {
    return <Navigate to="/soporte" replace />;
  }

  if (allowedRoles && perfil && !allowedRoles.includes(perfil.rol)) {
    return <Navigate to={routeForRol(perfil.rol)} replace />;
  }

  return children;
}
