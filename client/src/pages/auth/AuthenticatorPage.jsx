import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Field, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { landingPath } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';

// A6 – Authenticator app setup (FR-1.2)
export function AuthenticatorPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    api('/auth/totp/setup', { method: 'POST' })
      .then((d) => !ignore && setSetup(d))
      .catch((err) => !ignore && setError(err.message));
    return () => {
      ignore = true;
    };
  }, []);

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/totp/confirm', { method: 'POST', body: { code } });
      await refreshUser();
      toast('Authenticator app set up. You can use it the next time you sign in.');
      navigate(landingPath(user), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Set up an authenticator app</h1>
          <p className="auth-subtitle">Scan the code with your phone, then enter the 6-digit code it shows.</p>
        </div>
        {!setup && !error && <Spinner />}
        {setup && (
          <>
            {setup.replacing && <Alert tone="info">This replaces the authenticator app you set up before.</Alert>}
            <div className="totp-qr">
              <img src={setup.qrDataUrl} alt="QR code for setting up the authenticator app" width="220" height="220" />
            </div>
            <p className="form-hint center">Can't scan? Enter this key manually:</p>
            <p className="totp-secret">{setup.secret}</p>
            <form onSubmit={confirm} noValidate>
              <Field label="Code from your app" error={error}>
                {(p) => (
                  <input {...p} className="form-input otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                )}
              </Field>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'Confirm'}
              </button>
            </form>
          </>
        )}
        {!setup && error && <Alert tone="error">{error}</Alert>}
        <div className="auth-actions-footer">
          <button type="button" className="btn-tertiary muted" onClick={() => navigate(landingPath(user), { replace: true })}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
