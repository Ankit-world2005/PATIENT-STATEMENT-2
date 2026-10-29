import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
// Inquiries and communication threads without statement links
import { IconChat, IconCheck, IconClock, IconInbox, IconSearch, IconSend } from '../../components/Icons.jsx';
import {
  RemarkAttachmentBar,
  RemarkAttachmentViewer,
  RemarkInputBox,
  useAttachmentUploader,
} from '../../components/RemarkAttachments.jsx';
import { Alert, BackBar, EmptyState, Modal, PageHeader, Pagination, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime, money } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';

export const REQUESTS_VIEW_VERSION = '1.0.2';
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

  const {
    attachments,
    uploading,
    uploadError,
    handleFiles,
    handlePaste,
    removeAttachment,
    clearAttachments,
  } = useAttachmentUploader();

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
    if (!body.trim() && attachments.length === 0) {
      setError('Please enter request details or attach a file.');
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
          attachments,
        },
      });
      toast('Request submitted to US24 Specialists.', 'success');
      clearAttachments();
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
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy || !patientName.trim() || uploading}>
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
            Details / Question for Specialist
          </label>
          <RemarkInputBox
            id="req-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handlePaste}
            placeholder="Type your inquiry, request, or question for the US24 specialist here…"
            attachments={attachments}
            uploading={uploading}
            uploadError={uploadError}
            onAddFiles={handleFiles}
            onRemoveAttachment={removeAttachment}
            disabled={busy}
            rows={4}
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

  const {
    attachments,
    uploading,
    uploadError,
    handleFiles,
    handlePaste,
    removeAttachment,
    clearAttachments,
  } = useAttachmentUploader();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!replyText.trim() && attachments.length === 0) {
      setError('Please enter a response or attach a file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/requests/${request.id}/reply`, {
        method: 'POST',
        body: { body: replyText.trim(), attachments },
      });
      toast('Response sent to clinic.', 'success');
      clearAttachments();
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
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy || uploading}>
            {busy ? 'Sending…' : 'Send Response'}
          </button>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      <div className="reply-modal-original">
        <div className="original-req-meta">
          <strong>{request.patientName}</strong> · Submitted by {request.authorName} ({dateTime(request.createdAt)})
        </div>
        <div className="original-req-badge">
          <span className={`badge-priority priority-${request.priority?.toLowerCase() || 'normal'}`}>
            {request.priority || 'Normal'}
          </span>
        </div>
        <div className="original-req-body">
          {request.body}
        </div>
        <RemarkAttachmentViewer attachments={request.attachments} />
      </div>

      <div className="form-group" style={{ marginTop: 16 }}>
        <label className="form-label" htmlFor="reply-text">
          US24 Specialist Response
        </label>
        <RemarkInputBox
          id="reply-text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onPaste={handlePaste}
          placeholder="Type your response to the clinic here…"
          autoFocus
          attachments={attachments}
          uploading={uploading}
          uploadError={uploadError}
          onAddFiles={handleFiles}
          onRemoveAttachment={removeAttachment}
          disabled={busy}
          rows={4}
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
          <div
            className={'stat-card stat-card-total ' + (status === 'all' ? 'stat-card-active' : '')}
            onClick={() => update({ status: 'all' })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                update({ status: 'all' });
              }
            }}
            title="Filter to all requests"
          >
            <div className="stat-card-header">
              <span className="stat-label">Total Requests</span>
              <span className="stat-icon-wrap stat-icon-total">
                <IconInbox size={16} />
              </span>
            </div>
            <div className="stat-value">{data.metrics.totalRequests}</div>
            <div className="stat-sub">Across statements</div>
          </div>

          <div
            className={'stat-card stat-card-awaiting ' + (status === 'awaiting' ? 'stat-card-active' : '')}
            onClick={() => update({ status: 'awaiting' })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                update({ status: 'awaiting' });
              }
            }}
            title="Filter to requests awaiting specialist"
          >
            <div className="stat-card-header">
              <span className="stat-label">Awaiting US24 Specialist</span>
              <span className="stat-icon-wrap stat-icon-awaiting">
                <IconClock size={16} />
              </span>
            </div>
            <div className="stat-value stat-value-awaiting">{data.metrics.awaitingCount}</div>
            <div className="stat-sub">Pending response</div>
          </div>

          <div
            className={'stat-card stat-card-answered ' + (status === 'answered' ? 'stat-card-active' : '')}
            onClick={() => update({ status: 'answered' })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                update({ status: 'answered' });
              }
            }}
            title="Filter to answered requests"
          >
            <div className="stat-card-header">
              <span className="stat-label">Answered / Resolved</span>
              <span className="stat-icon-wrap stat-icon-answered">
                <IconCheck size={16} />
              </span>
            </div>
            <div className="stat-value stat-value-answered">{data.metrics.answeredCount}</div>
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
        <div className="requests-list" data-rev="no-stmt-nav">
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

              {/* Patient context bar */}
              <div className="request-patient-bar">
                <div className="patient-context-info">
                  <span className="patient-req-name">Patient: <strong>{r.patientName}</strong></span>
                  {isStaff && (
                    <>
                      <span className="pipe-sep">·</span>
                      <span className="clinic-tag-pill">{r.clinicName} ({r.clinicCode})</span>
                    </>
                  )}
                </div>
              </div>

              {/* Unified Conversation Box (1st request + all replies in the SAME box) */}
              <div className="request-conversation-box">
                {/* 1st Request from Clinic */}
                <div className="conv-message conv-message-original">
                  <div className="conv-msg-header">
                    <div className="conv-author-info">
                      <strong className="conv-author-name">{r.authorName}</strong>
                      <span className="conv-role-tag clinic-tag">
                        {r.type === 'clinic' ? 'Clinic' : 'Inquiry'}
                      </span>
                    </div>
                    <span className="conv-msg-date">{dateTime(r.createdAt)}</span>
                  </div>
                  <p className="conv-msg-body">{r.body}</p>
                  <RemarkAttachmentViewer attachments={r.attachments} />
                </div>

                {/* Specialist Replies (in the same box) */}
                {(r.replies && r.replies.length > 0 ? r.replies : (r.latestReply ? [r.latestReply] : [])).map((rep, idx) => (
                  <div key={rep.id || idx} className="conv-message conv-message-reply">
                    <div className="conv-msg-header">
                      <div className="conv-author-info">
                        <IconChat size={13} className="conv-reply-icon" />
                        <strong className="conv-author-name">{rep.authorName}</strong>
                        <span className="conv-role-tag specialist-tag">US24 Specialist</span>
                      </div>
                      <span className="conv-msg-date">{dateTime(rep.createdAt)}</span>
                    </div>
                    <p className="conv-msg-body">{rep.body}</p>
                    <RemarkAttachmentViewer attachments={rep.attachments} />
                  </div>
                ))}

                {/* Awaiting Specialist response indicator within same box */}
                {r.isAwaiting && (!r.replies || r.replies.length === 0) && !r.latestReply && (
                  <div className="conv-awaiting-bar">
                    <IconClock size={13} />
                    <span>Awaiting response from US24 Specialist</span>
                  </div>
                )}
              </div>

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
