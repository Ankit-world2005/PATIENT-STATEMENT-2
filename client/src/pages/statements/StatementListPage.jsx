import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconDownload, IconSearch, IconTable } from '../../components/Icons.jsx';
import { Alert, BackBar, EmptyState, PageHeader, Pagination, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api, downloadFile } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, money, shortDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
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
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (
        v === '' ||
        v === null ||
        (k === 'page' && v === 1) ||
        (k === 'sort' && v === 'name_asc') ||
        (k === 'status' && v === 'active')
      ) {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
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

  const filtered = q || from || to || (isStaff && status !== 'active');
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
          {data && (
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
          {user.role === 'specialist' && data?.clinic.isActive && (
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
                placeholder="Name or account number"
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
              title={
                isStaff
                  ? 'No patient statements for this clinic yet'
                  : 'No patient statements have been shared with your clinic yet'
              }
            />
          )
        ) : (
          <>
            {/* Desktop / Tablet: Full 17-Column Medical Billing Ledger Table */}
            <div className="patient-ledger-scroll">
              <table className="patient-ledger-table">
                <caption className="sr-only">Patient statements ledger, {data.total} results</caption>
                <thead>
                  <tr>
                    <th scope="col" className="th-left sticky-col-location">LOCATION</th>
                    <th scope="col" className="th-left sticky-col-patient">PATIENT NAME</th>
                    <th scope="col">1ST ELECTRONIC STATEMENT</th>
                    <th scope="col" className="th-right">BALANCE DUE AMOUNT</th>
                    <th scope="col" className="th-right">PAYMENT RECEIVED</th>
                    <th scope="col">2ND ELECTRONIC STATEMENT</th>
                    <th scope="col" className="th-right">BALANCE DUE AMOUNT</th>
                    <th scope="col" className="th-right">PAYMENT RECEIVED</th>
                    <th scope="col">3RD ELECTRONIC STATEMENT</th>
                    <th scope="col" className="th-right">BALANCE DUE AMOUNT</th>
                    <th scope="col" className="th-right">PAYMENT RECEIVED</th>
                    <th scope="col" className="th-right">CURRENT OUTSTANDING BALANCE</th>
                    <th scope="col">PR TYPE</th>
                    <th scope="col">STATUS</th>
                    <th scope="col" className="th-left" title="Specialist remarks and ledger notes">REMARKS</th>
                    <th scope="col" className="th-left">CLIENT RESPONSE</th>
                    <th scope="col" className="th-left">AS PER VOB- Notes</th>
                    <th scope="col"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => open(s.id)}
                      className={s.status === 'withdrawn' ? 'row-withdrawn' : undefined}
                    >
                      <td className="sticky-col-location cell-location" title={s.location || data?.clinic.name}>
                        {s.location || data?.clinic.name}
                      </td>
                      <td className="sticky-col-patient">
                        <div className="cell-patient">
                          <Highlight text={s.patientName} query={q} />
                          {s.isNew && <span className="badge badge-new">New</span>}
                          {s.hasNewerVersion && <span className="badge badge-muted">Earlier</span>}
                          {s.awaitingReply && <span className="badge badge-plum">Awaiting reply</span>}
                        </div>
                      </td>
                      <td className="cell-date">{formatLedgerDate(s.cycle1Date)}</td>
                      <td className="cell-amount">{formatMoneyVal(s.cycle1Balance)}</td>
                      <td className="cell-payment">{formatPaymentVal(s.cycle1Payment)}</td>
                      <td className="cell-date">{formatLedgerDate(s.cycle2Date)}</td>
                      <td className="cell-amount">{formatMoneyVal(s.cycle2Balance)}</td>
                      <td className="cell-payment">{formatPaymentVal(s.cycle2Payment)}</td>
                      <td className="cell-date">{formatLedgerDate(s.cycle3Date)}</td>
                      <td className="cell-amount">{formatMoneyVal(s.cycle3Balance)}</td>
                      <td className="cell-payment">{formatPaymentVal(s.cycle3Payment)}</td>
                      <td className="cell-outstanding">
                        {formatMoneyVal(
                          s.currentBalance !== null && s.currentBalance !== undefined
                            ? s.currentBalance
                            : s.balanceDue,
                        )}
                      </td>
                      <td className="text-center">
                        <PrBadge type={s.prType} />
                      </td>
                      <td className="text-center">
                        <LedgerStatus status={s.status} />
                      </td>
                      <td className="cell-note">
                        <NotePreview text={s.remarks || s.us24Notes} label="Remarks" />
                      </td>
                      <td className="cell-note">
                        <NotePreview text={s.clientResponse} label="Client Response" />
                      </td>
                      <td className="cell-note">
                        <NotePreview text={s.vobNotes} label="AS PER VOB- Notes" />
                      </td>
                      <td className="cell-action text-right">
                        <Link
                          to={`/statements/${s.id}`}
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => e.stopPropagation()}
                          state={{ from: `${window.location.pathname}${window.location.search}` }}
                          aria-label={`Open statement for ${s.patientName}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View: High-density card listing */}
            <ul className="mobile-statements-list">
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
                          {s.location || data.clinic.name}
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
    </div>
  );
}
