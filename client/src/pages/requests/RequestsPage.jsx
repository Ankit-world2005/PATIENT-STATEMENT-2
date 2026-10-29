import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconChat, IconClock, IconSearch, IconSend } from '../../components/Icons.jsx';
import { Alert, BackBar, EmptyState, Modal, PageHeader, Pagination, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime, money } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';

const PRIORITIES = [
  { value: 'Normal', label: 'Normal', cls: 'priority-normal' },
  { value: 'High', label: 'High Priority', cls: 'priority-high' },
  { value: 'Urgent', label: 'Urgent Attention', cls: 'priority-urgent' },
];

export function NewRequestModal({ onClose, onCreated, clinicId }) {
  const toast = useToast();
  const [patientName, setPatientName] = useState('');
  const [statementId, setStatementId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [priority, setPriority] = useState('Normal');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wrapperRef = useRef(null);

  // Live suggestions when typing patient name
  useEffect(() => {
    const q = patientName.trim();
    if (!q || q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let ignore = false;
    const params = new URLSearchParams({ q, limit: '5' });
    if (clinicId) params.set('clinicId', clinicId);

    const timer = setTimeout(() => {
      api(`/requests/statements?${params.toString()}`)
        .then((res) => {
          if (!ignore) {
            setSuggestions(res.statements || []);
            setShowSuggestions((res.statements || []).length > 0);
          }
        })
        .catch(() => {});
    }, 200);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [patientName, clinicId]);

  // Click outside suggestions closes dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectSuggestion = (s) => {
    setPatientName(s.patientName);
    setStatementId(s.id);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientName.trim()) {
      setError('Please enter patient name.');
      return;
    }
    if (!body.trim()) {
      setError('Please enter details for your request.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api('/requests', {
        method: 'POST',
        body: {
          statementId: statementId || undefined,
          patientName: patientName.trim(),
          priority,
          body: body.trim(),
        },
      });
      toast('Request submitted to US24 Specialists.', 'success');
      onCreated();
    } catch (err) {
      setError(err.message || 'Failed to submit request.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New Request to US24 Specialist"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy || !patientName.trim()}>
            {busy ? 'Submitting…' : 'Submit Request'}
          </button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

      <div className="request-modal-form">
        {/* Patient Name Input */}
        <div className="form-group patient-autocomplete-wrap" ref={wrapperRef}>
          <label className="form-label" htmlFor="req-patient-name">
            Patient Name <span className="req-star" style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            id="req-patient-name"
            type="text"
            className="form-input"
            placeholder="Enter patient name (e.g. John Doe)"
            value={patientName}
            onChange={(e) => {
              setPatientName(e.target.value);
              setStatementId(null);
            }}
            autoComplete="off"
            autoFocus
            required
          />

          {/* Clean autocomplete dropdown if matching patients exist */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="patient-autocomplete-dropdown" role="listbox">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="patient-autocomplete-item"
                  onClick={() => selectSuggestion(s)}
                  role="option"
                  aria-selected={statementId === s.id}
                >
                  <div className="autocomplete-name">{s.patientName}</div>
                  <div className="autocomplete-meta">
                    <span className="col-mono">{s.accountNumber}</span>
                    {s.currentBalance != null && (
                      <>
                        <span className="pipe-sep">·</span>
                        <span>Balance: {money(s.currentBalance)}</span>
                      </>
                    )}
                    <span className="pipe-sep">·</span>
                    <span>{date(s.statementDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority Selection */}
        <div className="form-group">
          <label className="form-label">Priority</label>
          <div className="priority-pills-row">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`priority-pill-btn ${priority === p.value ? `active ${p.cls}` : ''}`}
                onClick={() => setPriority(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Request Message */}
        <div className="form-group">
          <label className="form-label" htmlFor="req-body">
            Details / Question for Specialist <span className="req-star" style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea
            id="req-body"
            className="form-input form-textarea"
            rows={4}
            placeholder="Type your inquiry, request, or question for the US24 specialist here…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
      </div>
    </Modal>
  );
}

function ReplyModal({ request, onClose, onReplied }) {
  const toast = useToast();
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) {
      setError('Please enter a response.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/requests/${request.id}/reply`, {
        method: 'POST',
        body: { body: replyText.trim() },
      });
      toast('Response sent to clinic.', 'success');
      onReplied();
    } catch (err) {
      setError(err.message || 'Failed to send response.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Reply to Clinic Request"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Sending…' : 'Send Response'}
          </button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <div className="reply-modal-original">
        <div className="original-req-meta">
          <strong>{request.patientName}</strong> {request.accountNumber && <span className="col-mono">· {request.accountNumber}</span>} · Submitted by {request.authorName} ({dateTime(request.createdAt)})
        </div>
        <div className="original-req-badge">
          <span className={`badge-priority priority-${request.priority?.toLowerCase() || 'normal'}`}>
            {request.priority || 'Normal'}
          </span>
        </div>
        <div className="original-req-body">
          {request.body}
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 16 }}>
        <label className="form-label" htmlFor="reply-text">
          US24 Specialist Response <span className="req-star">*</span>
        </label>
        <textarea
          id="reply-text"
          className="form-input form-textarea"
          rows={4}
          placeholder="Type your response to the clinic here…"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          autoFocus
        />
        <div className="form-hint" style={{ marginTop: 4 }}>
          This response will be visible to clinic users and will resolve the "Awaiting reply" flag.
        </div>
      </div>
    </Modal>
  );
}

