import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconChat, IconClock, IconDownload, IconInbox, IconSearch, IconSend, IconTable } from '../../components/Icons.jsx';
import { Alert, BackBar, EmptyState, Field, Modal, PageHeader, Pagination, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime, money } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';

const CATEGORIES = [
  'Balance Adjustment / Inquiry',
  'Re-bill Insurance / Submit Claim',
  'Insurance Verification (VOB)',
  'Statement Dispute / Correction',
  'Payment / Collection Question',
  'General Request',
];

const PRIORITIES = [
  { value: 'Normal', label: 'Normal', cls: 'priority-normal' },
  { value: 'High', label: 'High Priority', cls: 'priority-high' },
  { value: 'Urgent', label: 'Urgent Attention', cls: 'priority-urgent' },
];

function NewRequestModal({ onClose, onCreated, clinicId }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [statementResults, setStatementResults] = useState([]);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState('Normal');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Initial load of recent statements for selection
  useEffect(() => {
    let ignore = false;
    setSearching(true);
    const params = new URLSearchParams({ limit: '15' });
    if (q) params.set('q', q);
    if (clinicId) params.set('clinicId', clinicId);

    const timer = setTimeout(() => {
      api(`/requests/statements?${params.toString()}`)
        .then((res) => {
          if (!ignore) {
            setStatementResults(res.statements || []);
            setSearching(false);
          }
        })
        .catch(() => {
          if (!ignore) setSearching(false);
        });
    }, q ? 300 : 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [q, clinicId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStatement) {
      setError('Please search and select a patient statement.');
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
          statementId: selectedStatement.id,
          category,
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
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy || !selectedStatement || !body.trim()}>
            {busy ? 'Submitting…' : 'Submit Request'}
          </button>
        </>
      }
    >
      <div className="new-request-dialog-content">
        {error && <Alert tone="error">{error}</Alert>}

        {/* 1. Select Patient Statement */}
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
            1. Select Patient Statement <span className="text-danger">*</span>
          </label>
          {selectedStatement ? (
            <div className="selected-statement-card">
              <div className="selected-st-info">
                <strong>{selectedStatement.patientName}</strong>
                <span className="col-mono" style={{ marginLeft: 8 }}>{selectedStatement.accountNumber}</span>
                <div className="form-hint">
                  Date: {date(selectedStatement.statementDate)} · Balance: <strong className="col-mono">{money(selectedStatement.currentBalance)}</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedStatement(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <div className="input-with-icon" style={{ marginBottom: 8 }}>
                <IconSearch className="input-icon" />
                <input
                  type="search"
                  className="form-input"
                  placeholder="Search patient name or account number…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="statement-picker-list">
                {searching ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>Searching statements…</div>
                ) : statementResults.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>No matching statements found.</div>
                ) : (
                  statementResults.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      className="statement-picker-item"
                      onClick={() => setSelectedStatement(st)}
                    >
                      <div className="picker-patient-name">{st.patientName}</div>
                      <div className="picker-details">
                        <span className="col-mono">{st.accountNumber}</span> · {date(st.statementDate)} · <strong>{money(st.currentBalance)}</strong>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Request Category */}
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
            2. Request Category
          </label>
          <div className="request-categories-grid">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`request-cat-btn ${category === cat ? 'active' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Priority */}
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
            3. Urgency / Priority
          </label>
          <div className="priority-pills-row">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`priority-pill-btn ${p.cls} ${priority === p.value ? 'active' : ''}`}
                onClick={() => setPriority(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Request Details */}
        <div className="form-group">
          <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
            4. Detailed Request Instructions <span className="text-danger">*</span>
          </label>
          <textarea
            className="form-textarea"
            rows={4}
            maxLength={2000}
            placeholder="Explain the required update, rebilling details, patient dispute, or question for US24 billing specialists…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="form-hint text-right" style={{ marginTop: 4 }}>
            {body.length} / 2,000 characters
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ReplyModal({ request: r, onClose, onReplied }) {
  const toast = useToast();
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) {
      setError('Please enter your response.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/requests', {
        method: 'POST',
        body: {
          statementId: r.statementId,
          body: replyText.trim(),
          isReply: true,
        },
      });
      toast('Reply sent and request updated.', 'success');
      onReplied();
    } catch (err) {
      setError(err.message || 'Failed to send reply.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Reply to Client Request"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !replyText.trim()}>
            {busy ? 'Sending…' : 'Send Response'}
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 16, background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong>{r.patientName} (Account: {r.accountNumber})</strong>
          <span className={`badge-priority ${r.priority.toLowerCase()}`}>{r.priority}</span>
        </div>
        <div style={{ fontSize: '0.88rem', color: '#475569', marginBottom: 6 }}>
          <strong>{r.category}:</strong> {r.body}
        </div>
        <div className="form-hint">Submitted by {r.authorName} · {dateTime(r.createdAt)}</div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="form-group">
        <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
          Specialist Response
        </label>
        <textarea
          className="form-textarea"
          rows={4}
          maxLength={2000}
          placeholder="Type your resolution, update on rebill/status, or instructions for the clinic user…"
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

export function RequestsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const clinicId = searchParams.get('clinicId') ?? '';
  const status = searchParams.get('status') ?? 'all'; // 'awaiting' | 'answered' | 'all'
  const page = Number(searchParams.get('page') ?? 1);

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
      if (
        v === '' ||
        v === null ||
        (k === 'page' && v === 1) ||
        (k === 'status' && v === 'all')
      ) {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    }
    if (!('page' in changes)) next.delete('page');
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

            {isStaff && data?.clinics?.length > 1 && (
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
                  <span className={`request-badge-category category-${r.category.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                    {r.category}
                  </span>
                  <span className={`badge-priority priority-${r.priority.toLowerCase()}`}>
                    {r.priority}
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
                  <span className="col-mono" style={{ marginLeft: 8 }}>Account: {r.accountNumber}</span>
                  <span className="pipe-sep">·</span>
                  <span>Date: {date(r.statementDate)}</span>
                  <span className="pipe-sep">·</span>
                  <span>Balance: <strong className="col-mono">{money(r.currentBalance)}</strong></span>
                  {isStaff && (
                    <>
                      <span className="pipe-sep">·</span>
                      <span className="clinic-tag-pill">{r.clinicName} ({r.clinicCode})</span>
                    </>
                  )}
                </div>
                <Link to={`/statements/${r.statementId}`} className="btn btn-secondary btn-sm" title="View Full Statement Document">
                  View Statement →
                </Link>
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
                  <Link to={`/statements/${r.statementId}`} className="btn btn-secondary btn-sm">
                    Open Statement Details
                  </Link>
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
          clinicId={user.clinic_id}
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
    </div>
  );
}
