import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconSearch, IconTable, IconUpload } from '../../components/Icons.jsx';
import { Alert, BackBar, EmptyState, PageHeader, Pagination, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, money, shortDate } from '../../lib/format.js';
import { NotFoundPage } from '../NotFoundPage.jsx';

function Highlight({ text, query }) {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="search-highlight">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

// P1 – Statement list (F9)
export function StatementListPage() {
  const { user } = useAuth();
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isStaff = user.role !== 'clinic_user';

  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? 'date_desc';
  const status = params.get('status') ?? 'active';
  const page = Number(params.get('page') ?? 1);

  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === null || (k === 'page' && v === 1) || (k === 'sort' && v === 'date_desc') || (k === 'status' && v === 'active')) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced search box.
  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const query = new URLSearchParams({ q, from, to, sort, page: String(page) });
    if (isStaff) {
      query.set('clinicId', clinicId);
      query.set('status', status);
    }
    api(`/statements?${query}`)
      .then((d) => { if (!ignore) { setData(d); setError(null); } })
      .catch((err) => { if (!ignore) setError(err); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [q, from, to, sort, page, status, clinicId, isStaff]);

  if (error?.status === 404) return <NotFoundPage />;

  const filtered = q || from || to || (isStaff && status !== 'active');
  const clearFilters = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };
  const open = (id) => navigate(`/statements/${id}`, { state: { from: `${window.location.pathname}${window.location.search}` } });
  const back = user.role === 'specialist' ? { to: '/dashboard', label: 'Back to dashboard' }
    : user.role === 'admin' ? { to: `/manage/clinics/${clinicId}`, label: 'Back to clinic' }
      : { to: '/home', label: 'Back to home' };

  return (
    <div className="container">
      <BackBar {...back} trail={isStaff ? [data?.clinic.name ?? 'Clinic', 'Statements'] : ['Home', 'Patient statements']} />
      <PageHeader
        title="Patient statements"
        subtitle={data ? `${data.clinic.name} (${data.clinic.code})${isStaff ? '' : ' · Managed by US24 Solutions'}` : ' '}
      >
        {user.role === 'specialist' && data?.clinic.isActive && (
          <>
            <Link to={`/statements/upload?clinicId=${clinicId}`} className="btn btn-secondary btn-sm"><IconUpload size={14} /> Upload</Link>
            <Link to={`/imports/new?clinicId=${clinicId}`} className="btn btn-primary btn-sm"><IconTable size={14} /> Import</Link>
          </>
        )}
      </PageHeader>
      {isStaff && data && !data.clinic.isActive && <Alert tone="warning">This clinic is inactive. Its users can't sign in and nothing new can be published.</Alert>}

      <div className="filter-bar-sheet">
        <div className={`filter-grid ${isStaff ? 'filter-grid-staff' : ''}`}>
          <div className="filter-item">
            <label htmlFor="f-search">Search patient or account</label>
            <div className="input-with-icon">
              <IconSearch className="input-icon" />
              <input id="f-search" type="search" className="form-input" placeholder="Name or account number" autoComplete="off"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="filter-item">
            <label htmlFor="f-from">From date</label>
            <input id="f-from" type="date" className="form-input" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div className="filter-item">
            <label htmlFor="f-to">To date</label>
            <input id="f-to" type="date" className="form-input" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </div>
          <div className="filter-item">
            <label htmlFor="f-sort">Sort by</label>
            <select id="f-sort" className="form-select" value={sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="date_desc">Statement date (newest first)</option>
              <option value="date_asc">Statement date (oldest first)</option>
              <option value="name_asc">Patient name (A–Z)</option>
              <option value="balance_desc">Balance due (high–low)</option>
              <option value="balance_asc">Balance due (low–high)</option>
            </select>
          </div>
          {isStaff && (
            <div className="filter-item">
              <label htmlFor="f-status">Status</label>
              <select id="f-status" className="form-select" value={status} onChange={(e) => update({ status: e.target.value })}>
                <option value="active">Active</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="all">All</option>
              </select>
            </div>
          )}
          <div className="filter-item">
            <button type="button" className="btn btn-secondary btn-block" onClick={clearFilters} disabled={!filtered}>Clear filters</button>
          </div>
        </div>
      </div>

      {error && error.status !== 404 && <Alert tone="error">{error.message}</Alert>}

      <div className="results-meta-bar">
        <div>
          <span className="results-count-bold">{data?.total ?? 0}</span> statement{data?.total === 1 ? '' : 's'}
          {filtered && <span className="muted-inline"> (filtered)</span>}
        </div>
        <div className="legend"><span className="badge badge-new">New</span> = not yet opened by the clinic</div>
      </div>

      <div className="table-sheet-card" aria-busy={loading}>
        {loading && !data ? (
          <Spinner label="Loading statements…" />
        ) : data.items.length === 0 ? (
          filtered ? (
            <EmptyState title="No statements match your search" action={<button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>}>
              Try a different name, account number or date range.
            </EmptyState>
          ) : (
            <EmptyState title={isStaff ? 'No statements for this clinic yet' : 'No statements have been shared with your clinic yet'} />
          )
        ) : (
          <>
            <div className="table-responsive">
              <table className="statements-table">
                <caption className="sr-only">Patient statements, {data.total} results</caption>
                <thead>
                  <tr>
                    <th scope="col">Patient name</th>
                    <th scope="col">Account number</th>
                    <th scope="col">Statement date</th>
                    <th scope="col" className="text-right">Balance due</th>
                    <th scope="col">Last remark</th>
                    <th scope="col"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id} onClick={() => open(s.id)} className={s.status === 'withdrawn' ? 'row-withdrawn' : undefined}>
                      <td>
                        <div className="col-patient">
                          <Highlight text={s.patientName} query={q} />
                          {s.isNew && <span className="badge badge-new">New</span>}
                          {s.status === 'withdrawn' && <StatusBadge status="withdrawn" />}
                          {s.hasNewerVersion && <span className="badge badge-muted">Earlier version</span>}
                          {s.version > 1 && <span className="badge badge-info">v{s.version}</span>}
                          {s.awaitingReply && <span className="badge badge-plum">Awaiting reply</span>}
                        </div>
                      </td>
                      <td className="col-mono"><Highlight text={s.accountNumber} query={q} /></td>
                      <td className="col-date">{date(s.statementDate)}</td>
                      <td className="col-amount">{money(s.balanceDue)}</td>
                      <td className="col-date">{s.lastRemarkAt ? shortDate(s.lastRemarkAt) : 'None'}</td>
                      <td className="text-right">
                        <Link to={`/statements/${s.id}`} className="btn btn-secondary btn-sm" onClick={(e) => e.stopPropagation()}
                          state={{ from: `${window.location.pathname}${window.location.search}` }}
                          aria-label={`Open statement for ${s.patientName}, ${date(s.statementDate)}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mobile-statements-list">
              {data.items.map((s) => (
                <li key={s.id}>
                  <Link to={`/statements/${s.id}`} className="mobile-statement-card" state={{ from: `${window.location.pathname}${window.location.search}` }}>
                    <div className="mobile-card-top">
                      <span className="mobile-patient-name"><Highlight text={s.patientName} query={q} /></span>
                      <span className="mobile-badges">
                        {s.isNew && <span className="badge badge-new">New</span>}
                        {s.status === 'withdrawn' && <StatusBadge status="withdrawn" />}
                        {s.hasNewerVersion && <span className="badge badge-muted">Earlier version</span>}
                        {s.version > 1 && <span className="badge badge-info">v{s.version}</span>}
                        {s.awaitingReply && <span className="badge badge-plum">Awaiting reply</span>}
                      </span>
                    </div>
                    <div className="mobile-card-mid">
                      <span className="col-mono">{s.accountNumber}</span>
                      <span>{date(s.statementDate)}</span>
                    </div>
                    <div className="mobile-card-bottom">
                      <span className="form-hint">Balance due</span>
                      <span className="mobile-balance-due">{money(s.balanceDue)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize}
              onPage={(p) => update({ page: p })} />
          </>
        )}
      </div>
    </div>
  );
}
