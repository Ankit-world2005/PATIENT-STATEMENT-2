import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';
import { STATUS_LABELS } from '../lib/format.js';
import { IconAlert, IconBack, IconCheck } from './Icons.jsx';

export function BackBar({ to, label, trail = [] }) {
  return (
    <div className="view-breadcrumb-bar">
      <Link to={to} className="btn-back-nav">
        <IconBack />
        {label}
      </Link>
      {trail.length > 0 && (
        <nav className="breadcrumb-trail" aria-label="Breadcrumb">
          {trail.map((t, i) => (
            <span key={t} className={i === trail.length - 1 ? 'breadcrumb-current' : undefined}>
              {i > 0 && <span className="breadcrumb-separator" aria-hidden="true">›&nbsp;</span>}
              {t}
            </span>
          ))}
        </nav>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="statements-page-header">
      <div className="page-title-group">
        <h1>{title}</h1>
        {subtitle && <p className="clinic-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, onDismiss }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'success' ? <IconCheck size={18} /> : <IconAlert size={18} />}
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="alert-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
      )}
    </div>
  );
}

/** Labelled form field with an error linked to its input (TRD 6.4). */
export function Field({ label, error, hint, children, required, className = '' }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`form-group ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id} className="form-label">
        <span>{label}{required && <span className="required-mark" aria-hidden="true"> *</span>}</span>
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {hint && !error && <span id={hintId} className="form-hint">{hint}</span>}
      {error && <span id={errorId} className="form-error">{error}</span>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const tone = {
    published: 'success', active: 'success', partially_imported: 'warning', previewed: 'info', invited: 'info',
    failed: 'danger', withdrawn: 'danger', deactivated: 'muted', cancelled: 'muted',
  }[status] || 'muted';
  return <span className={`badge badge-status badge-${tone}`}>{STATUS_LABELS[status] || status}</span>;
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state-card">
      <h3 className="empty-state-title">{title}</h3>
      {children && <p className="empty-state-desc">{children}</p>}
      {action}
    </div>
  );
}

export function Pagination({ page, totalPages, total, pageSize, noun = 'statements', onPage }) {
  if (!total) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="pagination-bar">
      <div>Showing {first}–{last} of {total.toLocaleString('en-US')} {noun}</div>
      <div className="pagination-controls">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="pagination-page">Page {page} of {totalPages}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

/** Accessible modal dialog: focus moves in, Escape closes, focus returns on close. */
export function Modal({ title, children, footer, onClose, tone }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const first = ref.current?.querySelector('textarea, input, select, button:not(.modal-close)');
    (first || ref.current)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.();
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll('button, [href], input, select, textarea')].filter((el) => !el.disabled);
        if (!items.length) return;
        const [firstEl, lastEl] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop active" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="modal-header">
          <h3 id={titleId}>
            {tone === 'warning' && <IconAlert size={20} style={{ color: 'var(--color-warning)' }} />}
            {title}
          </h3>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', destructive, busy, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
