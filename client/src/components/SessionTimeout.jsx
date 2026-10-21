import { useEffect, useRef, useState } from 'react';
import { activity, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Modal } from './ui.jsx';

// G1: warning at 13 idle minutes, sign-out at 15 (FR-1.9). "Idle" means no API
// call, because that is when the server extends the session.
const IDLE_LIMIT = 15 * 60 * 1000;
const WARN_AT = 13 * 60 * 1000;

export function SessionTimeout() {
  const { logout } = useAuth();
  const [remaining, setRemaining] = useState(null);
  const warning = useRef(false);
  const checking = useRef(false);

  useEffect(() => {
    let stopped = false;
    const show = (secs) => {
      warning.current = secs !== null;
      setRemaining(secs);
    };
    const timeout = () => {
      stopped = true;
      logout('timeout');
    };

    const tick = async () => {
      if (stopped || checking.current) return;
      const idle = Date.now() - activity.get();
      if (idle >= IDLE_LIMIT) return timeout();
      if (idle < WARN_AT) {
        if (warning.current) show(null);
        return;
      }
      if (!warning.current) {
        // Another tab may have kept the session alive; ask without extending it.
        checking.current = true;
        try {
          const s = await api('/auth/session-status');
          if (!s.active) return timeout();
          const serverLeft = new Date(s.expiresAt).getTime() - Date.now();
          if (serverLeft > IDLE_LIMIT - WARN_AT + 5000) {
            activity.set(Date.now() - (IDLE_LIMIT - serverLeft));
            return;
          }
        } catch {
          /* show the warning anyway */
        } finally {
          checking.current = false;
        }
      }
      show(Math.max(0, Math.ceil((IDLE_LIMIT - idle) / 1000)));
    };

    const timer = setInterval(tick, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [logout]);

  if (remaining === null) return null;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  const stay = async () => {
    warning.current = false;
    setRemaining(null);
    await api('/auth/keepalive', { method: 'POST' }).catch(() => {});
  };

  return (
    <Modal
      title="Session inactivity warning"
      tone="warning"
      onClose={stay}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => logout()}>Sign out now</button>
          <button type="button" className="btn btn-primary" onClick={stay}>Stay signed in</button>
        </>
      }
    >
      <p>For patient privacy, you'll be signed out automatically in:</p>
      <div className="modal-timer-badge" aria-hidden="true">{mm}:{ss}</div>
      <p className="sr-only" aria-live="assertive">
        {remaining % 30 === 0 ? `${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining` : ''}
      </p>
      <p className="form-hint">Select "Stay signed in" to keep working.</p>
    </Modal>
  );
}
