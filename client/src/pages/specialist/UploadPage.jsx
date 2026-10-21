import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { IconDocument } from '../../components/Icons.jsx';
import { Alert, BackBar, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { date, fileSize, money } from '../../lib/format.js';

const INITIAL_VALUES = {
  location_name: '',
  patient_name: '',
  cycle1_date: '',
  cycle1_balance: '',
  cycle1_payment: '',
  cycle2_date: '',
  cycle2_balance: '',
  cycle2_payment: '',
  cycle3_date: '',
  cycle3_balance: '',
  cycle3_payment: '',
  current_balance: '',
  pr_type: 'Copay',
  status: 'Active',
  us24_notes: '',
};

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clinics, setClinics] = useState(null);
  const [clinicId, setClinicId] = useState(params.get('clinicId') ?? '');
  const [values, setValues] = useState(INITIAL_VALUES);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    api('/publishable-clinics')
      .then((d) => {
        setClinics(d.clinics);
        if (d.clinics.length === 1) {
          setClinicId(d.clinics[0].id);
          setValues((v) => ({ ...v, location_name: v.location_name || d.clinics[0].name }));
        } else if (!d.clinics.some((c) => c.id === params.get('clinicId'))) {
          setClinicId('');
        } else {
          const chosen = d.clinics.find((c) => c.id === params.get('clinicId'));
          if (chosen) setValues((v) => ({ ...v, location_name: v.location_name || chosen.name }));
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setValue = (key, v) => setValues((s) => ({ ...s, [key]: v }));

  const handleClinicChange = (e) => {
    const cid = e.target.value;
    setClinicId(cid);
    const chosen = clinics?.find((c) => c.id === cid);
    if (chosen && (!values.location_name || clinics.some((c) => c.name === values.location_name))) {
      setValue('location_name', chosen.name);
    }
  };

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
    if (!clinicId) fe.clinicId = 'Choose a clinic.';
    if (!values.patient_name.trim()) fe.patient_name = 'Patient name is required.';
    if (!values.cycle1_date.trim()) fe.cycle1_date = '1st electronic statement date is required.';

    setErrors(fe);
    setError('');
    if (Object.keys(fe).length) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.set('clinicId', clinicId);
      for (const [k, v] of Object.entries(values)) {
        if (typeof v === 'string' && v.trim()) form.set(k, v.trim());
      }
      // If current balance wasn't explicitly entered, default it from cycle 1 balance
      if (!values.current_balance.trim() && values.cycle1_balance.trim()) {
        form.set('current_balance', values.cycle1_balance.trim());
      }
      // Provide statement_date fallback
      if (!values.cycle1_date.trim()) {
        form.set('statement_date', new Date().toISOString().slice(0, 10));
      } else {
        form.set('statement_date', values.cycle1_date.trim());
      }

      if (file) {
        form.set('pdf', file, file.name);
      }

      const { id } = await api('/uploads', { method: 'POST', form });
      const d = await api(`/uploads/${id}`);
      setDraft(d.draft);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const backToEdit = async () => {
    const id = draft?.id;
    setDraft(null);
    if (id) await api(`/uploads/${id}`, { method: 'DELETE' }).catch(() => {});
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

  // --- S3: Review & Confirm ---------------------------------------------------
  if (draft) {
    const f = draft.fields;
    return (
      <div className="container page-narrow">
        <BackBar to="/dashboard" label="Back to dashboard" trail={['Patient record', 'Review & Confirm']} />
        <div className="destination-plate" role="region" aria-label="Destination clinic">
          <span className="destination-label">Publishing to</span>
          <span className="destination-name">{draft.clinic.name}</span>
          <span className="user-clinic-badge">{draft.clinic.code}</span>
        </div>
        {draft.duplicate && (
          <Alert tone="warning" title="Possible duplicate statement">
            This clinic already has an active statement for patient <strong>{f.patient_name}</strong> dated {date(f.statement_date)} (balance {money(draft.duplicate.balanceDue)}).
            Publishing will increment to version {draft.duplicate.version + 1}.
          </Alert>
        )}
        <div className="panel">
          <div className="panel-header">
            <h2>Patient statement review</h2>
            <span className={`badge-ledger-status status-${(f.status || 'Active').toLowerCase()}`}>
              {f.status || 'Active'}
            </span>
          </div>
          <dl className="summary-list">
            <div>
              <dt>Location</dt>
              <dd>{f.location_name || draft.clinic.name}</dd>
            </div>
            <div>
              <dt>Patient</dt>
              <dd><strong>{f.patient_name}</strong></dd>
            </div>
            <div>
              <dt>Account number</dt>
              <dd className="col-mono">{f.account_number}</dd>
            </div>

            {/* Cycle 1 */}
            <div>
              <dt>1st electronic statement</dt>
              <dd>{date(f.cycle1_date || f.statement_date)}</dd>
            </div>
            <div>
              <dt>Balance due amount (1st)</dt>
              <dd>{money(f.cycle1_balance || f.balance_due)}</dd>
            </div>
            <div>
              <dt>Payment received (1st)</dt>
              <dd>{money(f.cycle1_payment || '0.00')}</dd>
            </div>

            {/* Cycle 2 */}
            {(f.cycle2_date || f.cycle2_balance) && (
              <>
                <div>
                  <dt>2nd electronic statement sent date</dt>
                  <dd>{f.cycle2_date ? date(f.cycle2_date) : '—'}</dd>
                </div>
                <div>
                  <dt>Balance due amount (2nd)</dt>
                  <dd>{f.cycle2_balance ? money(f.cycle2_balance) : '—'}</dd>
                </div>
                <div>
                  <dt>Payment received (2nd)</dt>
                  <dd>{f.cycle2_payment ? money(f.cycle2_payment) : '—'}</dd>
                </div>
              </>
            )}

            {/* Cycle 3 */}
            {(f.cycle3_date || f.cycle3_balance) && (
              <>
                <div>
                  <dt>3rd electronic statement sent date</dt>
                  <dd>{f.cycle3_date ? date(f.cycle3_date) : '—'}</dd>
                </div>
                <div>
                  <dt>Balance due amount (3rd)</dt>
                  <dd>{f.cycle3_balance ? money(f.cycle3_balance) : '—'}</dd>
                </div>
                <div>
                  <dt>Payment received (3rd)</dt>
                  <dd>{f.cycle3_payment ? money(f.cycle3_payment) : '—'}</dd>
                </div>
              </>
            )}

            {/* Balances & PR */}
            <div>
              <dt>Current outstanding balance</dt>
              <dd className="col-amount"><strong>{money(f.current_balance || f.balance_due)}</strong></dd>
            </div>
            <div>
              <dt>PR Type</dt>
              <dd><span className="badge-pr">{f.pr_type || 'Copay'}</span></dd>
            </div>
            <div>
              <dt>STATUS</dt>
              <dd>{f.status || 'Active'}</dd>
            </div>
            <div>
              <dt>Remarks</dt>
              <dd>{f.us24_notes || '—'}</dd>
            </div>
            <div>
              <dt>Statement PDF</dt>
              <dd><IconDocument size={14} /> {draft.fileName} <span className="form-hint">({fileSize(draft.sizeBytes)})</span></dd>
            </div>
          </dl>
        </div>
        <p className="publish-notice">Once published, {draft.clinic.name}'s clinic staff will immediately see this patient record in their 17-column ledger.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={backToEdit} disabled={busy}>Back to edit</button>
          <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Confirm and publish'}</button>
        </div>
      </div>
    );
  }

  // --- S2: Form Input View ----------------------------------------------------
  return (
    <div className="container page-narrow" style={{ maxWidth: '860px' }}>
      <BackBar to="/dashboard" label="Back to dashboard" trail={['Dashboard', 'Patient statement entry']} />
      <PageHeader
        title="Patient Statement Entry"
        subtitle="Record or upload a patient electronic statement with multi-cycle balance tracking."
      />

      {clinics?.length === 0 && (
        <Alert tone="info">You haven't been assigned to any active clinics yet. Contact your administrator.</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <form onSubmit={continueToConfirm} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Section 1: Clinic & Patient Identification */}
        <section className="panel form-panel">
          <div className="form-section-title">
            <h3>Clinic & Patient</h3>
            <p className="form-hint">Select destination clinic and patient information.</p>
          </div>
          <div className="form-row-3">
            <Field label="Clinic" error={errors.clinicId} required hint="Select which clinic this record belongs to">
              {(p) => (
                <select {...p} className="form-select" value={clinicId} onChange={handleClinicChange}>
                  <option value="">Choose a clinic…</option>
                  {clinics?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="location" error={errors.location_name} hint="Facility, branch, or practice location">
              {(p) => (
                <input
                  {...p}
                  type="text"
                  className="form-input"
                  placeholder="e.g. Main Clinic, Suite 100"
                  value={values.location_name}
                  onChange={(e) => setValue('location_name', e.target.value)}
                />
              )}
            </Field>

            <Field label="patient" error={errors.patient_name} required hint="Patient full name (e.g. Smith, John)">
              {(p) => (
                <input
                  {...p}
                  type="text"
                  className="form-input"
                  placeholder="Enter patient full name"
                  value={values.patient_name}
                  onChange={(e) => setValue('patient_name', e.target.value)}
                />
              )}
            </Field>
          </div>
        </section>

        {/* Section 2: 1st Electronic Statement Cycle */}
        <section className="panel form-panel cycle-card cycle-card-1">
          <span className="cycle-badge">Cycle 1</span>
          <div className="form-section-title">
            <h3>1st Electronic Statement Cycle</h3>
            <p className="form-hint">Initial statement date, balance due amount, and payment received.</p>
          </div>
          <div className="form-row-3">
            <Field label="1st electronic statement" error={errors.cycle1_date} required hint="Sent date (MM/DD/YYYY)">
              {(p) => (
                <input
                  {...p}
                  type="date"
                  className="form-input"
                  value={values.cycle1_date}
                  onChange={(e) => setValue('cycle1_date', e.target.value)}
                />
              )}
            </Field>

            <Field label="BALANCE DUE AMOUNT AS ON 1ST ELECTRONIC STATEMENT" error={errors.cycle1_balance} hint="Amount due in 1st cycle">
              {(p) => (
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    placeholder="0.00"
                    value={values.cycle1_balance}
                    onChange={(e) => setValue('cycle1_balance', e.target.value)}
                  />
                </div>
              )}
            </Field>

            <Field label="PAYMENT RECEIVED" error={errors.cycle1_payment} hint="Payment received for 1st cycle">
              {(p) => (
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    placeholder="0.00"
                    value={values.cycle1_payment}
                    onChange={(e) => setValue('cycle1_payment', e.target.value)}
                  />
                </div>
              )}
            </Field>
          </div>
        </section>

        {/* Section 3: 2nd Electronic Statement Cycle */}
        <section className="panel form-panel cycle-card cycle-card-2">
          <span className="cycle-badge">Cycle 2</span>
          <div className="form-section-title">
            <h3>2nd Electronic Statement Cycle</h3>
            <p className="form-hint">Second statement sent date, balance due, and payment received.</p>
          </div>
          <div className="form-row-3">
            <Field label="2ND ELECTRONIC STATEMENT SENT DATE" error={errors.cycle2_date} hint="Second cycle sent date">
              {(p) => (
                <input
                  {...p}
                  type="date"
                  className="form-input"
                  value={values.cycle2_date}
                  onChange={(e) => setValue('cycle2_date', e.target.value)}
                />
              )}
            </Field>

            <Field label="BALANCE DUE AMOUNT AS ON 2ND ELECTRONIC STATEMENT" error={errors.cycle2_balance} hint="Amount due in 2nd cycle">
              {(p) => (
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    placeholder="0.00"
                    value={values.cycle2_balance}
                    onChange={(e) => setValue('cycle2_balance', e.target.value)}
                  />
                </div>
              )}
            </Field>

            <Field label="PAYMENT RECEIVED" error={errors.cycle2_payment} hint="Payment received for 2nd cycle">
              {(p) => (
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    placeholder="0.00"
                    value={values.cycle2_payment}
                    onChange={(e) => setValue('cycle2_payment', e.target.value)}
                  />
                </div>
              )}
            </Field>
          </div>
        </section>

        {/* Section 4: 3rd Electronic Statement Cycle */}
        <section className="panel form-panel cycle-card cycle-card-3">
          <span className="cycle-badge">Cycle 3</span>
          <div className="form-section-title">
            <h3>3rd Electronic Statement Cycle</h3>
            <p className="form-hint">Third statement sent date, balance due, and payment received.</p>
          </div>
          <div className="form-row-3">
            <Field label="3RD ELECTRONIC STATEMENT SENT DATE" error={errors.cycle3_date} hint="Third cycle sent date">
              {(p) => (
                <input
                  {...p}
                  type="date"
                  className="form-input"
                  value={values.cycle3_date}
                  onChange={(e) => setValue('cycle3_date', e.target.value)}
                />
              )}
            </Field>

            <Field label="BALANCE DUE AMOUNT AS ON 3RD ELECTRONIC STATEMENT" error={errors.cycle3_balance} hint="Amount due in 3rd cycle">
              {(p) => (
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    placeholder="0.00"
                    value={values.cycle3_balance}
                    onChange={(e) => setValue('cycle3_balance', e.target.value)}
                  />
                </div>
              )}
            </Field>

            <Field label="PAYMENT RECEIVED" error={errors.cycle3_payment} hint="Payment received for 3rd cycle">
              {(p) => (
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    placeholder="0.00"
                    value={values.cycle3_payment}
                    onChange={(e) => setValue('cycle3_payment', e.target.value)}
                  />
                </div>
              )}
            </Field>
          </div>
        </section>

        {/* Section 5: Current Balance, PR Type, Status & Remarks */}
        <section className="panel form-panel">
          <div className="form-section-title">
            <h3>Outstanding Balance & Classification</h3>
            <p className="form-hint">Current balance, patient responsibility type, status, and remarks.</p>
          </div>
          <div className="form-row-3">
            <Field label="CURRENT OUTSTANDING BALANCE" error={errors.current_balance} hint="Total balance remaining">
              {(p) => (
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    {...p}
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    style={{ fontWeight: '600', color: 'var(--color-primary)' }}
                    placeholder="0.00"
                    value={values.current_balance}
                    onChange={(e) => setValue('current_balance', e.target.value)}
                  />
                </div>
              )}
            </Field>

            <Field label="PR TYPE" error={errors.pr_type} hint="Responsibility category">
              {(p) => (
                <select
                  {...p}
                  className="form-select"
                  value={values.pr_type}
                  onChange={(e) => setValue('pr_type', e.target.value)}
                >
                  <option value="Copay">Copay</option>
                  <option value="Coinsurance">Coinsurance</option>
                  <option value="Deductible">Deductible</option>
                  <option value="Self-Pay">Self-Pay</option>
                  <option value="Out of Pocket">Out of Pocket</option>
                </select>
              )}
            </Field>

            <Field label="STATUS" error={errors.status} hint="Ledger statement status">
              {(p) => (
                <select
                  {...p}
                  className="form-select"
                  value={values.status}
                  onChange={(e) => setValue('status', e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Paid">Paid</option>
                  <option value="Withdrawn">Withdrawn</option>
                </select>
              )}
            </Field>
          </div>

          <div className="form-row-1" style={{ marginTop: '16px' }}>
            <Field label="Remarks" error={errors.us24_notes} hint="Specialist billing notes, patient remarks, or follow-up instructions">
              {(p) => (
                <textarea
                  {...p}
                  className="form-input"
                  rows={3}
                  placeholder="Enter remarks or notes for this patient record..."
                  value={values.us24_notes}
                  onChange={(e) => setValue('us24_notes', e.target.value)}
                />
              )}
            </Field>
          </div>
        </section>

        {/* Section 6: Optional PDF Attachment */}
        <section className="panel form-panel">
          <Field
            label="Statement PDF (Optional)"
            error={errors.pdf}
            hint="Attach an official patient statement PDF if available (up to 10 MB). If not attached, a clean electronic PDF will be auto-generated."
          >
            {(p) => (
              <div
                className={`dropzone ${file ? 'has-file' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  chooseFile(e.dataTransfer.files[0]);
                }}
              >
                <input
                  {...p}
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only-input"
                  onChange={(e) => chooseFile(e.target.files[0])}
                />
                {file ? (
                  <span>
                    <IconDocument size={16} /> <strong>{file.name}</strong> <span className="form-hint">({fileSize(file.size)})</span>
                  </span>
                ) : (
                  <span>Drag and drop a PDF statement here, or</span>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInput.current.click()}
                >
                  {file ? 'Choose a different PDF' : 'Browse PDF'}
                </button>
                {file && (
                  <button
                    type="button"
                    className="btn btn-tertiary btn-sm"
                    onClick={() => setFile(null)}
                  >
                    Remove PDF
                  </button>
                )}
              </div>
            )}
          </Field>
        </section>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || clinics?.length === 0}>
            {busy ? 'Validating…' : 'Continue to review →'}
          </button>
        </div>
      </form>
      <p className="form-hint center" style={{ marginTop: '16px' }}>
        <Link to="/imports/new">Publishing an entire clinic batch? Use Import spreadsheet instead.</Link>
      </p>
    </div>
  );
}
