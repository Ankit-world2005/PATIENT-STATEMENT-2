import { Link } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { landingPath } from '../lib/format.js';

// G2 – never says whether a record exists (FR-2.5).
export function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="container">
      <div className="empty-state-card page-message">
        <h1 className="empty-state-title">We couldn't find that page.</h1>
        <p className="empty-state-desc">The link may be wrong, or the page may not be available to your account.</p>
        <Link to={landingPath(user)} className="btn btn-primary">Go to home</Link>
      </div>
    </div>
  );
}
