import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  IconBuilding,
  IconChart,
  IconChat,
  IconChevronDown,
  IconClock,
  IconDocument,
  IconDollar,
  IconDownload,
  IconFileText,
  IconFolder,
  IconPlus,
  IconSearch,
  IconTable,
  IconTrash,
  IconWallet,
} from '../../components/Icons.jsx';
import { Alert, ConfirmDialog, Spinner } from '../../components/ui.jsx';
import { api, downloadFile } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, initials, money, shortDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';
import { NewRequestModal, RequestsContent } from '../requests/RequestsPage.jsx';
import { ClinicCollectionDashboard } from '../../components/ClinicCollectionDashboard.jsx';

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


function formatMoneyVal(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  const formatted = `${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${formatted}` : formatted;
}

function formatPaymentVal(val) {
  if (val === null || val === undefined || val === '') return '—';
  const s = String(val).trim();
  if (s.toLowerCase().includes('paid')) return s;
  const n = Number(s.replace(/[$,]/g, ''));
  if (Number.isNaN(n) || n <= 0) return '$0.00';
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PrBadge({ type }) {
  const val = type || 'Copay';
  const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return <span className={`badge-pr pr-${slug}`}>{val}</span>;
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

function formatLedgerDate(d) {
  if (!d) return '—';
  const parts = String(d).slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`; // MM/DD/YYYY format
  }
  return d;
}

function getMonthDateRange(yearMonth) {
  if (!yearMonth) return { from: '', to: '' };
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(year, month, 0).getDate();
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function buildMonthGroups(items = []) {
  const currentYear = new Date().getFullYear();
  const yearsSet = new Set([currentYear, currentYear - 1]);

  if (Array.isArray(items)) {
    for (const item of items) {
      const dateStr = item.cycle1Date || item.statementDate;
      if (dateStr && typeof dateStr === 'string' && dateStr.length >= 4) {
        const y = parseInt(dateStr.slice(0, 4), 10);
        if (!isNaN(y) && y >= 2020 && y <= 2035) {
          yearsSet.add(y);
        }
      }
    }
  }

  const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);

  return sortedYears.map((year) => ({
    year,
    months: MONTH_NAMES.map((name, idx) => {
      const monthNum = String(idx + 1).padStart(2, '0');
      return {
        value: `${year}-${monthNum}`,
        label: `${name} ${year}`,
      };
    }),
  }));
}

export function StatementListPage() {
  const { user } = useAuth();
  const { clinicId } = useParams();
  const isStaff = user.role !== 'clinic_user';
  const canViewCollection = isStaff || Boolean(user?.isClinicAdmin);
  const navigate = useNavigate();

  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'statements';
  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? 'name_asc';
  const monthParam = params.get('month') ?? (from && to && from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : '');
  const status = params.get('status') ?? 'active';
  const page = Number(params.get('page') ?? 1);

  const toast = useToast();
  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [deletingStatement, setDeletingStatement] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [segmentedStatus, setSegmentedStatus] = useState('all'); // 'all' | 'new' | 'viewed' | 'request_sent'

  const monthGroups = buildMonthGroups(data?.items);

  const handleMonthChange = (selectedMonth) => {
    if (!selectedMonth) {
      update({ month: '', from: '', to: '' });
    } else {
      const { from: mFrom, to: mTo } = getMonthDateRange(selectedMonth);
      update({ month: selectedMonth, from: mFrom, to: mTo });
    }
  };

  const handleDeleteStatement = async () => {
    if (!deletingStatement) return;
    setDeletingBusy(true);
    try {
      await api(`/statements/${deletingStatement.id}`, { method: 'DELETE' });
      toast(`Statement for "${deletingStatement.patientName}" removed successfully.`, 'success');
      setDeletingStatement(null);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          total: Math.max(0, (prev.total || 1) - 1),
          items: prev.items.filter((item) => item.id !== deletingStatement.id),
        };
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast(err.message || 'Failed to remove statement.', 'error');
    } finally {
      setDeletingBusy(false);
    }
  };

  useEffect(() => {
    const query = new URLSearchParams({ limit: '1', status: 'awaiting' });
    if (isStaff && clinicId) query.set('clinicId', clinicId);
    api(`/requests?${query.toString()}`)
      .then((res) => setAwaitingCount(res.metrics?.awaitingCount || 0))
      .catch(() => {});
  }, [clinicId, isStaff, tab]);

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
        (k === 'tab' && (v === 'statements' || !v))
      ) {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (q !== search.trim()) {
      setSearch(q);
    }
  }, [q]);

  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (tab === 'collection' && !canViewCollection) {
      update({ tab: 'statements' });
    }
  }, [tab, canViewCollection]);

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
  }, [q, from, to, sort, page, status, clinicId, isStaff, refreshKey]);

  if (error?.status === 404) return <NotFoundPage />;

  const filtered = Boolean(q || from || to || monthParam || (sort && sort !== 'name_asc') || (isStaff && status !== 'active'));
  const clearFilters = () => {
    setSearch('');
    setSegmentedStatus('all');
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
        : null;

  // --- Compute Real KPI Data from Existing Statements State ---
  const totalStatements = data?.total ?? data?.items?.length ?? 0;
  const newStatementsCount = data?.items?.filter((s) => s.isNew).length ?? 0;
  const requestSentCount = data?.items?.filter((s) => s.awaitingReply).length ?? 0;
  const viewedCount = Math.max(0, (data?.items?.length ?? 0) - newStatementsCount - requestSentCount);

  const totalPatientResponsibility =
    data?.items?.reduce((acc, s) => {
      const val = Number(s.currentBalance ?? s.balanceDue ?? 0);
      return acc + (isNaN(val) ? 0 : val);
    }, 0) ?? 0;

  const latestDate = data?.items?.reduce((latest, s) => {
    const d = s.cycle3Date || s.cycle2Date || s.cycle1Date || s.statementDate;
    if (!d) return latest;
    return !latest || d > latest ? d : latest;
  }, null);
  const lastSharedCaption = latestDate ? `Last shared ${shortDate(latestDate)}` : 'Last shared —';

  // Client-side segmented filter matching
  const displayedItems = (data?.items || []).filter((s) => {
    if (segmentedStatus === 'new') return s.isNew;
    if (segmentedStatus === 'request_sent') return s.awaitingReply;
    if (segmentedStatus === 'viewed') return !s.isNew && !s.awaitingReply;
    return true;
  });

  const clinicName = data?.clinic?.name || user.clinic?.name || 'Clinic';
  const clinicCode = data?.clinic?.code || user.clinic?.code || 'CLINIC';

  const startRecord = data ? Math.min((data.page - 1) * data.pageSize + 1, data.total) : 0;
  const endRecord = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div className="clinical-clean-page">
      <div className="clinical-clean-layout">
        {/* ===================================================================
            SIDEBAR (Three stacked cards with 16px gap)
            =================================================================== */}
        <aside className="clinical-sidebar" aria-label="Portal Sidebar Navigation">
          {/* Card 1: Clinic Card */}
          <div className="sidebar-card clinic-identity-card">
            <div className="clinic-tile-icon" aria-hidden="true">
              <IconBuilding size={22} />
            </div>
            <div className="clinic-identity-meta">
              <div className="clinic-identity-name" title={clinicName}>
                {clinicName}
              </div>
              <div className="clinic-identity-sub">
                <span className="clinic-code-chip">{clinicCode}</span>
                <span className="clinic-portal-label">Clinic portal</span>
              </div>
            </div>
          </div>

          {/* Merged Navigation & Help Card (Spread Down to Full Height) */}
          <div className="sidebar-card sidebar-nav-card sidebar-nav-card-merged">
            <div className="sidebar-top-section">
              <div className="sidebar-services-header">SERVICES</div>

              <nav className="sidebar-services-nav" aria-label="Services Menu">
                {/* Parent item: Patient Statement */}
                <div className="sidebar-nav-parent">
                  <span className="sidebar-parent-icon" aria-hidden="true">
                    <IconFolder size={16} />
                  </span>
                  <span className="sidebar-parent-label">Patient statement</span>
                </div>

                {/* Sub-items (indented 28px) */}
                <div className="sidebar-subitems-group">
                  <button
                    type="button"
                    className={`sidebar-subitem-btn ${tab === 'statements' ? 'active' : ''}`}
                    onClick={() => update({ tab: 'statements' })}
                    aria-current={tab === 'statements' ? 'page' : undefined}
                  >
                    <span className="sidebar-subitem-title">Statements</span>
                    <span className="sidebar-count-pill-orange">
                      {totalStatements}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`sidebar-subitem-btn ${tab === 'requests' ? 'active' : ''}`}
                    onClick={() => update({ tab: 'requests' })}
                    aria-current={tab === 'requests' ? 'page' : undefined}
                  >
                    <span className="sidebar-subitem-title">Requests</span>
                    <span className="sidebar-count-pill-blue">
                      {awaitingCount}
                    </span>
                  </button>
                </div>

                <div className="sidebar-nav-divider" aria-hidden="true" />

                {/* Disabled Services */}
                <div className="sidebar-disabled-item" title="Accounts receivable tracking and insurance aging">
                  <div className="sidebar-disabled-lead">
                    <IconChart size={16} aria-hidden="true" />
                    <span>AR Report</span>
                  </div>
                  <span className="badge-soon-tag">SOON</span>
                </div>

                {canViewCollection && (
                  <button
                    type="button"
                    className={`sidebar-subitem-btn sidebar-service-btn ${tab === 'collection' ? 'active' : ''}`}
                    onClick={() => update({ tab: 'collection' })}
                    aria-current={tab === 'collection' ? 'page' : undefined}
                    title="Clinic collection reports, remittances, and patient line items"
                  >
                    <div className="sidebar-disabled-lead">
                      <IconWallet size={16} aria-hidden="true" />
                      <span>Clinic Collection</span>
                    </div>
                  </button>
                )}
              </nav>

              {back && (
                <div className="sidebar-back-box">
                  <Link to={back.to} className="sidebar-back-anchor">
                    ← {back.label}
                  </Link>
                </div>
              )}
            </div>

            {/* Merged Help / Specialist Section at bottom of spread card */}
            <div className="sidebar-merged-help-section">
              <h2 className="help-card-heading">Questions about a statement?</h2>
              <p className="help-card-text">
                Your US24 billing specialist can review balances, remarks and appeals.
              </p>
              <a
                href="mailto:support@us24solutions.com?subject=Inquiry%20regarding%20Patient%20Statements"
                className="btn-help-contact"
              >
                Contact US24
              </a>
            </div>
          </div>
        </aside>

        {/* ===================================================================
            CONTENT COLUMN (flex: 999 1 560px, min-width: 0)
            =================================================================== */}
        <section className="clinical-content" aria-label="Patient Statements Workspace">
          {/* 1. Title Row */}
          <div className="content-title-row">
            <div className="content-title-meta">


              <h1 className="clinical-page-h1">
                {tab === 'requests' ? 'Requests & Inquiries' : tab === 'collection' ? 'Clinic Collection' : 'Patient statements'}
              </h1>

              <div className="clinical-page-sub">
                {clinicName} ({clinicCode}){isStaff ? '' : ' · Managed by US24 Solutions'}
              </div>
            </div>

            <div className="content-actions-group">
              {tab === 'statements' && (
                <button
                  type="button"
                  className="btn-clean-outline"
                  onClick={handleExportExcel}
                  disabled={exporting || !data || data.total === 0}
                  title="Download 17-column medical billing ledger in Excel (.xlsx) format"
                  aria-label="Export Statements to Excel"
                >
                  <IconDownload size={16} aria-hidden="true" />
                  <span>{exporting ? 'Exporting…' : 'Export Excel'}</span>
                </button>
              )}

              {tab === 'statements' && user.role === 'specialist' && data?.clinic?.isActive && (
                <Link to={`/imports/new?clinicId=${clinicId}`} className="btn-clean-navy">
                  <IconTable size={16} aria-hidden="true" />
                  <span>Upload Excel</span>
                </Link>
              )}
            </div>
          </div>

          {isStaff && data && !data.clinic.isActive && (
            <Alert tone="warning">
              This clinic is inactive. Its users can't sign in and nothing new can be published.
            </Alert>
          )}

          {tab === 'requests' ? (
            <div className="embedded-requests-workspace">
              <RequestsContent clinicId={clinicId || data?.clinic?.id} embedded />
            </div>
          ) : tab === 'collection' && canViewCollection ? (
            <ClinicCollectionDashboard clinic={data?.clinic} isStaff={isStaff} />
          ) : (
            <>
              {/* 2. KPI Row (Four Cards, All Derived From Statements Data) */}
              <div className="kpi-metrics-row">
                {/* KPI Card 1: Statements shared */}
                <div className="kpi-metric-card">
                  <div className="kpi-tile-header">
                    <span className="kpi-label">Statements shared</span>
                    <div className="kpi-icon-tile tile-tint-blue" aria-hidden="true">
                      <IconDocument size={16} />
                    </div>
                  </div>
                  <div className="kpi-number">{totalStatements}</div>
                  <div className="kpi-caption">{lastSharedCaption}</div>
                </div>

                {/* KPI Card 2: New · not yet opened (Highlighted Orange) */}
                <div className="kpi-metric-card kpi-card-orange-highlight">
                  <div className="kpi-tile-header">
                    <span className="kpi-label kpi-label-orange">New · not yet opened</span>
                    <div className="kpi-icon-tile tile-tint-orange" aria-hidden="true">
                      <IconFileText size={16} />
                    </div>
                  </div>
                  <div className="kpi-number kpi-number-orange">{newStatementsCount}</div>
                  <div className="kpi-caption kpi-caption-orange">Review these first</div>
                </div>

                {/* KPI Card 3: Patient responsibility */}
                <div className="kpi-metric-card">
                  <div className="kpi-tile-header">
                    <span className="kpi-label">Patient responsibility</span>
                    <div className="kpi-icon-tile tile-tint-green" aria-hidden="true">
                      <IconDollar size={16} />
                    </div>
                  </div>
                  <div className="kpi-number">{money(totalPatientResponsibility)}</div>
                  <div className="kpi-caption">Across all shared statements</div>
                </div>

                {/* KPI Card 4: Open requests */}
                <div className="kpi-metric-card">
                  <div className="kpi-tile-header">
                    <span className="kpi-label">Open requests</span>
                    <div className="kpi-icon-tile tile-tint-indigo" aria-hidden="true">
                      <IconClock size={16} />
                    </div>
                  </div>
                  <div className="kpi-number">{awaitingCount}</div>
                  <div className="kpi-caption">Awaiting US24 reply</div>
                </div>
              </div>

              {/* 3. Filter Card */}
              <div className="clinical-card filter-controls-card">
                {/* Segmented Status Tabs on #F5F6FA track */}
                <div
                  className="segmented-status-track"
                  role="group"
                  aria-label="Filter statements by status"
                >
                  <button
                    type="button"
                    className={`segmented-tab-btn ${segmentedStatus === 'all' ? 'active' : ''}`}
                    aria-pressed={segmentedStatus === 'all'}
                    onClick={() => setSegmentedStatus('all')}
                  >
                    All · {totalStatements}
                  </button>
                  <button
                    type="button"
                    className={`segmented-tab-btn ${segmentedStatus === 'new' ? 'active' : ''}`}
                    aria-pressed={segmentedStatus === 'new'}
                    onClick={() => setSegmentedStatus('new')}
                  >
                    New · {newStatementsCount}
                  </button>
                  <button
                    type="button"
                    className={`segmented-tab-btn ${segmentedStatus === 'viewed' ? 'active' : ''}`}
                    aria-pressed={segmentedStatus === 'viewed'}
                    onClick={() => setSegmentedStatus('viewed')}
                  >
                    Viewed · {viewedCount}
                  </button>
                  <button
                    type="button"
                    className={`segmented-tab-btn ${segmentedStatus === 'request_sent' ? 'active' : ''}`}
                    aria-pressed={segmentedStatus === 'request_sent'}
                    onClick={() => setSegmentedStatus('request_sent')}
                  >
                    Request sent · {requestSentCount}
                  </button>
                </div>

                {/* Filter Form Row */}
                <div className="filter-inputs-row">
                  <div className="filter-field filter-field-search">
                    <label htmlFor="f-search" className="filter-input-label">
                      Search patient or account
                    </label>
                    <div className="clean-search-wrapper">
                      <IconSearch className="search-field-icon" size={17} aria-hidden="true" />
                      <input
                        id="f-search"
                        type="search"
                        className="clean-text-input"
                        placeholder="Name, account, location, PR type…"
                        autoComplete="off"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="filter-field filter-field-month">
                    <label htmlFor="f-month" className="filter-input-label">
                      Month
                    </label>
                    <select
                      id="f-month"
                      className="clean-select-input"
                      value={monthParam}
                      onChange={(e) => handleMonthChange(e.target.value)}
                    >
                      <option value="">All months</option>
                      {monthGroups.map((group) => (
                        <optgroup key={group.year} label={String(group.year)}>
                          {group.months.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="filter-field filter-field-sort">
                    <label htmlFor="f-sort" className="filter-input-label">
                      Sort by
                    </label>
                    <select
                      id="f-sort"
                      className="clean-select-input"
                      value={sort}
                      onChange={(e) => update({ sort: e.target.value })}
                    >
                      <option value="name_asc">Patient name (A–Z)</option>
                      <option value="name_desc">Patient name (Z–A)</option>
                      <option value="date_desc">Newest shared first</option>
                      <option value="date_asc">Oldest shared first</option>
                      <option value="balance_desc">Outstanding balance (high–low)</option>
                      <option value="balance_asc">Outstanding balance (low–high)</option>
                    </select>
                  </div>

                  <div className="filter-field filter-field-clear">
                    <button
                      type="button"
                      className="btn-text-clear"
                      onClick={clearFilters}
                      disabled={!filtered && segmentedStatus === 'all'}
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              </div>

              {error && error.status !== 404 && <Alert tone="error">{error.message}</Alert>}

              {/* 4. Table Card or 5. Empty State */}
              <div className="clinical-card table-wrapper-card" aria-busy={loading}>
                {loading && !data ? (
                  <div className="table-loading-box">
                    <Spinner label="Loading patient statements…" />
                  </div>
                ) : !data || data.items.length === 0 ? (
                  /* Empty state */
                  filtered ? (
                    <div className="clinical-empty-card">
                      <div className="empty-illustration-icon" aria-hidden="true">
                        <IconSearch size={36} />
                      </div>
                      <h2 className="empty-heading">No matching patient records</h2>
                      <p className="empty-desc">
                        Try clearing or adjusting your search terms and date filters.
                      </p>
                      <div className="empty-actions">
                        <button type="button" className="btn-clean-navy" onClick={clearFilters}>
                          Clear filters
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="clinical-empty-card">
                      <div className="empty-illustration-icon" aria-hidden="true">
                        <IconDocument size={44} />
                      </div>
                      <h2 className="empty-heading">You're all caught up</h2>
                      <p className="empty-desc">
                        No patient statements have been shared with your clinic yet. When your US24 billing specialist uploads one, it appears here.
                      </p>
                      <div className="empty-actions">
                        <button
                          type="button"
                          className="btn-clean-navy"
                          onClick={() => setNewRequestOpen(true)}
                        >
                          Request a statement
                        </button>
                        <a
                          href="mailto:support@us24solutions.com?subject=Statement%20Inquiry"
                          className="btn-clean-outline"
                        >
                          Contact US24
                        </a>
                      </div>

                      <div className="how-it-works-row">
                        <div className="how-step">
                          <span className="how-num">1</span>
                          <span className="how-label">US24 prepares</span>
                        </div>
                        <div className="how-step-arrow" aria-hidden="true">→</div>
                        <div className="how-step">
                          <span className="how-num">2</span>
                          <span className="how-label">You're notified</span>
                        </div>
                        <div className="how-step-arrow" aria-hidden="true">→</div>
                        <div className="how-step">
                          <span className="how-num">3</span>
                          <span className="how-label">Review, export or ask</span>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    {/* Header Strip */}
                    <div className="table-header-strip">
                      <div className="records-count-text">
                        <strong>{displayedItems.length}</strong> patient record{displayedItems.length === 1 ? '' : 's'}
                      </div>
                      <div className="table-legend-notice">
                        <span className="legend-new-pill" aria-hidden="true">NEW</span>
                        <span>= not yet opened by the clinic</span>
                      </div>
                    </div>

                    {/* Table inside overflow wrapper */}
                    <div className="table-scroll-pane">
                      <table className="clinical-clean-table">
                        <caption className="sr-only">
                          Patient statements ledger, {displayedItems.length} results
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col" className="th-location">LOCATION</th>
                            <th scope="col" className="th-acct">ACCT. #:</th>
                            <th scope="col" className="th-patient">PATIENT NAME</th>
                            <th scope="col" className="th-dob">DOB</th>
                            <th scope="col" className="th-insurance">INSURANCE NAME</th>
                            <th scope="col" className="th-pr">PR TYPE</th>
                            <th scope="col" className="th-status">STATUS</th>
                            <th scope="col" className="th-current-balance text-right">CURRENT BALANCE DUE</th>
                            <th scope="col" className="th-cycle-date">1ST STATEMENT DATE</th>
                            <th scope="col" className="th-cycle-bal text-right">BALANCE DUE</th>
                            <th scope="col" className="th-cycle-pmt text-right">PAYMENT RECEIVED</th>
                            <th scope="col" className="th-cycle-date">2ND  STATEMENT DATE</th>
                            <th scope="col" className="th-cycle-bal text-right">BALANCE DUE</th>
                            <th scope="col" className="th-cycle-pmt text-right">PAYMENT RECEIVED</th>
                            <th scope="col" className="th-cycle-date">3RD  STATEMENT DATE</th>
                            <th scope="col" className="th-cycle-bal text-right">BALANCE DUE</th>
                            <th scope="col" className="th-cycle-pmt text-right">PAYMENT RECEIVED</th>
                            <th scope="col" className="th-notes">US24 NOTES</th>
                            <th scope="col" className="th-notes">CLIENT RESPONSE</th>
                            <th scope="col" className="th-notes">AS PER VOB- Notes</th>
                            <th scope="col" className="th-actions text-center">ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedItems.map((s) => {
                            const isNew = Boolean(s.isNew);
                            const isReq = Boolean(s.awaitingReply);

                            return (
                              <tr
                                key={s.id}
                                onClick={() => open(s.id)}
                                className={isNew ? 'row-is-new' : undefined}
                              >
                                {/* 1. LOCATION */}
                                <td className="cell-location" title={s.location || clinicName}>
                                  <Highlight text={s.location || clinicName} query={q} />
                                </td>

                                {/* 2. ACCT. #: */}
                                <td className="cell-acct col-mono">
                                  <Highlight
                                    text={s.accountNumber || (s.id ? `ACC-${s.id.slice(0, 6).toUpperCase()}` : '—')}
                                    query={q}
                                  />
                                </td>

                                {/* 3. PATIENT NAME */}
                                <td className="cell-patient">
                                  <div className="patient-name-line">
                                    <span className="patient-name-text">
                                      <Highlight text={s.patientName} query={q} />
                                    </span>
                                    {isNew && (
                                      <span className="pill-badge-new">NEW</span>
                                    )}
                                  </div>
                                </td>

                                {/* 4. DOB */}
                                <td className="cell-dob">
                                  {(s.patientDob || s.patient_dob) ? formatLedgerDate(s.patientDob || s.patient_dob) : '—'}
                                </td>

                                {/* 5. INSURANCE NAME */}
                                <td className="cell-insurance" title={s.insuranceName || s.insurance_name || 'Self-pay'}>
                                  {s.insuranceName || s.insurance_name || 'Self-pay'}
                                </td>

                                {/* 6. PR TYPE */}
                                <td className="cell-pr">
                                  <PrBadge type={s.prType} />
                                </td>

                                {/* 7. STATUS */}
                                <td className="cell-status">
                                  {isNew ? (
                                    <span className="status-pill status-pill-new">
                                      <span className="status-dot dot-new" aria-hidden="true" />
                                      <span>New</span>
                                    </span>
                                  ) : isReq ? (
                                    <span className="status-pill status-pill-request">
                                      <span className="status-dot dot-request" aria-hidden="true" />
                                      <span>Request sent</span>
                                    </span>
                                  ) : (
                                    <span className="status-pill status-pill-viewed">
                                      <span className="status-dot dot-viewed" aria-hidden="true" />
                                      <span>{s.status === 'withdrawn' ? 'Withdrawn' : s.status === 'paid' ? 'Paid' : (s.status || 'Viewed')}</span>
                                    </span>
                                  )}
                                </td>

                                {/* 8. CURRENT BALANCE DUE */}
                                <td className="cell-current-balance text-right col-mono font-bold">
                                  {formatMoneyVal(s.currentBalance ?? s.balanceDue)}
                                </td>

                                {/* 9. 1ST STATEMENT DATE */}
                                <td className="cell-date">
                                  {formatLedgerDate(s.cycle1Date || s.statementDate)}
                                </td>

                                {/* 10. BALANCE DUE (Cycle 1) */}
                                <td className="cell-amount text-right col-mono">
                                  {formatMoneyVal(s.cycle1Balance ?? s.balanceDue)}
                                </td>

                                {/* 11. PAYMENT RECEIVED (Cycle 1) */}
                                <td className="cell-payment text-right col-mono text-success">
                                  {formatPaymentVal(s.cycle1Payment)}
                                </td>

                                {/* 12. 2ND STATEMENT DATE */}
                                <td className="cell-date">
                                  {formatLedgerDate(s.cycle2Date)}
                                </td>

                                {/* 13. BALANCE DUE (Cycle 2) */}
                                <td className="cell-amount text-right col-mono">
                                  {s.cycle2Balance != null ? formatMoneyVal(s.cycle2Balance) : '—'}
                                </td>

                                {/* 14. PAYMENT RECEIVED (Cycle 2) */}
                                <td className="cell-payment text-right col-mono text-success">
                                  {formatPaymentVal(s.cycle2Payment)}
                                </td>

                                {/* 15. 3RD STATEMENT DATE */}
                                <td className="cell-date">
                                  {formatLedgerDate(s.cycle3Date)}
                                </td>

                                {/* 16. BALANCE DUE (Cycle 3) */}
                                <td className="cell-amount text-right col-mono">
                                  {s.cycle3Balance != null ? formatMoneyVal(s.cycle3Balance) : '—'}
                                </td>

                                {/* 17. PAYMENT RECEIVED (Cycle 3) */}
                                <td className="cell-payment text-right col-mono text-success">
                                  {formatPaymentVal(s.cycle3Payment)}
                                </td>

                                {/* 18. US24 NOTES */}
                                <td className="cell-note" onClick={(e) => e.stopPropagation()}>
                                  <NotePreview text={s.us24Notes || s.remarks} label="US24 Notes" />
                                </td>

                                {/* 19. CLIENT RESPONSE */}
                                <td className="cell-note" onClick={(e) => e.stopPropagation()}>
                                  <NotePreview text={s.clientResponse} label="Client Response" />
                                </td>

                                {/* 20. AS PER VOB- Notes */}
                                <td className="cell-note" onClick={(e) => e.stopPropagation()}>
                                  <NotePreview text={s.vobNotes} label="AS PER VOB- Notes" />
                                </td>

                                {/* ACTIONS */}
                                <td className="cell-actions text-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="actions-cluster">
                                    <button
                                      type="button"
                                      className="btn-table-view-clean"
                                      onClick={() => open(s.id)}
                                      aria-label={`View statement for ${s.patientName}`}
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-table-trash-clean"
                                      title="Delete statement"
                                      aria-label={`Delete statement for ${s.patientName}`}
                                      onClick={() => setDeletingStatement(s)}
                                    >
                                      <IconTrash size={14} aria-hidden="true" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer Strip */}
                    <div className="table-footer-strip">
                      <div className="footer-pagination-info">
                        Showing {startRecord}–{endRecord} of {data.total}
                      </div>
                      <div className="footer-pagination-buttons">
                        <button
                          type="button"
                          className="btn-pagination-nav"
                          disabled={data.page <= 1}
                          onClick={() => update({ page: data.page - 1 })}
                          aria-label="Previous page"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="btn-pagination-nav"
                          disabled={data.page >= data.totalPages}
                          onClick={() => update({ page: data.page + 1 })}
                          aria-label="Next page"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* New Request Modal */}
      {newRequestOpen && (
        <NewRequestModal
          clinicId={clinicId || data?.clinic?.id}
          onClose={() => setNewRequestOpen(false)}
          onCreated={() => {
            setNewRequestOpen(false);
            update({ tab: 'requests' });
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingStatement && (
        <ConfirmDialog
          title="Remove this statement?"
          destructive
          busy={deletingBusy}
          confirmLabel={deletingBusy ? 'Removing…' : 'Remove statement'}
          message={`Are you sure you want to permanently remove the statement data for "${deletingStatement.patientName}" from the database? All associated remarks, inquiries, and files will be deleted.`}
          onCancel={() => setDeletingStatement(null)}
          onConfirm={handleDeleteStatement}
        />
      )}
    </div>
  );
}