export function RequestsContent({ clinicId: propClinicId, embedded = false }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('rq_q') ?? searchParams.get('q') ?? '';
  const clinicId = propClinicId || (searchParams.get('clinicId') ?? '');
  const status = searchParams.get('rq_status') ?? searchParams.get('status') ?? 'all';
  const page = Number(searchParams.get('rq_page') ?? searchParams.get('page') ?? 1);

  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);

  const isStaff = user.role !== 'clinic_user';

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      const paramKey = embedded ? `rq_${k}` : k;
      if (
        v === '' ||
        v === null ||
        (k === 'page' && v === 1) ||
        (k === 'status' && v === 'all')
      ) {
        next.delete(paramKey);
        if (!embedded) next.delete(k);
      } else {
        next.set(paramKey, String(v));
      }
    }
    if (!('page' in changes)) {
      next.delete(embedded ? 'rq_page' : 'page');
    }
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadRequests = () => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      status,
    });
    if (q) query.set('q', q);
    if (clinicId) query.set('clinicId', clinicId);

    api(`/requests?${query.toString()}`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, q, clinicId]);

  const content = (
    <>
      {embedded && (
        <div className="embedded-requests-header">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
              {isStaff ? 'Client Requests & Inquiries' : 'Requests to US24 Specialists'}
            </h2>
            <p className="form-hint" style={{ margin: '4px 0 0 0' }}>
              {isStaff
                ? 'Review and resolve requests submitted by this clinic.'
                : 'Submit requests and billing inquiries directly to US24 specialists.'}
            </p>
          </div>
          {user.role === 'clinic_user' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setNewRequestOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconSend size={14} /> + New Request
            </button>
          )}
        </div>
      )}

      {/* Metric Cards Row */}
      {data?.metrics && (
        <div className="requests-stats-grid">
          <div className="stat-card" onClick={() => update({ status: 'all' })} style={{ cursor: 'pointer' }}>
            <div className="stat-label">Total Requests</div>
            <div className="stat-value">{data.metrics.totalRequests}</div>
            <div className="stat-sub">Across statements</div>
          </div>
          <div
            className={`stat-card ${status === 'awaiting' ? 'stat-card-active' : ''}`}
            onClick={() => update({ status: 'awaiting' })}
            style={{ cursor: 'pointer', borderLeft: '4px solid #f59e0b' }}
          >
            <div className="stat-label">Awaiting US24 Specialist</div>
            <div className="stat-value" style={{ color: '#d97706' }}>{data.metrics.awaitingCount}</div>
            <div className="stat-sub">Pending response</div>
          </div>
          <div
            className={`stat-card ${status === 'answered' ? 'stat-card-active' : ''}`}
            onClick={() => update({ status: 'answered' })}
            style={{ cursor: 'pointer', borderLeft: '4px solid #10b981' }}
          >
            <div className="stat-label">Answered / Resolved</div>
            <div className="stat-value" style={{ color: '#059669' }}>{data.metrics.answeredCount}</div>
            <div className="stat-sub">Specialist responded</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="filter-bar-sheet" style={{ marginTop: 20 }}>
        <div className="requests-filter-row">
          {/* Status Tabs */}
          <div className="requests-status-tabs">
            <button
              type="button"
              className={`requests-tab-btn ${status === 'all' ? 'active' : ''}`}
              onClick={() => update({ status: 'all' })}
            >
              All Requests
            </button>
            <button
              type="button"
              className={`requests-tab-btn ${status === 'awaiting' ? 'active' : ''}`}
              onClick={() => update({ status: 'awaiting' })}
            >
              Awaiting Specialist
              {data?.metrics?.awaitingCount > 0 && (
                <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                  {data.metrics.awaitingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`requests-tab-btn ${status === 'answered' ? 'active' : ''}`}
              onClick={() => update({ status: 'answered' })}
            >
              Answered / Resolved
            </button>
          </div>

          {/* Search & Clinic Filter */}
          <div className="requests-search-box">
            <div className="input-with-icon" style={{ minWidth: 260 }}>
              <IconSearch className="input-icon" />
              <input
                type="search"
                className="form-input"
                placeholder="Search patient, account, request text…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {isStaff && !propClinicId && data?.clinics?.length > 1 && (
              <select
                className="form-select"
                value={clinicId}
                onChange={(e) => update({ clinicId: e.target.value })}
                style={{ width: 'auto', minWidth: 180 }}
              >
                <option value="">All Clinics</option>
                {data.clinics.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.clinic_code})</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner label="Loading requests…" />
      ) : !data?.requests?.length ? (
        <EmptyState
          title={q ? 'No requests match your search' : 'No requests found'}
        >
          {user.role === 'clinic_user' ? (
            <div>
              <p>You haven't submitted any requests or inquiries to US24 specialists yet.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setNewRequestOpen(true)}
                style={{ marginTop: 12 }}
              >
                + Submit Your First Request
              </button>
            </div>
          ) : (
            'No clinic requests found matching the selected filter.'
          )}
        </EmptyState>
      ) : (
        <div className="requests-list">
          {data.requests.map((r) => (
            <div key={r.id} className={`request-item-card ${r.isAwaiting ? 'awaiting-border' : ''}`}>
              <div className="request-card-header">
                <div className="request-header-left">
                  <span className={`badge-priority priority-${r.priority?.toLowerCase() || 'normal'}`}>
                    {r.priority || 'Normal'}
                  </span>
                  {r.isAwaiting ? (
                    <span className="badge badge-warning" style={{ fontWeight: 600 }}>
                      <IconClock size={12} /> Awaiting US24 Specialist
                    </span>
                  ) : (
                    <span className="badge badge-success" style={{ fontWeight: 600 }}>
                      Answered by Specialist
                    </span>
                  )}
                </div>
                <div className="request-header-right">
                  <span className="request-date">{dateTime(r.createdAt)}</span>
                </div>
              </div>

              {/* Patient and Statement context bar */}
              <div className="request-patient-bar">
                <div className="patient-context-info">
                  <strong>{r.patientName}</strong>
                  {r.accountNumber && <span className="col-mono" style={{ marginLeft: 8 }}>Account: {r.accountNumber}</span>}
                  {r.statementDate && (
                    <>
                      <span className="pipe-sep">·</span>
                      <span>Date: {date(r.statementDate)}</span>
                    </>
                  )}
                  {r.currentBalance != null && (
                    <>
                      <span className="pipe-sep">·</span>
                      <span>Balance: <strong className="col-mono">{money(r.currentBalance)}</strong></span>
                    </>
                  )}
                  {isStaff && (
                    <>
                      <span className="pipe-sep">·</span>
                      <span className="clinic-tag-pill">{r.clinicName} ({r.clinicCode})</span>
                    </>
                  )}
                </div>
                {r.statementId && (
                  <Link to={`/statements/${r.statementId}`} className="btn btn-secondary btn-sm" title="View Full Statement Document">
                    View Statement →
                  </Link>
                )}
              </div>

              {/* Request message */}
              <div className="request-body-section">
                <div className="request-meta-author">
                  <strong>{r.authorName}</strong> ({r.type === 'clinic' ? 'Clinic' : 'Specialist'}):
                </div>
                <p className="request-text-content">{r.body}</p>
              </div>

              {/* Latest Specialist Response preview (if present) */}
              {r.latestReply && (
                <div className="request-reply-box">
                  <div className="reply-header">
                    <span className="reply-author-label">
                      <IconChat size={13} /> {r.latestReply.authorName} (US24 Specialist):
                    </span>
                    <span className="reply-time">{dateTime(r.latestReply.createdAt)}</span>
                  </div>
                  <p className="reply-body">{r.latestReply.body}</p>
                </div>
              )}

              {/* Specialist quick reply button */}
              {isStaff && (
                <div className="request-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setReplyTarget(r)}
                  >
                    <IconChat size={13} /> Reply to Clinic
                  </button>
                  {r.statementId && (
                    <Link to={`/statements/${r.statementId}`} className="btn btn-secondary btn-sm">
                      Open Statement Details
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}

          {data.totalPages > 1 && (
            <Pagination
              page={data.page}
              pages={data.totalPages}
              total={data.total}
              onPage={(p) => update({ page: p })}
            />
          )}
        </div>
      )}

      {/* New Request Modal */}
      {newRequestOpen && (
        <NewRequestModal
          clinicId={clinicId || user.clinic_id}
          onClose={() => setNewRequestOpen(false)}
          onCreated={() => {
            setNewRequestOpen(false);
            loadRequests();
          }}
        />
      )}

      {/* Reply Modal */}
      {replyTarget && (
        <ReplyModal
          request={replyTarget}
          onClose={() => setReplyTarget(null)}
          onReplied={() => {
            setReplyTarget(null);
            loadRequests();
          }}
        />
      )}
    </>
  );

  if (embedded) {
    return <div className="embedded-requests-workspace">{content}</div>;
  }

  const backLink =
    user.role === 'specialist'
      ? { to: '/dashboard', label: 'Back to specialist dashboard' }
      : user.role === 'admin'
        ? { to: '/admin', label: 'Back to administration' }
        : { to: '/home', label: 'Back to portal home' };

  return (
    <div className="container page-pad">
      <BackBar to={backLink.to} label={backLink.label} />
      <PageHeader
        title={isStaff ? 'Client Requests & Inquiries' : 'Requests & Specialist Inquiries'}
        subtitle={
          isStaff
            ? 'Track, review, and resolve requests submitted by clinics regarding patient statements and billing ledger updates.'
            : 'Submit questions, balance adjustments, insurance rebilling requests, and track specialist answers.'
        }
      >
        <div className="btn-group">
          {user.role === 'clinic_user' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setNewRequestOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconSend size={15} /> + New Request to US24
            </button>
          )}
        </div>
      </PageHeader>
      {content}
    </div>
  );
}

export function RequestsPage() {
  return <RequestsContent embedded={false} />;
}
