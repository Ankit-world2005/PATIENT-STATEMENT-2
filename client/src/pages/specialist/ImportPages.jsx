import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconDownload, IconTable } from '../../components/Icons.jsx';
import { Alert, BackBar, ConfirmDialog, Field, PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api, downloadFile } from '../../lib/api.js';
import { date, dateTime, fileSize, money, shortDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';

const MAX_BYTES = 10 * 1024 * 1024;

export function useDownload() {
  const toast = useToast();
  return async (path, name) => {
    try {
      await downloadFile(path, name);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

export function TemplateLinks() {
  const download = useDownload();
  return (
    <div className="template-box">
      <div>
        <strong>Import template</strong>
        <p className="form-hint">
          Required columns: patient_name, account_number, statement_date, balance_due. Optional: patient_dob, service dates,
          cpt_codes, amounts and insurance_name. Dates as YYYY-MM-DD or MM/DD/YYYY.
        </p>
      </div>
      <div className="template-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('/imports/template.xlsx', 'statement-import-template.xlsx')}>
          <IconDownload size={14} /> Excel template
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => download('/imports/template.csv', 'statement-import-template.csv')}>
          <IconDownload size={14} /> CSV template
        </button>
      </div>
    </div>
  );
}

// --- S4: choose clinic and file (FR-7.1, 7.2) -----------------------------------
export function ImportNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clinics, setClinics] = useState(null);
  const [clinicId, setClinicId] = useState(params.get('clinicId') ?? '');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileInput = useRef(null);

  useEffect(() => {
    api('/publishable-clinics')
      .then((d) => {
        setClinics(d.clinics);
        if (d.clinics.length === 1) setClinicId(d.clinics[0].id);
        else if (!d.clinics.some((c) => c.id === params.get('clinicId'))) setClinicId('');
      })
      .catch((err) => setFailure(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const check = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!clinicId) fe.clinicId = 'Choose the clinic.';
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
      setErrors(err.fieldErrors);
      setFailure(err.status === 0 ? "The check didn't finish. Try again." : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!clinics && !failure) return <div className="container"><Spinner /></div>;
  const clinicName = clinics?.find((c) => c.id === clinicId)?.name;

  return (
    <div className="container page-narrow">
      <BackBar to="/dashboard" label="Back to dashboard" trail={['Dashboard', 'Import statements']} />
      <PageHeader title="Import statements" subtitle="Publish a full statement cycle for one clinic from a spreadsheet." />
      {clinics?.length === 0 && <Alert tone="info">You haven't been assigned to any active clinics yet. Contact your administrator.</Alert>}

      <form className="panel form-panel" onSubmit={check} noValidate>
        <ol className="steps" aria-label="Import steps">
          <li className="current">Choose clinic and file</li>
          <li>Review preview</li>
          <li>Publish</li>
        </ol>

        <Field label="Clinic" error={errors.clinicId} required hint="One clinic per file.">
          {(p) => (
            <select {...p} className="form-select" value={clinicId} onChange={(e) => setClinicId(e.target.value)} disabled={busy}>
              <option value="">Choose a clinic…</option>
              {clinics?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          )}
        </Field>

        <Field label="Spreadsheet" error={errors.file} required hint="Excel (.xlsx) or CSV. Up to 5,000 rows and 10 MB.">
          {(p) => (
            <div className={`dropzone ${file ? 'has-file' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (!busy) chooseFile(e.dataTransfer.files[0]); }}>
              <input {...p} ref={fileInput} type="file" className="sr-only-input" disabled={busy}
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => chooseFile(e.target.files[0])} />
              {file ? (
                <span><IconTable size={16} /> <strong>{file.name}</strong> <span className="form-hint">({fileSize(file.size)})</span></span>
              ) : (
                <span>Drag a spreadsheet here, or</span>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current.click()} disabled={busy}>
                {file ? 'Choose a different file' : 'Choose file'}
              </button>
            </div>
          )}
        </Field>

        <TemplateLinks />

        {failure && (
          <Alert tone="error" title="This file can't be imported">
            {failure} Nothing was published. Fix the file and check it again.
          </Alert>
        )}
        {busy && (
          <div className="checking-banner" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Checking your file{clinicName ? ` for ${clinicName}` : ''}… this can take up to 2 minutes.{elapsed >= 20 ? ` (${elapsed}s)` : ''}</span>
          </div>
        )}

        <div className="form-actions">
          <Link to="/dashboard" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={busy || clinics?.length === 0}>
            {busy ? 'Checking…' : 'Check file'}
          </button>
        </div>
      </form>
      <p className="form-hint center">Nothing is published until you review the preview and confirm.</p>
    </div>
  );
}

function StatTile({ label, value, tone }) {
  return (
    <div className={`stat-tile ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-value">{value?.toLocaleString('en-US') ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// --- S5: preview (FR-7.3-7.5) ----------------------------------------------------
export function ImportPreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const download = useDownload();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => api(`/imports/${id}`).then(setData).catch(setError), [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error?.status === 404) return <NotFoundPage />;
  if (error) return <div className="container"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <div className="container"><Spinner label="Loading preview…" /></div>;
  if (data.batch.status !== 'previewed') return <Navigate to={`/imports/${id}`} replace />;

  const { batch, invalidRows, duplicates, sampleRows } = data;
  const t = batch.totals;
  const undecided = duplicates.filter((d) => !d.decision).length;
  const newVersions = duplicates.filter((d) => d.decision === 'new_version').length;
  const toPublish = t.valid + newVersions;
  const ignored = location.state?.ignoredColumns ?? [];

  const decide = async (decision, rowNumbers) => {
    setActionError('');
    try {
      await api(`/imports/${id}/duplicates`, { method: 'PATCH', body: { decision, rowNumbers } });
      setData((d) => ({
        ...d,
        duplicates: d.duplicates.map((x) => (!rowNumbers || rowNumbers.includes(x.rowNumber) ? { ...x, decision } : x)),
      }));
    } catch (err) {
      setActionError(err.message);
      if (err.status === 409) load();
    }
  };

  const publish = async () => {
    setBusy(true);
    setActionError('');
    try {
      await api(`/imports/${id}/publish`, { method: 'POST' });
      navigate(`/imports/${id}`, { replace: true, state: { justPublished: true } });
    } catch (err) {
      setConfirming(false);
      setActionError(err.message);
      setBusy(false);
      if (err.status === 409) load();
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/imports/${id}/cancel`, { method: 'POST' });
      toast('Import cancelled. Nothing was published.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setActionError(err.message);
      setBusy(false);
      setCancelling(false);
    }
  };

  return (
    <div className="container">
      <BackBar to="/dashboard" label="Back to dashboard" trail={['Import statements', 'Preview']} />
      <ol className="steps steps-page" aria-label="Import steps">
        <li className="done">Choose clinic and file</li>
        <li className="current">Review preview</li>
        <li>Publish</li>
      </ol>

      <div className="destination-plate" role="region" aria-label="Destination clinic">
        <span className="destination-label">Importing to</span>
        <span className="destination-name">{batch.clinic.name}</span>
        <span className="user-clinic-badge">{batch.clinic.code}</span>
        <span className="destination-file"><IconTable size={14} /> {batch.originalFilename}</span>
      </div>

      <div className="stat-tiles">
        <StatTile label="Rows in file" value={t.total} />
        <StatTile label="Ready to publish" value={t.valid} tone="success" />
        <StatTile label="Invalid rows" value={t.invalid} tone={t.invalid ? 'danger' : undefined} />
        <StatTile label="Possible duplicates" value={t.duplicate} tone={t.duplicate ? 'warning' : undefined} />
      </div>

      {ignored.length > 0 && (
        <Alert tone="info">These columns aren't used and were ignored: {ignored.join(', ')}.</Alert>
      )}
      {actionError && <Alert tone="error">{actionError}</Alert>}

      {invalidRows.length > 0 && (
        <section className="panel" aria-labelledby="invalid-heading">
          <div className="panel-header">
            <h2 id="invalid-heading">Invalid rows <span className="badge badge-danger">{t.invalid}</span></h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(`/imports/${id}/error-report`, 'import-errors.csv')}>
              <IconDownload size={14} /> Download error report
            </button>
          </div>
          <p className="panel-intro">These rows won't be published. Fix them in your file and import them again later.</p>
          <div className="table-responsive table-always">
            <table className="statements-table compact">
              <thead>
                <tr><th scope="col">Row</th><th scope="col">Patient</th><th scope="col">Account</th><th scope="col">Problem</th></tr>
              </thead>
              <tbody>
                {invalidRows.map((r) => (
                  <tr key={r.rowNumber} className="row-static">
                    <td className="col-mono">{r.rowNumber}</td>
                    <td>{r.data.patient_name || <span className="muted-inline">(blank)</span>}</td>
                    <td className="col-mono">{r.data.account_number || '—'}</td>
                    <td>
                      <ul className="error-list">
                        {r.errors.map((e) => <li key={e.field + e.message}>{e.message}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.invalid > invalidRows.length && <p className="form-hint">Showing the first {invalidRows.length}. The error report lists all {t.invalid}.</p>}
        </section>
      )}

      {duplicates.length > 0 && (
        <section className="panel" aria-labelledby="dup-heading">
          <div className="panel-header">
            <h2 id="dup-heading">Possible duplicates <span className="badge badge-warning">{duplicates.length}</span></h2>
            <div className="btn-group">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide('skip')}>Skip all</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => decide('new_version')}>Publish all as new versions</button>
            </div>
          </div>
          <p className="panel-intro">
            These rows match a statement this clinic already has (same account number and statement date). Choose what to do with each.
          </p>
          <div className="table-responsive table-always">
            <table className="statements-table compact">
              <thead>
                <tr>
                  <th scope="col">Row</th><th scope="col">Patient</th><th scope="col">Account</th><th scope="col">Statement date</th>
                  <th scope="col" className="text-right">New balance</th><th scope="col" className="text-right">Existing</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((d) => (
                  <tr key={d.rowNumber} className={`row-static ${d.decision ? '' : 'row-attention'}`}>
                    <td className="col-mono">{d.rowNumber}</td>
                    <td>{d.data.patient_name}</td>
                    <td className="col-mono">{d.data.account_number}</td>
                    <td className="col-date">{date(d.data.statement_date)}</td>
                    <td className="col-amount">{money(d.data.balance_due)}</td>
                    <td className="col-amount">
                      <Link to={`/statements/${d.existing.id}`} target="_blank" rel="noopener">{money(d.existing.balanceDue)}</Link>
                      <div className="form-hint">v{d.existing.version} · {shortDate(d.existing.uploadedAt)}</div>
                    </td>
                    <td>
                      <fieldset className="segmented segmented-sm">
                        <legend className="sr-only">Decision for row {d.rowNumber}</legend>
                        {[['skip', 'Skip'], ['new_version', 'New version']].map(([value, label]) => (
                          <label key={value} className={`segmented-option ${d.decision === value ? 'selected' : ''}`}>
                            <input type="radio" name={`dup-${d.rowNumber}`} value={value} checked={d.decision === value}
                              onChange={() => decide(value, [d.rowNumber])} />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sampleRows.length > 0 && (
        <section className="panel" aria-labelledby="sample-heading">
          <div className="panel-header">
            <h2 id="sample-heading">Ready to publish</h2>
            <span className="form-hint">{sampleRows.length < t.valid ? `First ${sampleRows.length} of ${t.valid}` : `${t.valid} rows`}</span>
          </div>
          <div className="table-responsive table-always">
            <table className="statements-table compact">
              <thead>
                <tr>
                  <th scope="col">Row</th><th scope="col">Patient</th><th scope="col">Account</th><th scope="col">Statement date</th>
                  <th scope="col" className="text-right">Balance due</th><th scope="col">Insurance</th>
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((r) => (
                  <tr key={r.rowNumber} className="row-static">
                    <td className="col-mono">{r.rowNumber}</td>
                    <td>{r.data.patient_name}</td>
                    <td className="col-mono">{r.data.account_number}</td>
                    <td className="col-date">{date(r.data.statement_date)}</td>
                    <td className="col-amount">{money(r.data.balance_due)}</td>
                    <td>{r.data.insurance_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="publish-bar">
        <div>
          {toPublish === 0 ? (
            <strong>No rows can be published. Fix the file and try again.</strong>
          ) : undecided > 0 ? (
            <strong>Choose Skip or New version for {undecided} possible duplicate{undecided === 1 ? '' : 's'} to continue.</strong>
          ) : (
            <span><strong>{toPublish.toLocaleString('en-US')}</strong> statement{toPublish === 1 ? '' : 's'} will be published to <strong>{batch.clinic.name}</strong>.</span>
          )}
          <div className="form-hint">Preview expires {dateTime(batch.previewExpiresAt)}.</div>
        </div>
        <div className="btn-group">
          {toPublish === 0 ? (
            <Link to="/imports/new" className="btn btn-secondary">Back</Link>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => setCancelling(true)} disabled={busy}>Cancel import</button>
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)} disabled={busy || toPublish === 0 || undecided > 0}>
            Publish valid rows
          </button>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Publish to ${batch.clinic.name}?`}
          message={`${toPublish.toLocaleString('en-US')} statement${toPublish === 1 ? '' : 's'} will become visible to ${batch.clinic.name}'s users immediately and marked New.`}
          confirmLabel="Publish"
          busy={busy}
          onConfirm={publish}
          onCancel={() => setConfirming(false)}
        />
      )}
      {cancelling && (
        <ConfirmDialog
          title="Cancel this import?"
          message="Nothing will be published. You can check the file again later."
          confirmLabel="Cancel import"
          destructive
          busy={busy}
          onConfirm={cancel}
          onCancel={() => setCancelling(false)}
        />
      )}
    </div>
  );
}

// --- S6: result summary (FR-7.6) ----------------------------------------------------
export function ImportResultPage() {
  const { id } = useParams();
  const location = useLocation();
  const download = useDownload();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/imports/${id}`).then(setData).catch(setError);
  }, [id]);

  if (error?.status === 404) return <NotFoundPage />;
  if (error) return <div className="container"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <div className="container"><Spinner /></div>;
  if (data.batch.status === 'previewed') return <Navigate to={`/imports/${id}/preview`} replace />;

  const b = data.batch;
  const t = b.totals;
  const done = ['published', 'partially_imported'].includes(b.status);
  const created = (t.published ?? 0) + (t.newVersions ?? 0);

  return (
    <div className="container page-narrow">
      <BackBar to="/dashboard" label="Back to dashboard" trail={['Import statements', 'Result']} />
      {done && <ol className="steps steps-page" aria-label="Import steps"><li className="done">Choose clinic and file</li><li className="done">Review preview</li><li className="done current">Publish</li></ol>}
      {location.state?.justPublished && done && (
        <Alert tone="success" title={`${created.toLocaleString('en-US')} statement${created === 1 ? '' : 's'} published to ${b.clinic.name}.`}>
          Clinic users can see them now, marked New.
        </Alert>
      )}

      <PageHeader title="Import result" subtitle={b.originalFilename}>
        <StatusBadge status={b.status} />
      </PageHeader>

      <div className="panel">
        <dl className="summary-list">
          <div><dt>Clinic</dt><dd>{b.clinic.name} <span className="user-clinic-badge">{b.clinic.code}</span></dd></div>
          <div><dt>File</dt><dd>{b.originalFilename} <span className="form-hint">({b.fileFormat.toUpperCase()})</span></dd></div>
          <div><dt>Checked</dt><dd>{dateTime(b.createdAt)} by {b.specialistName}</dd></div>
          {b.publishedAt && <div><dt>Published</dt><dd>{dateTime(b.publishedAt)}</dd></div>}
          {b.cancelledAt && <div><dt>Cancelled</dt><dd>{dateTime(b.cancelledAt)}</dd></div>}
        </dl>
      </div>

      {b.status === 'failed' && (
        <Alert tone="error" title="This file couldn't be imported">{b.failureReason} Nothing was published.</Alert>
      )}
      {b.status === 'cancelled' && <Alert tone="info">This import was cancelled or its preview expired. Nothing was published.</Alert>}

      {done && (
        <>
          <div className="stat-tiles">
            <StatTile label="Published" value={t.published} tone="success" />
            <StatTile label="Published as new versions" value={t.newVersions} />
            <StatTile label="Skipped duplicates" value={t.skipped} tone={t.skipped ? 'warning' : undefined} />
            <StatTile label="Failed rows" value={t.invalid} tone={t.invalid ? 'danger' : undefined} />
          </div>
          {b.hasErrorReport ? (
            <div className="panel panel-inline">
              <span>The error report lists every failed or skipped row with its reason.</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(`/imports/${id}/error-report`, 'import-errors.csv')}>
                <IconDownload size={14} /> Download error report
              </button>
            </div>
          ) : (
            <Alert tone="success">All rows published.</Alert>
          )}
        </>
      )}

      <div className="form-actions">
        <Link to="/dashboard" className="btn btn-secondary">Back to dashboard</Link>
        <Link to="/imports/new" className="btn btn-secondary">Import another file</Link>
        <Link to={`/clinics/${b.clinic.id}/statements`} className="btn btn-primary">View clinic statements</Link>
      </div>
    </div>
  );
}
