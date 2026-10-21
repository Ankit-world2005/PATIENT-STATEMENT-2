import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconDownload, IconTable, IconUpload } from '../../components/Icons.jsx';
import { Alert, EmptyState, Field, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { fileSize, shortDate } from '../../lib/format.js';
import { TemplateLinks, useDownload } from './ImportPages.jsx';

const MAX_BYTES = 10 * 1024 * 1024;

export function ImportTabContent({ clinics: initialClinics, recentImports = [] }) {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState(initialClinics?.filter((c) => c.isActive) || null);
  const [clinicId, setClinicId] = useState('');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInput = useRef(null);

  // If clinics were not provided or need fresh publishable list
  useEffect(() => {
    if (!clinics) {
      api('/publishable-clinics')
        .then((d) => {
          setClinics(d.clinics);
          if (d.clinics.length === 1) setClinicId(d.clinics[0].id);
        })
        .catch((err) => setFailure(err.message));
    } else if (clinics.length === 1 && !clinicId) {
      setClinicId(clinics[0].id);
    }
  }, [clinics, clinicId]);

  useEffect(() => {
    if (!busy) return undefined;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const chooseFile = (f) => {
    setFailure('');
    setErrors((e) => ({ ...e, file: undefined }));
    if (!f) return setFile(null);
    if (!/\.(xlsx|csv)$/i.test(f.name)) {
      setErrors((e) => ({ ...e, file: 'Upload an .xlsx or .csv file.' }));
      return setFile(null);
    }
    if (f.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, file: 'The file is larger than 10 MB.' }));
      return setFile(null);
    }
    setFile(f);
  };

  const handleClear = () => {
    setFile(null);
    setErrors({});
    setFailure('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const check = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!clinicId) fe.clinicId = 'Choose a clinic.';
    if (!file) fe.file = errors.file || 'Choose an .xlsx or .csv file.';
    setErrors(fe);
    setFailure('');
    if (Object.keys(fe).length) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.set('clinicId', clinicId);
      form.set('file', file, file.name);
      const result = await api('/imports', { method: 'POST', form });
      if (result.status === 'failed') {
        setFailure(result.failureReason);
      } else {
        navigate(`/imports/${result.id}/preview`, { state: { ignoredColumns: result.ignoredColumns } });
      }
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setFailure(err.status === 0 ? "The check didn't finish. Try again." : err.message);
    } finally {
      setBusy(false);
    }
  };

  const clinicName = clinics?.find((c) => c.id === clinicId)?.name;

  return (
    <div className="dashboard-grid import-dashboard-layout">
      <div className="dashboard-main">
        {/* Import Action Form */}
        <section className="panel" aria-labelledby="import-batch-heading">
          <div className="panel-header">
            <div>
              <h2 id="import-batch-heading" className="flex-inline-gap">
                <IconTable size={20} />
                <span>Import statements from spreadsheet</span>
              </h2>
              <p className="form-hint" style={{ marginTop: '4px' }}>
                Publish a monthly or periodic statement cycle for an assigned clinic from an Excel or CSV file.
              </p>
            </div>
          </div>

          <ol className="steps" aria-label="Import steps">
            <li className="current">Choose clinic and file</li>
            <li>Review preview</li>
            <li>Publish</li>
          </ol>

          {clinics?.length === 0 && (
            <Alert tone="info">
              You haven't been assigned to any active clinics yet. Contact your administrator to assign clinics.
            </Alert>
          )}

          <form onSubmit={check} noValidate>
            <Field label="Target clinic" error={errors.clinicId} required hint="Select which clinic this statement file belongs to.">
              {(p) => (
                <select
                  {...p}
                  className="form-select"
                  value={clinicId}
                  onChange={(e) => setClinicId(e.target.value)}
                  disabled={busy || !clinics || clinics.length === 0}
                >
                  <option value="">Choose a clinic…</option>
                  {clinics?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field
              label="Spreadsheet file"
              error={errors.file}
              required
              hint="Excel (.xlsx) or CSV format. Maximum 5,000 rows and 10 MB."
            >
              {(p) => (
                <div
                  className={`dropzone ${file ? 'has-file' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (!busy) chooseFile(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    {...p}
                    ref={fileInput}
                    type="file"
                    className="sr-only-input"
                    disabled={busy}
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    onChange={(e) => chooseFile(e.target.files[0])}
                  />

                  {file ? (
                    <div className="dropzone-file-selected">
                      <div className="file-info-badge">
                        <IconTable size={20} />
                        <div>
                          <strong>{file.name}</strong>
                          <span className="form-hint" style={{ display: 'block' }}>{fileSize(file.size)}</span>
                        </div>
                      </div>
                      <div className="file-actions-row">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => fileInput.current.click()}
                          disabled={busy}
                        >
                          Change file
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleClear}
                          disabled={busy}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <IconUpload size={24} style={{ opacity: 0.6 }} />
                      <span>Drag and drop your spreadsheet here, or</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => fileInput.current.click()}
                        disabled={busy}
                      >
                        Browse file
                      </button>
                    </>
                  )}
                </div>
              )}
            </Field>

            <TemplateLinks />

            {failure && (
              <Alert tone="error" title="This file can't be imported">
                {failure} Nothing was published. Fix the file errors and check it again.
              </Alert>
            )}

            {busy && (
              <div className="checking-banner" role="status" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                <span>
                  Checking your file{clinicName ? ` for ${clinicName}` : ''}… validating schema and checking for duplicate statements.
                  {elapsed >= 10 ? ` (${elapsed}s)` : ''}
                </span>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: '20px' }}>
              {file && (
                <button type="button" className="btn btn-secondary" onClick={handleClear} disabled={busy}>
                  Clear
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !clinics || clinics.length === 0}
              >
                {busy ? 'Validating file…' : 'Check file & review preview →'}
              </button>
            </div>
          </form>
          <p className="form-hint" style={{ marginTop: '12px', textAlign: 'center' }}>
            Nothing is published to clinic staff until you review and approve the staged preview.
          </p>
        </section>

        {/* Recent Import Batches for Specialist's Clinics */}
        <section className="panel" aria-labelledby="recent-batches-heading">
          <div className="panel-header">
            <h2 id="recent-batches-heading">Recent import batches</h2>
            {recentImports.length > 0 && (
              <span className="badge badge-open">{recentImports.length} {recentImports.length === 1 ? 'batch' : 'batches'}</span>
            )}
          </div>

          {recentImports.length === 0 ? (
            <p className="panel-empty">No import batches uploaded yet. Choose a clinic and upload a file above.</p>
          ) : (
            <div className="table-responsive table-always">
              <table className="statements-table compact">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Clinic</th>
                    <th scope="col">Spreadsheet</th>
                    <th scope="col">Rows</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentImports.map((r) => {
                    const isPreviewed = r.status === 'previewed';
                    const targetLink = isPreviewed ? `/imports/${r.id}/preview` : `/imports/${r.id}`;
                    return (
                      <tr key={r.id}>
                        <td className="col-date">{shortDate(r.at)}</td>
                        <td><strong>{r.clinicName}</strong></td>
                        <td>
                          <Link to={targetLink} className="col-nowrap">
                            {r.label}
                          </Link>
                        </td>
                        <td>
                          {r.counts?.total != null ? (
                            <span>
                              {r.counts.total} rows
                              {r.status !== 'previewed' && r.status !== 'cancelled' && (
                                <span className="form-hint" style={{ display: 'block' }}>
                                  {r.counts.published} published
                                  {r.counts.failed ? ` · ${r.counts.failed} failed` : ''}
                                  {r.counts.skipped ? ` · ${r.counts.skipped} skipped` : ''}
                                </span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="text-right">
                          <Link
                            to={targetLink}
                            className={`btn btn-sm ${isPreviewed ? 'btn-primary' : 'btn-secondary'}`}
                          >
                            {isPreviewed ? 'Review preview →' : 'View report'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Sidebar: Guidelines & Columns Reference */}
      <div className="dashboard-side">
        <section className="panel" aria-labelledby="import-specs-heading">
          <div className="panel-header">
            <h2 id="import-specs-heading">File requirements</h2>
          </div>
          <dl className="import-specs-list">
            <div>
              <dt>Required columns</dt>
              <dd>
                <code className="code-pill">patient_name</code>,{' '}
                <code className="code-pill">account_number</code>,{' '}
                <code className="code-pill">statement_date</code>,{' '}
                <code className="code-pill">balance_due</code>
              </dd>
            </div>
            <div>
              <dt>Optional columns</dt>
              <dd>
                <code className="code-pill">patient_dob</code>,{' '}
                <code className="code-pill">insurance_name</code>,{' '}
                <code className="code-pill">service_date_from</code>,{' '}
                <code className="code-pill">service_date_to</code>,{' '}
                <code className="code-pill">billed_amount</code>,{' '}
                <code className="code-pill">insurance_paid</code>,{' '}
                <code className="code-pill">adjustments</code>,{' '}
                <code className="code-pill">cpt_codes</code>
              </dd>
            </div>
            <div>
              <dt>Supported file types</dt>
              <dd>Excel workbook (<code className="code-pill">.xlsx</code>) or CSV text file (<code className="code-pill">.csv</code>). Maximum 10 MB and up to 5,000 rows.</dd>
            </div>
            <div>
              <dt>Dates format</dt>
              <dd>Dates can be formatted as <code className="code-pill">YYYY-MM-DD</code> or <code className="code-pill">MM/DD/YYYY</code>.</dd>
            </div>
            <div>
              <dt>Currency / Balance</dt>
              <dd>Positive numbers indicate balance due. Negative numbers indicate patient account credits (e.g. <code className="code-pill">-25.00</code>).</dd>
            </div>
            <div>
              <dt>Duplicate statement handling</dt>
              <dd>
                Statements matching an existing account number and date are flagged during preview. You can choose whether to supersede with a new version or skip.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
