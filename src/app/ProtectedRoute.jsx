import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { routeForRol } from '../lib/auth';

// D-543: auxiliar/clínica no tienen acceso al flujo clínico — "directamente
// ausente de la UI", no solo un botón deshabilitado. La ausencia en QuickAccess
// ya cubre la navegación normal; allowedRoles cierra también el acceso
// directo por URL. Sin allowedRoles, la ruta queda abierta a cualquier rol
// autenticado (comportamiento previo, sin cambios).
export default function ProtectedRoute({ children, allowedRoles }) {
  const { session, perfil, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (allowedRoles && perfil && !allowedRoles.includes(perfil.rol)) {
    return <Navigate to={routeForRol(perfil.rol)} replace />;
  }

  return children;
}
