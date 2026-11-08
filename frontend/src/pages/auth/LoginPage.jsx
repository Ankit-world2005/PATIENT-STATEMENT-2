import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import hallmarkImg from '../../assets/my-patient-hallmark.png';
import {
  IconAlert,
  IconArrowRight,
  IconDocument,
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
          </div>
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
                  alt="Patient Hallmark"
                  className="login-geo-hallmark-img"
                />
              </div>
              <h1 className="login-geo-title">Welcome Back</h1>
              <p className="login-geo-subtitle">Sign in to your Patient Statement Portal</p>
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
    </div>
  );
}

