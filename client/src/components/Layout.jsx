import { useState } from 'react';
import { Link, Outlet } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABELS, initials, landingPath } from '../lib/format.js';
import { IconBell, IconDocument, IconLock, IconSignOut } from './Icons.jsx';
import { SessionTimeout } from './SessionTimeout.jsx';

const LOGO_URL = 'https://us24solutions.com/wp-content/uploads/2022/09/us-24-copyq-2-min-1-e1664550612654.png';

function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="brand-fallback-lockup">
        <span className="brand-fallback-us24">US24</span>
        <span className="brand-fallback-solutions">SOLUTIONS</span>
      </span>
    );
  }
  return <img src={LOGO_URL} alt="US24 Solutions" className="brand-logo-img" onError={() => setFailed(true)} />;
}

// Header: Clinical Clean specification
function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="site-header">
      <div className="header-container">
        {/* Left Side: Logo + Tagline + Divider + My Patient Portal Title */}
        <div className="header-brand">
          <Link to={landingPath(user)} className="company-brand-link" aria-label="US24 Solutions — My Patient">
            <div className="header-logo-group">
              <Logo />
              <span className="brand-tagline">Innovative Technology Driven</span>
            </div>
            <div className="header-vertical-divider" aria-hidden="true" />
            <div className="header-product-badge">
              <div className="header-product-icon-tile" aria-hidden="true">
                <IconDocument size={18} />
              </div>
              <div className="header-product-text">
                <span className="header-product-title">My Patient</span>
                <span className="header-product-sub">Statement portal</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Right Side: Bell + User Chip + Outlined Sign Out */}
        {user ? (
          <div className="header-user-actions">
            <button
              type="button"
              className="header-bell-btn"
              aria-label="Notifications (1 unread)"
              title="Notifications"
            >
              <IconBell size={20} />
              <span className="header-bell-dot" aria-hidden="true" />
            </button>

            <div className="header-user-chip" title={`${user.fullName} (${user.clinic ? user.clinic.name : ROLE_LABELS[user.role]})`}>
              <div className="user-avatar-navy" aria-hidden="true">
                {initials(user.fullName)}
              </div>
              <div className="user-chip-meta">
                <span className="user-chip-name">{user.fullName}</span>
                <span className="user-chip-clinic">
                  {user.clinic ? (
                    `${user.clinic.name}${user.isClinicAdmin ? ' (Clinic Admin)' : ''} · ${user.clinic.code}`
                  ) : (
                    `${ROLE_LABELS[user.role]} · US24 Solutions`
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn-signout-outline"
              onClick={() => logout()}
              aria-label="Sign out of portal"
            >
              <IconSignOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      {/* 4px solid orange accent bar across the very top */}
      <div className="top-accent-bar" aria-hidden="true" />
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main-content" tabIndex={-1} className="main-viewport">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-left">
            © 2026 US24 Solutions · My Patient Statement Portal
          </div>
          <div className="footer-right">
            <IconLock size={15} aria-hidden="true" />
            <span>HIPAA compliant · Encrypted in transit and at rest</span>
          </div>
        </div>
      </footer>
      {user && <SessionTimeout />}
    </div>
  );
}
