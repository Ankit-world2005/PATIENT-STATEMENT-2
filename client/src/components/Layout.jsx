import { useState } from 'react';
import { Link, Outlet } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABELS, initials, landingPath } from '../lib/format.js';
import { IconSignOut } from './Icons.jsx';
import { SessionTimeout } from './SessionTimeout.jsx';

const LOGO_URL = 'https://us24solutions.com/wp-content/uploads/2022/09/us-24-copyq-2-min-1-e1664550612654.png';

function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="brand-fallback-lockup">
        <span>US24</span>
        <span className="brand-badge">SOLUTIONS</span>
      </span>
    );
  }
  return <img src={LOGO_URL} alt="US24 Solutions" className="brand-logo-img" onError={() => setFailed(true)} />;
}

// Header: user's name top-left, US24 logo top-right with Sign out (N2, N3, FR-3.1).
function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="site-header">
      <div className="container">
        {user ? (
          <div className="header-user-badge">
            <div className="user-avatar-circle" aria-hidden="true">{initials(user.fullName)}</div>
            <div className="user-meta">
              <span className="user-full-name">{user.fullName}</span>
              <span className="user-clinic-affiliation">
                {user.clinic ? (
                  <>
                    <span>{user.clinic.name}</span>
                    <span className="user-clinic-badge">{user.clinic.code}</span>
                  </>
                ) : (
                  <span>{ROLE_LABELS[user.role]} · US24 Solutions</span>
                )}
              </span>
            </div>
          </div>
        ) : (
          <span />
        )}
        <div className="header-brand-actions">
          <Link to={landingPath(user)} className="company-brand-link" aria-label="US24 Solutions — go to portal home">
            <Logo />
          </Link>
          {user && (
            <button type="button" className="btn-signout" onClick={() => logout()}>
              <IconSignOut size={15} />
              <span className="signout-label">Sign out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  const { user } = useAuth();
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">© {new Date().getFullYear()} US24 Solutions · My Patient Statement Portal · HIPAA compliant</div>
      </footer>
      {user && <SessionTimeout />}
    </>
  );
}
