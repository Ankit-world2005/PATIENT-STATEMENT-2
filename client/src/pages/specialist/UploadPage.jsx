import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { IconDocument } from '../../components/Icons.jsx';
import { Alert, BackBar, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { date, fileSize, money } from '../../lib/format.js';

const REQUIRED = [
  { key: 'patient_name', label: 'Patient name', type: 'text', max: 200 },
  { key: 'account_number', label: 'Account number', type: 'text', max: 64 },
  { key: 'statement_date', label: 'Statement date', type: 'date' },
  { key: 'balance_due', label: 'Balance due', type: 'money', hint: 'Use a minus sign for a credit, e.g. -25.00' },
];
const OPTIONAL = [
  { key: 'patient_dob', label: 'Date of birth', type: 'date' },
  { key: 'insurance_name', label: 'Insurance name', type: 'text', max: 200 },
  { key: 'service_date_from', label: 'Service date from', type: 'date' },
  { key: 'service_date_to', label: 'Service date to', type: 'date' },
  { key: 'billed_amount', label: 'Billed amount', type: 'money' },
  { key: 'insurance_paid', label: 'Insurance paid', type: 'money' },
  { key: 'adjustments', label: 'Adjustments', type: 'money' },
  { key: 'cpt_codes', label: 'CPT codes', type: 'text', max: 400, hint: 'Separate codes with spaces or commas' },
];
const EMPTY = Object.fromEntries([...REQUIRED, ...OPTIONAL].map((f) => [f.key, '']));
const MAX_BYTES = 10 * 1024 * 1024;

function FieldInput({ field, value, error, onChange, required }) {
  return (
    <Field label={field.label} error={error} hint={field.hint} required={required}>
      {(p) => (
        <input
          {...p}
          className="form-input"
          type={field.type === 'date' ? 'date' : 'text'}
          inputMode={field.type === 'money' ? 'decimal' : undefined}
          maxLength={field.max}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}
    </Field>
  );
}

// S2 + S3 – Single statement upload (F7). Values and the file stay in memory
// (never in browser storage) so "Back to edit" keeps them.
export function UploadPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clinics, setClinics] = useState(null);
  const [clinicId, setClinicId] = useState(params.get('clinicId') ?? '');
  const [values, setValues] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [showOptional, setShowOptional] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    api('/publishable-clinics')
      .then((d) => {
        setClinics(d.clinics);
        if (d.clinics.length === 1) setClinicId(d.clinics[0].id);
        else if (!d.clinics.some((c) => c.id === params.get('clinicId'))) setClinicId('');
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setValue = (key, v) => setValues((s) => ({ ...s, [key]: v }));

  const chooseFile = (f) => {
    setErrors((e) => ({ ...e, pdf: undefined }));
    if (!f) return setFile(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      setErrors((e) => ({ ...e, pdf: 'Upload a PDF file up to 10 MB.' }));
      return setFile(null);
    }
    if (f.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, pdf: 'Upload a PDF file up to 10 MB.' }));
      return setFile(null);
    }
    setFile(f);
  };

  const continueToConfirm = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!clinicId) fe.clinicId = 'Choose the clinic.';
    for (const f of REQUIRED) if (!values[f.key].trim()) fe[f.key] = `${f.label} is required.`;
    if (!file) fe.pdf = errors.pdf || 'Attach the statement PDF.';
    setErrors(fe);
    setError('');
    if (Object.keys(fe).length) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.set('clinicId', clinicId);
      for (const [k, v] of Object.entries(values)) if (v.trim()) form.set(k, v.trim());
      form.set('pdf', file, file.name);
      const { id } = await api('/uploads', { method: 'POST', form });
      const d = await api(`/uploads/${id}`);
      setDraft(d.draft);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setErrors(err.fieldErrors);
      if (Object.keys(err.fieldErrors).some((k) => OPTIONAL.some((f) => f.key === k))) setShowOptional(true);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const backToEdit = async () => {
    const id = draft.id;
    setDraft(null);
    await api(`/uploads/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      const { statementId } = await api(`/uploads/${draft.id}/publish`, { method: 'POST' });
      navigate(`/statements/${statementId}`, { replace: true, state: { published: draft.clinic.name } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      if (err.status === 403) setTimeout(() => navigate('/dashboard'), 2500);
    }
  };

  const cancel = async () => {
    if (draft) await api(`/uploads/${draft.id}`, { method: 'DELETE' }).catch(() => {});
    navigate('/dashboard');
  };

  if (!clinics && !error) return <div className="container"><Spinner /></div>;

  // --- S3: confirm -------------------------------------------------------------
  if (draft) {
    const f = draft.fields;
    return (
      <div className="container page-narrow">
        <BackBar to="/dashboard" label="Back to dashboard" trail={['Upload statement', 'Confirm']} />
        <div className="destination-plate" role="region" aria-label="Destination clinic">
          <span className="destination-label">Publish to</span>
          <span className="destination-name">{draft.clinic.name}</span>
          <span className="user-clinic-badge">{draft.clinic.code}</span>
        </div>
        {draft.duplicate && (
          <Alert tone="warning" title="Possible duplicate">
            This clinic already has a statement for account {f.account_number} dated {date(f.statement_date)}
            {' '}(balance {money(draft.duplicate.balanceDue)}). This upload will be published as version {draft.duplicate.version + 1}, and
            the earlier one will be labelled "Earlier version".
          </Alert>
        )}
        <div className="panel">
          <dl className="summary-list">
            <div><dt>Patient name</dt><dd>{f.patient_name}</dd></div>
            <div><dt>Account number</dt><dd className="col-mono">{f.account_number}</dd></div>
            <div><dt>Statement date</dt><dd>{date(f.statement_date)}</dd></div>
            <div><dt>Balance due</dt><dd>{money(f.balance_due)}</dd></div>
            <div><dt>PDF file</dt><dd><IconDocument size={14} /> {draft.fileName} <span className="form-hint">({fileSize(draft.sizeBytes)})</span></dd></div>
          </dl>
        </div>
        <p className="publish-notice">Once published, {draft.clinic.name}'s users can see this statement immediately.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={backToEdit} disabled={busy}>Back to edit</button>
          <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Confirm and publish'}</button>
        </div>
      </div>
    );
  }

  // --- S2: details and PDF ------------------------------------------------------
  return (
    <div className="container page-narrow">
      <BackBar to="/dashboard" label="Back to dashboard" trail={['Dashboard', 'Upload statement']} />
      <PageHeader title="Upload a statement" subtitle="One patient's statement with its PDF. You'll confirm the clinic before anything is published." />
      {clinics?.length === 0 && <Alert tone="info">You haven't been assigned to any active clinics yet. Contact your administrator.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <form className="panel form-panel" onSubmit={continueToConfirm} noValidate>
        <Field label="Clinic" error={errors.clinicId} required>
          {(p) => (
            <select {...p} className="form-select" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
              <option value="">Choose a clinic…</option>
              {clinics?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          )}
        </Field>
        <div className="form-row-2">
          {REQUIRED.map((f) => <FieldInput key={f.key} field={f} value={values[f.key]} error={errors[f.key]} onChange={setValue} required />)}
        </div>

        <button type="button" className="btn-tertiary disclosure" aria-expanded={showOptional} onClick={() => setShowOptional((s) => !s)}>
          {showOptional ? '− Hide optional details' : '+ Add optional details (date of birth, service dates, amounts…)'}
        </button>
        {showOptional && (
          <div className="form-row-2">
            {OPTIONAL.map((f) => <FieldInput key={f.key} field={f} value={values[f.key]} error={errors[f.key]} onChange={setValue} />)}
          </div>
        )}

        <Field label="Statement PDF" error={errors.pdf} hint="PDF only, up to 10 MB." required>
          {(p) => (
            <div className={`dropzone ${file ? 'has-file' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files[0]); }}>
              <input {...p} ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only-input"
                onChange={(e) => chooseFile(e.target.files[0])} />
              {file ? (
                <span><IconDocument size={16} /> <strong>{file.name}</strong> <span className="form-hint">({fileSize(file.size)})</span></span>
              ) : (
                <span>Drag a PDF here, or</span>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current.click()}>
                {file ? 'Choose a different file' : 'Choose file'}
              </button>
            </div>
          )}
        </Field>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || clinics?.length === 0}>{busy ? 'Uploading…' : 'Continue'}</button>
        </div>
      </form>
      <p className="form-hint center"><Link to="/imports/new">Publishing many statements? Use Import statements instead.</Link></p>
    </div>
  );
}
