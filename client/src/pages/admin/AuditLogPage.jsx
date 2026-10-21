import { useEffect, useState } from 'react';
import { IconDownload } from '../../components/Icons.jsx';
import { Alert, BackBar, EmptyState, PageHeader, Pagination, Spinner } from '../../components/ui.jsx';
import { api, downloadFile } from '../../lib/api.js';
import { ROLE_LABELS, dateTime } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';

const GROUPS = [
  ['', 'All actions'], ['auth', 'Sign-in events'], ['statement', 'Statements'], ['import', 'Imports'],
  ['remark', 'Remarks'], ['user', 'Users'], ['clinic', 'Clinics'], ['assignment', 'Assignments'], ['access', 'Blocked access'],
];

// M8 – Audit log (F13). Read-only: there are no edit or delete controls (FR-13.4).
export function AuditLogPage() {
  const toast = useToast();
  const [options, setOptions] = useState({ actions: [], users: [], clinics: [] });
  const [filters, setFilters] = useState({ userId: '', clinicId: '', action: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api('/admin/audit/options').then(setOptions).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    api(`/admin/audit?${new URLSearchParams({ ...filters, page: String(page) })}`)
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message));
  }, [filters, page]);

  const set = (k) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile(`/admin/audit/export.csv?${new URLSearchParams(filters)}`, 'audit-log.csv');
      toast('Audit log exported.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container">
      <BackBar to="/admin" label="Back to admin home" trail={['Admin', 'Audit log']} />
      <PageHeader title="Audit log" subtitle="Every sign-in, view, upload, import, download, print, remark and access change. Times shown in your time zone.">
        <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={exporting}>
          <IconDownload /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </PageHeader>
      <div className="filter-bar-sheet">
        <div className="filter-grid filter-grid-5">
          <div className="filter-item">
            <label htmlFor="a-user">User</label>
            <select id="a-user" className="form-select" value={filters.userId} onChange={set('userId')}>
              <option value="">All users</option>
              {options.users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="a-clinic">Clinic</label>
            <select id="a-clinic" className="form-select" value={filters.clinicId} onChange={set('clinicId')}>
              <option value="">All clinics</option>
              {options.clinics.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="a-action">Action</label>
            <select id="a-action" className="form-select" value={filters.action} onChange={set('action')}>
              {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              <optgroup label="Specific action">
                {options.actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="a-from">From</label>
            <input id="a-from" type="date" className="form-input" value={filters.from} onChange={set('from')} />
          </div>
          <div className="filter-item">
            <label htmlFor="a-to">To</label>
            <input id="a-to" type="date" className="form-input" value={filters.to} onChange={set('to')} />
          </div>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="table-sheet-card">
        {!data ? <Spinner /> : data.events.length === 0 ? <EmptyState title="No audit events match these filters" /> : (
          <>
            <div className="table-responsive table-always">
              <table className="statements-table compact audit-table">
                <thead>
                  <tr>
                    <th scope="col">Date and time</th><th scope="col">User</th><th scope="col">Role</th><th scope="col">Clinic</th>
                    <th scope="col">Action</th><th scope="col">Target</th><th scope="col">IP address</th><th scope="col">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id} className="row-static">
                      <td className="col-date">{dateTime(e.occurredAt)}</td>
                      <td>{e.actorName ?? <span className="muted-inline">{e.actorEmail ?? 'Unknown'}</span>}</td>
                      <td>{e.actorRole ? ROLE_LABELS[e.actorRole] : '—'}</td>
                      <td>{e.clinicName ?? '—'}</td>
                      <td className="col-mono">{e.action}</td>
                      <td className="col-mono">{e.targetType ? `${e.targetType} ${String(e.targetId ?? '').slice(0, 8)}` : '—'}</td>
                      <td className="col-mono">{e.ip ?? '—'}</td>
                      <td><span className={`badge badge-status badge-${e.outcome === 'success' ? 'success' : e.outcome === 'blocked' ? 'danger' : 'warning'}`}>{e.outcome}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} noun="events" onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
