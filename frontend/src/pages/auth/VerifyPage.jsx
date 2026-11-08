import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import hallmarkImg from '../../assets/my-patient-hallmark.png';
import {
  IconAlert,
  IconArrowRight,
  IconDocument,
  IconInfo,
  IconLock,
  IconMail,
  IconShield,
} from '../../components/Icons.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { landingPath } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';

// A2 – Two-step verification (F2). Required on every sign-in (FR-1.4).
export function VerifyPage() {
  const { user, pending, verify, cancelPending } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [method, setMethod] = useState('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  // Holds this page while the result of a successful verify is being applied.
  const verified = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (user && verified.current) return null;
  if (user) return <Navigate to={landingPath(user)} replace />;
  if (!pending) return <Navigate to="/login" replace />;

  const doVerify = async (otpValue) => {
    const codeToVerify = (otpValue || code).trim();
    if (!/^\d{6}$/.test(codeToVerify)) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      verified.current = true;
      const result = await verify(codeToVerify, method);
      navigate(landingPath(result.user), { replace: true });
    } catch (err) {
      verified.current = false;
      if (err.status === 401) {
        await cancelPending();
        navigate('/login', { replace: true, state: { message: err.message } });
        return;
      }
      setError(err.message || 'Invalid or expired code. Please try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    await doVerify(code);
  };

  const resend = async () => {
    setError('');
    try {
      const res = await api('/auth/resend', { method: 'POST' });
      setCooldown(60);
      toast(`A new verification code was sent to ${pending.maskedEmail}.`);
      setCode("");
    } catch (err) {
      if (err.status === 401) {
        await cancelPending();
        navigate('/login', { replace: true, state: { message: err.message } });
      } else setError(err.message);
    }
  };

  const cancel = async () => {
    await cancelPending();
    navigate('/login', { replace: true });
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
          {/* Floating Realistic Verification Card */}
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
              <h1 className="login-geo-title">Two-Step Verification</h1>
              <p className="login-geo-subtitle">Confirm it's you to protect patient information</p>
              <p className="login-geo-secure-badge">Secure 2-Factor Authentication (2FA)</p>
              <div className="login-geo-orange-accent" aria-hidden="true" />
            </div>

            {/* Information Callout Box */}
            <div className="verify-geo-info-box">
              <div className="verify-geo-info-icon" aria-hidden="true">
                {method === 'email' ? <IconMail size={18} /> : <IconShield size={18} />}
              </div>
              <div className="verify-geo-info-content">
                {method === 'email' ? (
                  <>
                    <p className="verify-geo-info-title">
                      Code sent to <strong>{pending.maskedEmail}</strong>
                    </p>
                    <p className="verify-geo-info-subtitle">
                      Expires in 10 minutes and can be used once.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="verify-geo-info-title">
                      Authenticator application code
                    </p>
                    <p className="verify-geo-info-subtitle">
                      Open your authenticator app and enter the 6-digit code.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Warning if email delivery failed */}
            {pending.emailFailed && method === 'email' && (
              <div className="login-geo-alert info" role="status">
                <IconInfo size={17} className="alert-icon" aria-hidden="true" />
                <span>
                  We couldn't deliver the email. Use "Resend code" or switch to your authenticator app.
                </span>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="login-geo-alert error" role="alert">
                <IconAlert size={17} className="alert-icon" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* OTP Form */}
            <form onSubmit={submit} noValidate className="login-geo-form">
              <div className="login-geo-field">
                <label htmlFor="geo-otp-input" className="login-geo-label">
                  {method === 'email' ? '6-digit security code' : 'Authenticator code'}
                </label>
                <div className={`login-geo-input-wrap ${error ? 'has-error' : ''}`}>
                  <span className="geo-input-icon" aria-hidden="true">
                    <IconLock size={17} />
                  </span>
                  <input
                    id="geo-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="login-geo-input verify-otp-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                    placeholder="••••••"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="login-geo-submit-btn"
                disabled={busy || code.trim().length !== 6}
              >
                <span>{busy ? 'Verifying code…' : 'Verify & Continue'}</span>
                <IconArrowRight size={18} aria-hidden="true" />
              </button>

              {/* Actions Footer */}
              <div className="verify-geo-actions">
                {method === 'email' && (
                  <button
                    type="button"
                    className="verify-resend-btn"
                    onClick={resend}
                    disabled={cooldown > 0}
                  >
                    {cooldown > 0 ? (
                      <span>Didn't get code? Resend in <strong>{cooldown}s</strong></span>
                    ) : (
                      <span>Didn't get code? <strong>Resend Code</strong></span>
                    )}
                  </button>
                )}

                {pending.hasTotp && (
                  <button
                    type="button"
                    className="verify-switch-btn"
                    onClick={() => {
                      setMethod((m) => (m === 'email' ? 'totp' : 'email'));
                      setError('');
                      setCode('');
                    }}
                  >
                    {method === 'email'
                      ? 'Use your authenticator app instead'
                      : 'Use an email code instead'}
                  </button>
                )}

                <button
                  type="button"
                  className="verify-cancel-btn"
                  onClick={cancel}
                >
                  ← Cancel and return to sign in
                </button>
              </div>
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

