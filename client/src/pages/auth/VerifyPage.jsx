import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Alert, Field } from '../../components/ui.jsx';
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
  const [devOtp, setDevOtp] = useState(pending?.devOtp || '');
  // Holds this page while the result of a successful verify is being applied.
  const verified = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // If no devOtp in pending, fetch active OTP from dev endpoint for auto-fill
  useEffect(() => {
    if (pending?.devOtp) {
      setDevOtp(pending.devOtp);
      setCode((c) => (c ? c : pending.devOtp));
    } else {
      api('/auth/dev-otp')
        .then((d) => {
          if (d?.code) {
            setDevOtp(d.code);
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
      setError('Enter the 6-digit code.');
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
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    await doVerify(code);
  };

  const handleAutoFill = (otpVal) => {
    const val = (otpVal || devOtp || '123456').trim();
    setCode(val);
    setError('');
    toast(`OTP code ${val} auto-filled!`);
  };

  const handleAutoFillAndVerify = async (otpVal) => {
    const val = (otpVal || devOtp || '123456').trim();
    setCode(val);
    setError('');
    toast(`Verifying code ${val}…`);
    await doVerify(val);
  };

  const resend = async () => {
    setError('');
    try {
      const res = await api('/auth/resend', { method: 'POST' });
      setCooldown(60);
      if (res?.devOtp) {
        setDevOtp(res.devOtp);
        setCode(res.devOtp);
        toast(`New code ${res.devOtp} generated & auto-filled!`);
      } else {
        toast(`A new code was sent to ${pending.maskedEmail}.`);
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
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Two-step verification</h1>
          <p className="auth-subtitle">Confirm it's you to protect patient information</p>
        </div>

        <div className="auth-otp-display">
          {method === 'email' ? (
            <p>
              We sent a 6-digit code to <strong>{pending.maskedEmail}</strong>.<br />
              <span className="form-hint">It expires in 10 minutes and can be used once.</span>
            </p>
          ) : (
            <p>Open your authenticator app and enter the 6-digit code for My Patient.</p>
          )}
        </div>

        {/* Auto-fill OTP Helper Card when no SMTP configured */}
        {method === 'email' && devOtp && (
          <div className="dev-otp-card">
            <div className="dev-otp-header">
              <span className="badge badge-warning">No SMTP Configured</span>
              <span className="dev-otp-title">Auto-fill ready</span>
            </div>
            <p className="dev-otp-desc">
              <span>Your one-time sign-in code:</span>
              <strong className="dev-otp-number">{devOtp}</strong>
            </p>
            <div className="dev-otp-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleAutoFill(devOtp)}
                disabled={busy}
              >
                ⚡ Auto-fill OTP
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleAutoFillAndVerify(devOtp)}
                disabled={busy}
              >
                Auto-fill & verify →
              </button>
            </div>
          </div>
        )}

        {pending.emailFailed && method === 'email' && !devOtp && (
          <Alert tone="warning">We couldn't send your code. Try "Resend code" in a minute{pending.hasTotp ? ' or use your authenticator app' : ''}.</Alert>
        )}

        <form onSubmit={submit} noValidate>
          <Field label={method === 'email' ? 'Code from your email' : 'Code from your authenticator app'} error={error}>
            {(p) => (
              <div className="otp-input-group">
                <input
                  {...p}
                  className="form-input otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
                {method === 'email' && devOtp && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm otp-autofill-btn"
                    onClick={() => handleAutoFill(devOtp)}
                    disabled={busy}
                    title="Auto-fill OTP code"
                  >
                    ⚡ Auto-fill
                  </button>
                )}
              </div>
            )}
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
          <div className="auth-actions-footer">
            {method === 'email' && (
              <button type="button" className="btn-tertiary" onClick={resend} disabled={cooldown > 0}>
                {cooldown > 0 ? `Didn't get it? Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
              </button>
            )}
            {pending.hasTotp && (
              <button type="button" className="btn-tertiary" onClick={() => { setMethod((m) => (m === 'email' ? 'totp' : 'email')); setError(''); setCode(''); }}>
                {method === 'email' ? 'Use your authenticator app instead' : 'Use an email code instead'}
              </button>
            )}
            <button type="button" className="btn-tertiary muted" onClick={cancel}>Cancel and return to sign in</button>
          </div>
        </form>
      </div>
    </div>
  );
}
