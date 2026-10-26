import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Field, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

const RULES = "At least 12 characters. Common or breached passwords aren't allowed.";

function PasswordForm({ submitLabel, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (password.length < 12) fe.password = 'Use at least 12 characters.';
    if (password !== confirm) fe.confirm = "The two passwords don't match.";
    setErrors(fe);
    setError('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await onSubmit(password, confirm);
    } catch (err) {
      setErrors(err.fieldErrors || {});
      if (!Object.keys(err.fieldErrors || {}).length) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Field label="New password" error={errors.password} hint={RULES}>
        {(p) => <input {...p} type="password" className="form-input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Confirm new password" error={errors.confirm}>
        {(p) => <input {...p} type="password" className="form-input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}

function AuthCard({ title, subtitle, children }) {
  useEffect(() => {
    document.body.classList.add('auth-view-active');
    return () => {
      document.body.classList.remove('auth-view-active');
    };
  }, []);

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

// A3 – Forgot password
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const d = await api('/auth/password/forgot', { method: 'POST', body: { email: email.trim() } });
      setSent(d.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to set a new password.">
      {sent ? (
        <Alert tone="success">{sent}</Alert>
      ) : (
        <form onSubmit={submit} noValidate>
          <Field label="Email address" error={error}>
            {(p) => <input {...p} type="email" className="form-input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <div className="auth-actions-footer">
        <Link to="/login" className="btn-tertiary">Back to sign in</Link>
      </div>
    </AuthCard>
  );
}

// A4 – Set new password (reset)
export function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [expired, setExpired] = useState('');
  if (expired) {
    return (
      <AuthCard title="Link expired">
        <Alert tone="warning">{expired}</Alert>
        <div className="auth-actions-footer"><Link to="/password/forgot" className="btn btn-primary">Request a new link</Link></div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set a new password" subtitle="You'll still need a one-time code the next time you sign in.">
      <PasswordForm
        submitLabel="Save password"
        onSubmit={async (password, confirm) => {
          try {
            const d = await api('/auth/password/reset', { method: 'POST', body: { token, password, confirm } });
            navigate('/login', { replace: true, state: { message: d.message } });
          } catch (err) {
            if (err.status === 410) setExpired(err.message);
            else throw err;
          }
        }}
      />
    </AuthCard>
  );
}

// A5 – Accept invitation
export function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [expired, setExpired] = useState('');

  useEffect(() => {
    api(`/auth/invite/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) => setExpired(err.message));
  }, [token]);

  if (expired) {
    return (
      <AuthCard title="Invitation unavailable">
        <Alert tone="warning">{expired}</Alert>
        <div className="auth-actions-footer"><Link to="/login" className="btn btn-secondary">Go to sign in</Link></div>
      </AuthCard>
    );
  }
  if (!info) return <AuthCard title="Checking your invitation…"><Spinner /></AuthCard>;
  return (
    <AuthCard title={`Welcome, ${info.fullName}`} subtitle="Set a password to activate your My Patient account.">
      <p className="auth-copy">Account: <strong>{info.maskedEmail}</strong></p>
      <PasswordForm
        submitLabel="Set password"
        onSubmit={async (password, confirm) => {
          try {
            const d = await api('/auth/invite/accept', { method: 'POST', body: { token, password, confirm } });
            navigate('/login', { replace: true, state: { message: d.message } });
          } catch (err) {
            if (err.status === 410) setExpired(err.message);
            else throw err;
          }
        }}
      />
    </AuthCard>
  );
}
