import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import hallmarkImg from '../../assets/my-patient-hallmark.png';
import {
  IconAlert,
  IconArrowRight,
  IconClose,
  IconDocument,
  IconHelpCircle,
  IconInfo,
  IconLock,
  IconMail,
} from '../../components/Icons.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { landingPath } from '../../lib/format.js';

export function LoginPage() {
  const { user, pending, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('westaz.mypatient@gmail.com');
  const [password, setPassword] = useState('westaz@123#');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  if (user) return <Navigate to={landingPath(user)} replace />;
  if (pending) return <Navigate to="/login/verify" replace />;

  const notice = location.state?.message;

  const submit = async (e) => {
    e.preventDefault();
    const fieldErrors = {};
    if (!email.trim()) fieldErrors.email = 'Enter your email.';
    if (!password) fieldErrors.password = 'Enter your password.';
    setErrors(fieldErrors);
    setError('');
    if (Object.keys(fieldErrors).length) return;

    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/login/verify', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please verify your credentials.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-geo-wrapper">
      {/* Top Header Bar with Glassmorphic Blend */}
      <header className="login-geo-header">
        <div className="login-geo-header-inner">
          <div className="login-geo-brand">
            <div className="login-geo-logo-block">
              <img
                src="/us24-logo.png"
                alt="US24 Solutions"
                className="login-geo-logo-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="login-geo-tagline">Innovative Technology Driven</span>
            </div>

            <div className="login-geo-divider" aria-hidden="true" />

            <div className="login-geo-portal-pill">
              <div className="login-geo-portal-icon" aria-hidden="true">
                <IconDocument size={17} />
              </div>
              <div className="login-geo-portal-text">
                <span className="portal-name">My Patient</span>
                <span className="portal-type">Statement Portal</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="login-geo-help-btn"
            onClick={() => setShowHelp(true)}
            aria-label="Need Help?"
          >
            <IconHelpCircle size={18} />
            <span>Need Help?</span>
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="login-geo-stage">
        <div className="login-geo-stage-inner">
          {/* Floating Realistic Login Card */}
          <div className="login-geo-card">
            {/* Card Header */}
            <div className="login-geo-card-header">
              <div className="login-geo-hallmark-ring">
                <img
                  src={hallmarkImg}
                  alt="My Patient Hallmark"
                  className="login-geo-hallmark-img"
                />
              </div>
              <h1 className="login-geo-title">Welcome Back</h1>
              <p className="login-geo-subtitle">Sign in to your My Patient Statement Portal</p>
              <p className="login-geo-secure-badge">Secure access for US24 Solutions clients</p>
              <div className="login-geo-orange-accent" aria-hidden="true" />
            </div>

            {/* Notice Alert (e.g. You have signed out.) */}
            {notice && (
              <div className="login-geo-alert info" role="status">
                <IconInfo size={17} className="alert-icon" aria-hidden="true" />
                <span>{notice}</span>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="login-geo-alert error" role="alert">
                <IconAlert size={17} className="alert-icon" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={submit} noValidate className="login-geo-form">
              {/* Email Field */}
              <div className="login-geo-field">
                <label htmlFor="geo-email" className="login-geo-label">
                  Email address
                </label>
                <div className={`login-geo-input-wrap ${errors.email ? 'has-error' : ''}`}>
                  <span className="geo-input-icon" aria-hidden="true">
                    <IconMail size={17} />
                  </span>
                  <input
                    id="geo-email"
                    type="email"
                    className="login-geo-input"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                  />
                </div>
                {errors.email && <p className="login-geo-field-error">{errors.email}</p>}
              </div>

              {/* Password Field */}
              <div className="login-geo-field">
                <label htmlFor="geo-password" className="login-geo-label">
                  Password
                </label>
                <div className={`login-geo-input-wrap ${errors.password ? 'has-error' : ''}`}>
                  <span className="geo-input-icon" aria-hidden="true">
                    <IconLock size={17} />
                  </span>
                  <input
                    id="geo-password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-geo-input"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="geo-password-toggle"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.password && <p className="login-geo-field-error">{errors.password}</p>}
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="login-geo-row-options">
                <label className="login-geo-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="login-geo-checkbox"
                  />
                  <span>Remember me</span>
                </label>
                <Link to="/password/forgot" className="login-geo-forgot-link">
                  Forgot password?
                </Link>
              </div>

              {/* Vibrant Orange Sign In Button */}
              <button
                type="submit"
                className="login-geo-submit-btn"
                disabled={busy}
              >
                <span>{busy ? 'Signing in…' : 'Sign in'}</span>
                <IconArrowRight size={18} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer with HIPAA & Copyright Notice */}
      <footer className="login-geo-footer">
        <div className="login-geo-footer-inner">
          <span className="footer-copyright">
            © 2026 US24 Solutions · My Patient Statement Portal
          </span>
          <span className="footer-security">
            <IconLock size={14} aria-hidden="true" />
            <span>HIPAA Compliant · 256-bit SSL Encryption in transit &amp; at rest</span>
          </span>
        </div>
      </footer>

      {/* Need Help? Modal Dialog */}
      {showHelp && (
        <div className="login-help-overlay" onClick={() => setShowHelp(false)}>
          <div
            className="login-help-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-heading"
          >
            <div className="help-modal-header">
              <div className="help-modal-title-group">
                <IconHelpCircle size={22} className="help-header-icon" />
                <h3 id="help-modal-heading" className="help-modal-title">
                  Need Help Signing In?
                </h3>
              </div>
              <button
                type="button"
                className="help-modal-close-btn"
                onClick={() => setShowHelp(false)}
                aria-label="Close help modal"
              >
                <IconClose size={20} />
              </button>
            </div>

            <div className="help-modal-body">
              <p className="help-intro-text">
                Welcome to the <strong>My Patient Statement Portal</strong>. If you are experiencing
                issues signing in or require credential assistance, please contact our support team.
              </p>

              <div className="help-contact-card">
                <div className="help-contact-row">
                  <span className="contact-label">Email Support:</span>
                  <a href="mailto:support@us24solutions.com" className="contact-val-link">
                    support@us24solutions.com
                  </a>
                </div>
                <div className="help-contact-row">
                  <span className="contact-label">Specialist Desk:</span>
                  <span className="contact-val">Monday – Friday, 8:00 AM – 6:00 PM MST</span>
                </div>
                <div className="help-contact-row">
                  <span className="contact-label">Portal Service:</span>
                  <span className="contact-val">Available 24/7/365</span>
                </div>
              </div>

              <div className="help-tips-block">
                <h4 className="help-tips-heading">Quick Tips:</h4>
                <ul className="help-tips-list">
                  <li>Check that your Caps Lock key is off.</li>
                  <li>Ensure your email address is typed correctly.</li>
                  <li>
                    If you haven't received your 2-step verification code, verify your junk/spam email folder.
                  </li>
                  <li>
                    To reset your password, visit the{' '}
                    <Link
                      to="/password/forgot"
                      className="help-inline-link"
                      onClick={() => setShowHelp(false)}
                    >
                      Password Reset
                    </Link>{' '}
                    screen.
                  </li>
                </ul>
              </div>
            </div>

            <div className="help-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowHelp(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
