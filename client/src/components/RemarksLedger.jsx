import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { dateTime } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { IconChat } from './Icons.jsx';
import { Alert, Field } from './ui.jsx';

const TYPE = {
  clinic: { cls: 'clinic', label: 'Clinic' },
  specialist: { cls: 'specialist', label: 'US24 Specialist' },
  insurance: { cls: 'insurance', label: 'Insurance' },
};
const MAX = 2000;

function RemarkForm({ statementId, role, onAdded }) {
  const toast = useToast();
  const [type, setType] = useState(role === 'clinic_user' ? 'clinic' : 'specialist');
  const [body, setBody] = useState('');
  const [insuranceName, setInsuranceName] = useState('');
  const [insuranceReference, setInsuranceReference] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!body.trim()) fe.body = 'Enter a remark.';
    if (body.length > MAX) fe.body = 'Remarks are limited to 2,000 characters.';
    if (type === 'insurance' && !insuranceName.trim()) fe.insuranceName = 'Enter the insurance company name.';
    setErrors(fe);
    setError('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const d = await api(`/statements/${statementId}/remarks`, {
        method: 'POST',
        body: { type, body, insuranceName, insuranceReference },
      });
      onAdded(d.remark);
      setBody('');
      setInsuranceName('');
      setInsuranceReference('');
      toast('Remark added.');
    } catch (err) {
      // Typed text is kept so nothing is lost (App Flow 4.1).
      const fe = err.fieldErrors || {};
      setErrors(fe);
      if (!Object.keys(fe).length) setError(err.status === 0 ? "Couldn't save. Check your connection and try again." : err.message || 'Error posting remark.');
    } finally {
      setBusy(false);
    }
  };

  const len = body.length;
  return (
    <form className="add-remark-section" onSubmit={submit} noValidate>
      <h4 className="add-remark-title">Add a remark</h4>
      <p className="add-remark-rule-hint">Remarks can't be edited or deleted after posting.</p>
      {role === 'specialist' && (
        <fieldset className="segmented" aria-label="Remark type">
          <legend className="sr-only">Remark type</legend>
          {['specialist', 'insurance'].map((t) => (
            <label key={t} className={`segmented-option ${type === t ? 'selected' : ''}`}>
              <input type="radio" name="remark-type" value={t} checked={type === t} onChange={() => setType(t)} />
              {t === 'specialist' ? 'Specialist remark' : 'Insurance remark'}
            </label>
          ))}
        </fieldset>
      )}
      {type === 'insurance' && (
        <div className="form-row-2">
          <Field label="Insurance company" error={errors.insuranceName} required>
            {(p) => <input {...p} className="form-input" maxLength={200} value={insuranceName} onChange={(e) => setInsuranceName(e.target.value)} />}
          </Field>
          <Field label="Reference or call number" error={errors.insuranceReference}>
            {(p) => <input {...p} className="form-input" maxLength={100} value={insuranceReference} onChange={(e) => setInsuranceReference(e.target.value)} />}
          </Field>
        </div>
      )}
      <Field label="Remark" error={errors.body}>
        {(p) => (
          <textarea {...p} className="form-textarea" value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={role === 'clinic_user' ? 'Share an update or question with US24 Solutions…' : 'Add a note for the clinic…'} />
        )}
      </Field>
      <div className="char-counter-line">
        <span>{role === 'clinic_user' ? 'Shared with your US24 billing specialist.' : 'Visible to the clinic.'}</span>
        <span className={`char-counter ${len > MAX ? 'danger' : len >= 1800 ? 'warning' : ''}`} aria-live="polite">
          {len.toLocaleString('en-US')} / 2,000
        </span>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || len > MAX}>
        {busy ? 'Posting…' : 'Post remark'}
      </button>
    </form>
  );
}

/** Remarks log, oldest first (FR-11.1). */
export function RemarksLedger({ statementId, remarks, canAdd, role, onAdded, printMode = false }) {
  const feed = useRef(null);
  // Newest remarks are at the bottom; keep them in view on open and after posting.
  useEffect(() => {
    if (!printMode && feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [remarks.length, printMode]);

  return (
    <section className="remarks-card" aria-labelledby="remarks-heading">
      <div className="remarks-header">
        <h2 id="remarks-heading"><IconChat size={20} /> Remarks</h2>
        <span className="badge badge-count">{remarks.length} {remarks.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <ol className={`remarks-feed ${printMode ? 'print-feed' : ''}`} ref={feed} aria-label="Remark history, oldest first">
        {remarks.length === 0 && <li className="remarks-empty">No remarks yet.</li>}
        {remarks.map((r) => {
          const tInfo = TYPE[r.type] || { cls: 'specialist', label: r.type === 'clinic' ? 'Clinic' : 'US24 Specialist' };
          return (
            <li key={r.id} id={`remark-${r.id}`} className={`remark-entry ${tInfo.cls}-remark`}>
              <div className="remark-meta">
                <span className="remark-author-role">
                  {r.authorName || 'Staff'}
                  <span className={`remark-role-tag tag-${tInfo.cls}`}>{tInfo.label}</span>
                </span>
                <time className="remark-timestamp" dateTime={r.createdAt}>{dateTime(r.createdAt)}</time>
              </div>
              {r.type === 'insurance' && (
                <div className="remark-insurance-extra">
                  <strong>Payer:</strong> {r.insuranceName}
                  {r.insuranceReference && <> · <strong>Ref #:</strong> {r.insuranceReference}</>}
                </div>
              )}
              <div className="remark-body">{r.body}</div>
            </li>
          );
        })}
      </ol>
      {!printMode && canAdd && <RemarkForm statementId={statementId} role={role} onAdded={onAdded} />}
    </section>
  );
}
