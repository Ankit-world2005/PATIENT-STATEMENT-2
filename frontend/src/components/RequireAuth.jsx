import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { Spinner } from './ui.jsx';

/** Client-side mirror of the server's role checks. The server is the real gate (FR-2.5). */
export function RequireAuth({ roles }) {
  const { loading, user, pending } = useAuth();
  const location = useLocation();
  if (loading) return <div className="container"><Spinner /></div>;
  if (!user) return <Navigate to={pending ? '/login/verify' : '/login'} replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <NotFoundPage />;
  return <Outlet />;
}
