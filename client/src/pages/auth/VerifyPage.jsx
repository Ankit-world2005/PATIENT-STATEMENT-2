import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Alert, Field } from '../../components/ui.jsx';
import { IconShield } from '../../components/Icons.jsx';
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
  const [offerTotp, setOfferTotp] = useState(false);
  // Holds this page while the result of a successful verify is being applied.
  const verified = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (user && offerTotp) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon"><IconShield size={28} /></div>
            <h1 className="auth-title">You're signed in</h1>
            <p className="auth-subtitle">Optional: use an authenticator app for faster, more reliable codes.</p>
          </div>
          <p className="auth-copy">
            With an authenticator app (such as Microsoft Authenticator or Google Authenticator) you can sign in even
            when email is slow. You can keep using email codes if you prefer.
          </p>
          <div className="stack-sm">
            <Link to="/account/authenticator" className="btn btn-primary btn-block">Set up an authenticator app</Link>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate(landingPath(user), { replace: true })}>
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (user && verified.current) return null;
  if (user) return <Navigate to={landingPath(user)} replace />;
  if (!pending) return <Navigate to="/login" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      verified.current = true;
      const result = await verify(code, method);
      if (result.offerTotp) setOfferTotp(true);
      else navigate(landingPath(result.user), { replace: true });
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

  const resend = async () => {
    setError('');
    try {
      await api('/auth/resend', { method: 'POST' });
      setCooldown(60);
      toast(`A new code was sent to ${pending.maskedEmail}.`);
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
        {pending.emailFailed && method === 'email' && (
          <Alert tone="warning">We couldn't send your code. Try "Resend code" in a minute{pending.hasTotp ? ' or use your authenticator app' : ''}.</Alert>
        )}
        <form onSubmit={submit} noValidate>
          <Field label={method === 'email' ? 'Code from your email' : 'Code from your authenticator app'} error={error}>
            {(p) => (
              <input {...p} className="form-input otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
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
