import { Navigate } from 'react-router';
import { useAuth } from '../../lib/auth.jsx';
import { landingPath } from '../../lib/format.js';

export function ClinicHome() {
  const { user } = useAuth();
  return <Navigate to={landingPath(user)} replace />;
}
