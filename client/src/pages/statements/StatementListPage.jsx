import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconChat, IconDocument, IconDownload, IconSearch, IconTable } from '../../components/Icons.jsx';
import { Alert, BackBar, EmptyState, PageHeader, Pagination, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api, downloadFile } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, money, shortDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';
import { RequestsContent } from '../requests/RequestsPage.jsx';

function Highlight({ text, query }) {
  if (!text || !query) return text || '';
  const terms = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);
  if (!terms.length) return text;

  try {
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = String(text).split(regex);
    if (parts.length === 1) return text;

    return (
      <>
        {parts.map((part, idx) =>
          regex.test(part) ? (
            <mark key={idx} className="search-highlight">{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  } catch {
    return text;
  }
}

function formatLedgerDate(d) {
  if (!d) return '—';
  const parts = String(d).slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`; // MM/DD/YYYY format
  }
  return d;
}

function formatMoneyVal(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  const formatted = `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${formatted}` : formatted;
}

function formatPaymentVal(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (n <= 0) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PrBadge({ type }) {
  const val = type || 'Copay';
  const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return <span className={`badge-pr pr-${slug}`}>{val}</span>;
}

function LedgerStatus({ status }) {
  const s = (status || 'active').toLowerCase();
  const label = s === 'withdrawn' ? 'Withdrawn' : s === 'paid' ? 'Paid' : 'Active';
  return <span className={`badge-ledger-status status-${s}`}>{label}</span>;
}

function NotePreview({ text, label }) {
  if (!text || text.trim() === '') {
    return <span className="note-empty">—</span>;
  }
  return (
    <span className="note-bubble" title={`${label ? label + ': ' : ''}${text}`}>
      {text}
    </span>
  );
}

// P1 – Statement list: 17-column medical billing ledger organized according to patient name
export function StatementListPage() {
  const { user } = useAuth();
  const { clinicId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isStaff = user.role !== 'clinic_user';

  const tab = params.get('tab') ?? 'statements';
  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? 'name_asc';
  const status = params.get('status') ?? 'active';
  const page = Number(params.get('page') ?? 1);

  const toast = useToast();
  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [awaitingCount, setAwaitingCount] = useState(0);

  useEffect(() => {
    const query = new URLSearchParams({ limit: '1', status: 'awaiting' });
    if (isStaff && clinicId) query.set('clinicId', clinicId);
    api(`/requests?${query.toString()}`)
      .then((res) => setAwaitingCount(res.metrics?.awaitingCount || 0))
      .catch(() => {});
  }, [clinicId, isStaff]);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const qParams = new URLSearchParams({ q, from, to, sort });
      if (isStaff && clinicId) qParams.set('clinicId', clinicId);
      if (isStaff && status) qParams.set('status', status);
      const filename = `${(data?.clinic?.name || 'patient').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-statements-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await downloadFile(`/statements/export?${qParams.toString()}`, filename);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const update = (changes) => {
    if (changes.from && to && changes.from > to) {
      changes.to = changes.from;
    }
    if (changes.to && from && changes.to < from) {
      changes.from = changes.to;
    }

    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (
        v === '' ||
        v === null ||
        (k === 'page' && v === 1) ||
        (k === 'sort' && v === 'name_asc') ||
        (k === 'status' && v === 'active') ||
        (k === 'tab' && v === 'statements')
      ) {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Sync search input with URL param q on external changes (e.g. Back/Forward, Clear filters)
  useEffect(() => {
    if (q !== search.trim()) {
      setSearch(q);
    }
  }, [q]);

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
      .then((d) => {
        if (!ignore) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (!ignore) setError(err);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [q, from, to, sort, page, status, clinicId, isStaff]);

  if (error?.status === 404) return <NotFoundPage />;

  const filtered = Boolean(q || from || to || (sort && sort !== 'name_asc') || (isStaff && status !== 'active'));
  const clearFilters = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };
  const open = (id) =>
    navigate(`/statements/${id}`, {
      state: { from: `${window.location.pathname}${window.location.search}` },
    });
  const back =
    user.role === 'specialist'
      ? { to: '/dashboard', label: 'Back to dashboard' }
      : user.role === 'admin'
        ? { to: `/manage/clinics/${clinicId}`, label: 'Back to clinic' }
        : { to: '/home', label: 'Back to home' };

  return (
    <div className="container">
      <BackBar
        {...back}
        trail={isStaff ? [data?.clinic.name ?? 'Clinic', 'Statements'] : ['Home', 'Patient statements']}
      />
      <PageHeader
        title="Patient statements"
        subtitle={
          data
            ? `${data.clinic.name} (${data.clinic.code})${isStaff ? '' : ' · Managed by US24 Solutions'}`
            : ' '
        }
      >
        <div className="btn-group">
          {tab === 'statements' && data && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportExcel}
              disabled={exporting}
              title="Download 17-column medical billing ledger in Excel (.xlsx) format"
            >
              <IconDownload size={14} /> {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
          )}
          {tab === 'statements' && user.role === 'specialist' && data?.clinic.isActive && (
            <Link to={`/imports/new?clinicId=${clinicId}`} className="btn btn-primary btn-sm">
              <IconTable size={14} /> Upload Excel
            </Link>
          )}
        </div>
      </PageHeader>

      {isStaff && data && !data.clinic.isActive && (
        <Alert tone="warning">
          This clinic is inactive. Its users can't sign in and nothing new can be published.
        </Alert>
      )}

      {/* Tabs located inside the Patient Statement view */}
      <div className="statement-page-tabs" role="tablist" aria-label="Statement section tabs">
        <button
          type="button"
          className={`statement-page-tab ${tab === 'statements' ? 'active' : ''}`}
          onClick={() => update({ tab: 'statements' })}
          role="tab"
          aria-selected={tab === 'statements'}
        >
          <IconDocument size={14} />
          <span>Statements</span>
        </button>
        <button
          type="button"
          className={`statement-page-tab ${tab === 'request' ? 'active' : ''}`}
          onClick={() => update({ tab: 'request' })}
          role="tab"
          aria-selected={tab === 'request'}
        >
          <IconChat size={14} />
          <span>Request</span>
          {awaitingCount > 0 && (
            <span className="tab-pill-badge plum">{awaitingCount}</span>
          )}
        </button>
      </div>

      {tab === 'request' ? (
        <RequestsContent clinicId={clinicId || data?.clinic?.id} embedded />
      ) : (
        <>
          <div className="filter-bar-sheet">
            <div className={`filter-grid ${isStaff ? 'filter-grid-staff' : ''}`}>
              <div className="filter-item">
                <label htmlFor="f-search">Search patient or account</label>
                <div className="input-with-icon">
                  <IconSearch className="input-icon" />
                  <input
                    id="f-search"
                    type="search"
                    className="form-input"
                    placeholder="Name, account, location, PR type…"
                    autoComplete="off"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="filter-item">
                <label htmlFor="f-from">From date</label>
                <input
                  id="f-from"
                  type="date"
                  className="form-input"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => update({ from: e.target.value })}
                />
              </div>
              <div className="filter-item">
                <label htmlFor="f-to">To date</label>
                <input
                  id="f-to"
                  type="date"
                  className="form-input"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => update({ to: e.target.value })}
                />
              </div>
              <div className="filter-item">
                <label htmlFor="f-sort">Sort by</label>
                <select
                  id="f-sort"
                  className="form-select"
                  value={sort}
                  onChange={(e) => update({ sort: e.target.value })}
                >
                  <option value="name_asc">Patient name (A–Z)</option>
                  <option value="name_desc">Patient name (Z–A)</option>
                  <option value="date_desc">Statement date (newest first)</option>
                  <option value="date_asc">Statement date (oldest first)</option>
                  <option value="balance_desc">Outstanding balance (high–low)</option>
                  <option value="balance_asc">Outstanding balance (low–high)</option>
                </select>
              </div>
              {isStaff && (
                <div className="filter-item">
                  <label htmlFor="f-status">Status</label>
                  <select
                    id="f-status"
                    className="form-select"
                    value={status}
                    onChange={(e) => update({ status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="withdrawn">Withdrawn</option>
                    <option value="all">All</option>
                  </select>
                </div>
              )}
              <div className="filter-item">
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={clearFilters}
                  disabled={!filtered}
                >
                  Clear filters
                </button>
              </div>
            </div>
          </div>

          {error && error.status !== 404 && <Alert tone="error">{error.message}</Alert>}

          <div className="results-meta-bar">
            <div>
              <span className="results-count-bold">{data?.total ?? 0}</span> patient record{data?.total === 1 ? '' : 's'}
              {filtered && <span className="muted-inline"> (filtered)</span>}
            </div>
            <div className="legend">
              <span className="badge badge-new">New</span> = not yet opened by the clinic
            </div>
          </div>

          <div className="table-sheet-card" aria-busy={loading}>
            {loading && !data ? (
              <Spinner label="Loading patient records…" />
            ) : data.items.length === 0 ? (
              filtered ? (
                <EmptyState
                  title="No patient records match your search"
                  action={
                    <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                      Clear filters
                    </button>
                  }
                >
                  Try a different name, account number or date range.
                </EmptyState>
              ) : (
                <EmptyState
                  title="No patient statements available"
                  action={
                    user.role === 'specialist' && data?.clinic.isActive ? (
                      <Link to={`/imports/new?clinicId=${clinicId}`} className="btn btn-primary btn-sm">
                        <IconTable size={14} /> Upload your first statement spreadsheet
                      </Link>
                    ) : null
                  }
                >
                  Statements published for this clinic will appear in this medical billing ledger.
                </EmptyState>
              )
            ) : (
              <>
                {/* Desktop / Tablet: Full 17-Column Medical Billing Ledger Table */}
                <div className="table-responsive">
                  <table className="patient-ledger-table">
                    <thead>
                      <tr className="ledger-header-grouped">
                        <th colSpan={6} className="group-base">Patient Information</th>
                        <th colSpan={3} className="group-cycle group-cycle-1">1st Statement Cycle</th>
                        <th colSpan={3} className="group-cycle group-cycle-2">2nd Statement Cycle</th>
                        <th colSpan={3} className="group-cycle group-cycle-3">3rd Statement Cycle</th>
                        <th colSpan={2} className="group-summary">Current Ledger Summary</th>
                      </tr>
                      <tr className="ledger-header-cols">
                        {/* 1-6: Base */}
                        <th scope="col" className="col-sr">#</th>
                        <th scope="col" className="col-acc">Account #</th>
                        <th scope="col" className="col-name">Patient Name</th>
                        <th scope="col" className="col-loc">Location</th>
                        <th scope="col" className="col-pr">PR Type</th>
                        <th scope="col" className="col-status">Status</th>

                        {/* 7-9: Cycle 1 */}
                        <th scope="col" className="col-cdate">Date (1)</th>
                        <th scope="col" className="col-camt">Balance (1)</th>
                        <th scope="col" className="col-cpaid">Paid (1)</th>

                        {/* 10-12: Cycle 2 */}
                        <th scope="col" className="col-cdate">Date (2)</th>
                        <th scope="col" className="col-camt">Balance (2)</th>
                        <th scope="col" className="col-cpaid">Paid (2)</th>

                        {/* 13-15: Cycle 3 */}
                        <th scope="col" className="col-cdate">Date (3)</th>
                        <th scope="col" className="col-camt">Balance (3)</th>
                        <th scope="col" className="col-cpaid">Paid (3)</th>

                        {/* 16-17: Summary */}
                        <th scope="col" className="col-totbal">Current Balance</th>
                        <th scope="col" className="col-remark">Remark / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((s, idx) => {
                        const rowNum = (data.page - 1) * data.pageSize + idx + 1;
                        const isWithdrawn = s.status?.toLowerCase() === 'withdrawn';
                        return (
                          <tr
                            key={s.id}
                            className={`ledger-row ${s.wasNew ? 'row-new' : ''} ${isWithdrawn ? 'row-withdrawn' : ''}`}
                            onClick={() => open(s.id)}
                            tabIndex={0}
                            role="button"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                open(s.id);
                              }
                            }}
                          >
                            {/* 1: Sr No */}
                            <td className="col-sr">{rowNum}</td>

                            {/* 2: Account Number */}
                            <td className="col-acc col-mono">
                              <Highlight text={s.accountNumber} query={q} />
                            </td>

                            {/* 3: Patient Name */}
                            <td className="col-name">
                              <span className="patient-name-cell">
                                <Highlight text={s.patientName} query={q} />
                                {s.wasNew && <span className="badge-new-dot" title="New statement" />}
                              </span>
                            </td>

                            {/* 4: Location */}
                            <td className="col-loc" title={s.location || data.clinic.name}>
                              <Highlight text={s.location || data.clinic.name} query={q} />
                            </td>

                            {/* 5: PR Type */}
                            <td className="col-pr">
                              <PrBadge type={s.prType} />
                            </td>

                            {/* 6: Status */}
                            <td className="col-status">
                              <LedgerStatus status={s.status} />
                            </td>

                            {/* 7-9: Cycle 1 */}
                            <td className="col-cdate col-subtle">{formatLedgerDate(s.cycle1Date)}</td>
                            <td className="col-camt col-mono">{formatMoneyVal(s.cycle1Balance)}</td>
                            <td className="col-cpaid col-mono col-paid-val">{formatPaymentVal(s.cycle1Payment)}</td>

                            {/* 10-12: Cycle 2 */}
                            <td className="col-cdate col-subtle">{formatLedgerDate(s.cycle2Date)}</td>
                            <td className="col-camt col-mono">{formatMoneyVal(s.cycle2Balance)}</td>
                            <td className="col-cpaid col-mono col-paid-val">{formatPaymentVal(s.cycle2Payment)}</td>

                            {/* 13-15: Cycle 3 */}
                            <td className="col-cdate col-subtle">{formatLedgerDate(s.cycle3Date)}</td>
                            <td className="col-camt col-mono">{formatMoneyVal(s.cycle3Balance)}</td>
                            <td className="col-cpaid col-mono col-paid-val">{formatPaymentVal(s.cycle3Payment)}</td>

                            {/* 16: Current Balance */}
                            <td className="col-totbal col-mono">
                              <strong>
                                {formatMoneyVal(
                                  s.currentBalance !== null && s.currentBalance !== undefined
                                    ? s.currentBalance
                                    : s.balanceDue,
                                )}
                              </strong>
                            </td>

                            {/* 17: Remark */}
                            <td className="col-remark" onClick={(e) => e.stopPropagation()}>
                              <NotePreview text={s.clientResponse || s.latestRemark || s.remarks} label={s.patientName} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: High-density card listing */}
                <ul className="mobile-ledger-list">
                  {data.items.map((s) => (
                    <li key={s.id}>
                      <Link
                        to={`/statements/${s.id}`}
                        className="mobile-ledger-card"
                        state={{ from: `${window.location.pathname}${window.location.search}` }}
                      >
                        <div className="mobile-ledger-top">
                          <div>
                            <div className="mobile-ledger-patient">
                              <Highlight text={s.patientName} query={q} />
                            </div>
                            <div className="mobile-ledger-location">
                              <Highlight text={s.location || data.clinic.name} query={q} />
                            </div>
                          </div>
                          <div className="mobile-badges">
                            <PrBadge type={s.prType} />
                            <LedgerStatus status={s.status} />
                          </div>
                        </div>

                        <div className="mobile-cycles-grid">
                          <div className="mobile-cycle-box">
                            <span className="mobile-cycle-title">1st Cycle</span>
                            <span>{formatLedgerDate(s.cycle1Date)}</span>
                            <span className="mobile-cycle-val">{formatMoneyVal(s.cycle1Balance)}</span>
                            <span className="mobile-cycle-paid">Paid: {formatPaymentVal(s.cycle1Payment)}</span>
                          </div>
                          <div className="mobile-cycle-box">
                            <span className="mobile-cycle-title">2nd Cycle</span>
                            <span>{formatLedgerDate(s.cycle2Date)}</span>
                            <span className="mobile-cycle-val">{formatMoneyVal(s.cycle2Balance)}</span>
                            <span className="mobile-cycle-paid">Paid: {formatPaymentVal(s.cycle2Payment)}</span>
                          </div>
                          <div className="mobile-cycle-box">
                            <span className="mobile-cycle-title">3rd Cycle</span>
                            <span>{formatLedgerDate(s.cycle3Date)}</span>
                            <span className="mobile-cycle-val">{formatMoneyVal(s.cycle3Balance)}</span>
                            <span className="mobile-cycle-paid">Paid: {formatPaymentVal(s.cycle3Payment)}</span>
                          </div>
                        </div>

                        <div className="mobile-ledger-footer">
                          <div>
                            <span className="form-hint">Current Balance</span>
                            <div className="mobile-ledger-balance">
                              {formatMoneyVal(
                                s.currentBalance !== null && s.currentBalance !== undefined
                                  ? s.currentBalance
                                  : s.balanceDue,
                              )}
                            </div>
                          </div>
                          <span className="btn btn-secondary btn-sm">Open</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>

                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  total={data.total}
                  pageSize={data.pageSize}
                  onPage={(p) => update({ page: p })}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
