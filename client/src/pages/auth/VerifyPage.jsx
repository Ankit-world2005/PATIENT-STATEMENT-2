import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
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
  const [code, setCode] = useState(pending?.devOtp || '');
  const [method, setMethod] = useState('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [showHelp, setShowHelp] = useState(false);

  // Holds this page while the result of a successful verify is being applied.
  const verified = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Auto-fill OTP on login
  useEffect(() => {
    if (pending?.devOtp) {
      setCode((c) => (c ? c : pending.devOtp));
    } else {
      api('/auth/dev-otp')
        .then((d) => {
          if (d?.code) {
            setCode((prev) => (prev ? prev : d.code));
          }
        })
        .catch(() => {});
    }
  }, [pending]);

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
      if (res?.devOtp) {
        setCode(res.devOtp);
        toast(`A new code was sent to ${pending.maskedEmail} and auto-filled.`);
      } else {
        toast(`A new verification code was sent to ${pending.maskedEmail}.`);
      }
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

      {/* Need Help? Modal Dialog */}
      {showHelp && (
        <div className="login-help-overlay" onClick={() => setShowHelp(false)}>
          <div
            className="login-help-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="otp-help-heading"
          >
            <div className="help-modal-header">
              <div className="help-modal-title-group">
                <IconHelpCircle size={22} className="help-header-icon" />
                <h3 id="otp-help-heading" className="help-modal-title">
                  Two-Step Verification Help
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
                Two-step verification is required to safeguard protected health information (PHI) and
                ensure HIPAA compliance across all US24 Solutions portals.
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
              </div>

              <div className="help-tips-block">
                <h4 className="help-tips-heading">Troubleshooting Tips:</h4>
                <ul className="help-tips-list">
                  <li>Verification codes are valid for 10 minutes from receipt.</li>
                  <li>Check your spam, junk, or quarantine email folders.</li>
                  <li>If you requested multiple codes, only the most recent code will work.</li>
                  <li>Wait for the countdown to expire before requesting another code.</li>
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
