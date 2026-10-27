import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { IconDownload, IconExternalLink, IconFileText, IconPrint, IconUpload } from '../../components/Icons.jsx';
import { RemarksLedger } from '../../components/RemarksLedger.jsx';
import { StatementDocument } from '../../components/StatementDocument.jsx';
import { Alert, BackBar, Field, Modal, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api, downloadFile } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime, money } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';

function WithdrawDialog({ clinicName, statementId, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim()) {
      setError('Enter a reason.');
      return;
    }
    setBusy(true);
    try {
      await api(`/statements/${statementId}/withdraw`, { method: 'POST', body: { reason } });
      onDone('Statement withdrawn.');
    } catch (err) {
      if (err.status === 409) onDone(err.message);
      else setError(err.fieldErrors.reason || err.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Withdraw this statement?"
      tone="warning"
      onClose={busy ? undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={submit} disabled={busy}>{busy ? 'Withdrawing…' : 'Withdraw'}</button>
        </>
      }
    >
      <p>{clinicName}'s users will no longer see this statement. This is recorded in the audit log and can't be undone.</p>
      <Field label="Reason" error={error} required>
        {(p) => <textarea {...p} className="form-textarea" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Modal>
  );
}

function PrintDialog({ statementId, onCancel }) {
  const navigate = useNavigate();
  const [includeRemarks, setIncludeRemarks] = useState(false);
  return (
    <Modal
      title="Print statement"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/statements/${statementId}/print${includeRemarks ? '?remarks=1' : ''}`)}>
            Continue to print
          </button>
        </>
      }
    >
      <label className="checkbox-row">
        <input type="checkbox" checked={includeRemarks} onChange={(e) => setIncludeRemarks(e.target.checked)} />
        Include the remarks log in the printout
      </label>
    </Modal>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PatientPdfStatTab({ statement: s, role, onUploaded, onSwitchToStatement }) {
  const [previewId, setPreviewId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();
  const files = s.patientFiles || [];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast('Please select a valid PDF file.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast('Upload a PDF file up to 10 MB.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('pdf', file);
      await api(`/statements/${s.id}/files`, { method: 'POST', form });
      toast('PDF statement uploaded successfully.', 'success');
      if (onUploaded) await onUploaded();
    } catch (err) {
      toast(err.message || 'Failed to upload PDF.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="pdf-stat-hub">
      <div className="pdf-stat-header">
        <div>
          <h2 className="pdf-stat-header-title">
            <IconFileText size={20} color="#253B80" />
            PDF Statements for {s.patientName}
            {files.length > 0 && (
              <span className="badge badge-secondary" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>
            )}
          </h2>
          <p className="pdf-stat-header-subtitle">
            All statement PDFs for Account <strong className="col-mono">{s.accountNumber}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {role === 'specialist' && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                accept="application/pdf,.pdf"
                style={{ display: 'none' }}
                onChange={handleUpload}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || s.status?.toLowerCase() === 'withdrawn'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title="Upload a PDF statement for this patient"
              >
                <IconUpload size={14} /> {uploading ? 'Uploading…' : 'Upload PDF'}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onSwitchToStatement}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            ← View Statement Details
          </button>
        </div>
      </div>

      {files.length > 0 ? (
        <div className="pdf-file-cards-list">
          {files.map((file) => (
            <div key={file.id || `${file.statementId}-${file.name}`} className={`pdf-file-card ${file.isCurrent ? 'is-current' : ''}`}>
              <div className="pdf-file-card-top">
                <div className="pdf-file-card-info">
                  <div className="pdf-file-icon-box">
                    <IconFileText size={22} />
                  </div>
                  <div>
                    <div className="pdf-file-title">
                      <span>{file.name}</span>
                      {file.isCurrent ? (
                        <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Current Statement</span>
                      ) : (
                        <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>Past Cycle</span>
                      )}
                      {file.version > 1 && (
                        <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>v{file.version}</span>
                      )}
                    </div>
                    <div className="pdf-file-meta">
                      <span>Statement Date: <strong>{date(file.statementDate)}</strong></span>
                      <span>Balance: <strong className="col-mono">{money(file.balanceDue)}</strong></span>
                      <span>Size: <strong>{formatBytes(file.sizeBytes)}</strong></span>
                      <span>Updated: <strong>{dateTime(file.createdAt)}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="pdf-file-actions">
                  <a
                    href={file.id ? `/api/statements/${file.statementId}/file?fileId=${file.id}` : `/api/statements/${file.statementId}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    title="Open PDF Statement in a new tab"
                  >
                    <IconExternalLink size={13} /> Open PDF
                  </a>
                  <a
                    href={file.id ? `/api/statements/${file.statementId}/download?fileId=${file.id}` : `/api/statements/${file.statementId}/download`}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    title="Download this PDF statement"
                  >
                    <IconDownload size={13} /> Download
                  </a>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPreviewId(previewId === (file.id || file.statementId) ? null : (file.id || file.statementId))}
                  >
                    {previewId === (file.id || file.statementId) ? 'Hide Preview' : 'Preview'}
                  </button>
                </div>
              </div>

              {previewId === (file.id || file.statementId) && (
                <div className="pdf-preview-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                      Previewing {file.name}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPreviewId(null)}
                      style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    >
                      Close Preview
                    </button>
                  </div>
                  <iframe
                    className="pdf-preview-frame"
                    src={file.id ? `/api/statements/${file.statementId}/file?fileId=${file.id}` : `/api/statements/${file.statementId}/file`}
                    title={`PDF preview for ${file.name}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="pdf-file-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ margin: '0 auto 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 24, background: '#f1f5f9', color: '#64748b' }}>
            <IconFileText size={24} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>No PDF Statements Attached</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--color-text-muted)', fontSize: '0.88rem', maxWidth: 480, marginInline: 'auto' }}>
            {role === 'specialist'
              ? 'No PDF file has been uploaded for this patient yet. You can upload a PDF statement directly using the button below or view the system-generated PDF.'
              : 'No PDF file is attached to this patient statement yet. You can view or download the official system-generated PDF statement.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            {role === 'specialist' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || s.status?.toLowerCase() === 'withdrawn'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <IconUpload size={14} /> {uploading ? 'Uploading…' : 'Upload PDF'}
              </button>
            )}
            <a
              href={`/api/statements/${s.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className={role === 'specialist' ? 'btn btn-secondary' : 'btn btn-primary'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconExternalLink size={14} /> Open Generated Statement PDF
            </a>
            <a
              href={`/api/statements/${s.id}/download`}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <IconDownload size={14} /> Download PDF
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// P2 – Statement detail with remarks (F10, F11, F12)
export function StatementDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [published, setPublished] = useState(location.state?.published ?? null);
  const [docTab, setDocTab] = useState('statement'); // 'statement' | 'pdf'

  const load = useCallback(() => {
    setError(null);
    return api(`/statements/${id}`).then(setData).catch(setError);
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error?.status === 404) return <NotFoundPage />;
  if (error) return <div className="container"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <div className="container"><Spinner label="Loading statement…" /></div>;

  const { statement: s, clinic, remarks, otherStatements } = data;
  const isStaff = user.role !== 'clinic_user';
  const backTo = location.state?.from || (isStaff ? `/clinics/${clinic.id}/statements` : '/statements');

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(`/statements/${s.id}/download`, `statement-${s.statementDate}.pdf`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="container">
      <BackBar to={backTo} label="Back to statements" trail={[isStaff ? clinic.name : 'Statements', s.patientName]} />

      {published && <Alert tone="success" onDismiss={() => setPublished(null)}>Statement published to {published}.</Alert>}
      {s.status?.toLowerCase() === 'withdrawn' && (
        <Alert tone="error" title={`Withdrawn on ${dateTime(s.withdrawnAt)} by ${s.withdrawnByName}.`}>
          Reason: {s.withdrawalReason}
        </Alert>
      )}
      {s.newerVersionId && (
        <Alert tone="info">
          This is an earlier version. <Link to={`/statements/${s.newerVersionId}`}>View the current version</Link>.
        </Alert>
      )}

      <div className="detail-hero-band">
        <div className="detail-hero-top">
          <div className="detail-patient-meta">
            <h1 className="detail-patient-name">
              {s.patientName}
              {s.locationName && <span className="badge badge-secondary" style={{ marginLeft: 8, fontSize: '0.8rem', verticalAlign: 'middle' }}>{s.locationName}</span>}
              {s.prType && <span className={`badge-pr pr-${s.prType.toLowerCase().replace(/[^a-z0-9]/g, '-')}`} style={{ marginLeft: 8, fontSize: '0.8rem', verticalAlign: 'middle' }}>{s.prType}</span>}
              {s.ledgerStatus && <span className={`badge-ledger-status status-${s.ledgerStatus.toLowerCase().replace(/[^a-z0-9]/g, '-')}`} style={{ marginLeft: 8, fontSize: '0.8rem', verticalAlign: 'middle' }}>{s.ledgerStatus}</span>}
              {s.wasNew && <span className="badge badge-new">New</span>}
              {s.status?.toLowerCase() === 'withdrawn' && <StatusBadge status="withdrawn" />}
            </h1>
            <div className="detail-sub-meta">
              <span>Account <strong className="col-mono">{s.accountNumber}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Statement date <strong>{date(s.statementDate)}</strong></span>
              {isStaff && <><span aria-hidden="true">·</span><span>{clinic.name}</span></>}
              {s.version > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Version {s.version}{s.earlierVersionId && <> (<Link to={`/statements/${s.earlierVersionId}`}>earlier version</Link>)</>}</span>
                </>
              )}
            </div>
            <div className="detail-published">Published {dateTime(s.uploadedAt)} by {s.uploadedByName}, US24 Solutions</div>
          </div>

          <div className="detail-hero-tabs">
            <button
              type="button"
              className={`pdf-stat-tab-btn ${docTab === 'statement' ? 'active' : ''}`}
              onClick={() => setDocTab('statement')}
              title="View Statement Details & Ledger"
            >
              Statement
            </button>
            <button
              type="button"
              className={`pdf-stat-tab-btn ${docTab === 'pdf' ? 'active' : ''}`}
              onClick={() => setDocTab('pdf')}
              title="View All PDF Statements from ZIP uploads for this patient"
            >
              <IconFileText size={15} /> PDF Stat.
              {s.patientFiles?.length > 0 && (
                <span className="badge badge-secondary" style={{ marginLeft: 6, fontSize: '0.68rem', padding: '1px 6px' }}>
                  {s.patientFiles.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="detail-actions-bar">
          <div className="detail-balance-hero">
            <div className="balance-hero-label">Patient balance due</div>
            <div className="balance-hero-amount">{money(s.balanceDue)}</div>
          </div>
          <div className="detail-buttons">
            {docTab !== 'pdf' && (
              <button type="button" className="btn btn-secondary" onClick={() => setDialog('print')}><IconPrint /> Print</button>
            )}
            <button type="button" className="btn btn-primary" onClick={download} disabled={downloading}>
              <IconDownload /> {downloading ? 'Preparing…' : 'Download PDF'}
            </button>
            {user.role === 'specialist' && s.status?.toLowerCase() !== 'withdrawn' && (
              <button type="button" className="btn btn-danger-outline" onClick={() => setDialog('withdraw')}>Withdraw</button>
            )}
          </div>
        </div>
      </div>

      <div className="detail-columns-grid">
        <div className="statement-document-card">
          {docTab === 'pdf' ? (
            <PatientPdfStatTab
              statement={s}
              role={user.role}
              onUploaded={load}
              onSwitchToStatement={() => setDocTab('statement')}
            />
          ) : s.source === 'pdf_upload' && s.file && !s.lineItems?.length ? (
            <div className="pdf-panel" style={{ padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ marginBottom: 14, fontWeight: 500 }}>
                This statement was uploaded as a PDF document ({s.file.name}).
              </p>
              <a
                className="btn btn-primary"
                href={`/api/statements/${s.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <IconFileText size={16} /> Open PDF Statement <IconExternalLink size={14} />
              </a>
            </div>
          ) : (
            <StatementDocument statement={s} clinic={clinic} />
          )}

          {otherStatements.length > 0 && (
            <div className="other-statements-box">
              <h2 className="other-statements-title">Other statements for this patient</h2>
              <ul className="other-statements-list">
                {otherStatements.map((o) => (
                  <li key={o.id}>
                    <Link to={`/statements/${o.id}`} className="other-statement-item" state={{ from: backTo }}>
                      <span>
                        {date(o.statementDate)}
                        {o.version > 1 && <span className="badge badge-info">v{o.version}</span>}
                        {o.status === 'withdrawn' && <StatusBadge status="withdrawn" />}
                      </span>
                      <span className="col-mono">{money(o.balanceDue)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <RemarksLedger
          statementId={s.id}
          remarks={remarks}
          role={user.role}
          canAdd={s.status?.toLowerCase() !== 'withdrawn' && user.role !== 'admin'}
          onAdded={(r) => {
            setData((d) => ({
              ...d,
              remarks: [...d.remarks, r],
              statement: {
                ...d.statement,
                us24Notes: r.type === 'specialist' ? r.body : d.statement.us24Notes,
                remarks: r.type === 'specialist' ? r.body : (d.statement.remarks || d.statement.us24Notes),
                clientResponse: r.type === 'clinic' ? r.body : d.statement.clientResponse,
                vobNotes: r.type === 'insurance' ? r.body : d.statement.vobNotes,
              },
            }));
          }}
        />
      </div>

      {dialog === 'print' && <PrintDialog statementId={s.id} onCancel={() => setDialog(null)} />}
      {dialog === 'withdraw' && (
        <WithdrawDialog
          clinicName={clinic.name}
          statementId={s.id}
          onCancel={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null);
            toast(msg);
            load();
          }}
        />
      )}
    </div>
  );
}
