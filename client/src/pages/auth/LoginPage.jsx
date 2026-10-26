import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import hallmarkImg from '../../assets/my-patient-hallmark.png';
import { Alert, Field } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { landingPath } from '../../lib/format.js';

// A1 – Login (F1)
export function LoginPage() {
  const { user, pending, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.body.classList.add('auth-view-active');
    return () => {
      document.body.classList.remove('auth-view-active');
    };
  }, []);

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
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-hallmark-wrap">
            <img src={hallmarkImg} alt="My Patient" className="auth-hallmark-img" />
            <h1 className="sr-only">My Patient</h1>
          </div>
          <p className="auth-subtitle">Secure statement portal for US24 Solutions clients</p>
        </div>
        {notice && <Alert tone="info">{notice}</Alert>}
        <div className="auth-clinic-notice">
          Clinic staff and US24 Solutions team members sign in here. Every sign-in is protected with a one-time code.
        </div>
        <form onSubmit={submit} noValidate>
          <Field label="Email address" error={errors.email}>
            {(p) => (
              <input {...p} type="email" className="form-input" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <Field label="Password" error={errors.password}>
            {(p) => (
              <div className="input-with-action">
                <input {...p} type={showPassword ? 'text' : 'password'} className="form-input" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn-tertiary input-action" onClick={() => setShowPassword((s) => !s)}
                  aria-pressed={showPassword}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            )}
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="auth-actions-footer">
            <Link to="/password/forgot" className="btn-tertiary">Forgot password?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
