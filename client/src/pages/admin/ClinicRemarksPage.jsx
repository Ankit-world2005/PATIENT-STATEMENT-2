import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconChat, IconClock, IconSearch, IconBuilding } from '../../components/Icons.jsx';
import { Alert, BackBar, EmptyState, PageHeader, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { dateTime, money } from '../../lib/format.js';

export function ClinicRemarksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const clinicId = searchParams.get('clinicId') ?? '';
  const type = searchParams.get('type') ?? 'all';
  const awaiting = searchParams.get('awaiting') === '1';
  const recent7d = searchParams.get('recent7d') === '1';
  const page = Number(searchParams.get('page') ?? 1);

  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (
        v === '' ||
        v === null ||
        (k === 'page' && v === 1) ||
        (k === 'type' && v === 'all') ||
        (k === 'awaiting' && !v) ||
        (k === 'recent7d' && !v)
      ) {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    }
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  // Debounced search
  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      type,
    });
    if (q) query.set('q', q);
    if (clinicId) query.set('clinicId', clinicId);
    if (awaiting) query.set('awaiting', '1');
    if (recent7d) query.set('recent7d', '1');

    api(`/admin/remarks?${query.toString()}`)
      .then((res) => {
        if (!ignore) {
          setData(res);
          setError('');
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [q, clinicId, type, awaiting, recent7d, page]);

  const isAllFilterActive = !awaiting && !recent7d && !clinicId && type === 'all' && !q;

  return (
    <div className="container page-pad">
      <BackBar to="/admin" label="Back to admin home" trail={['Admin', 'Clinic remarks & updates']} />

      <PageHeader
        title="Clinic remarks & updates"
        subtitle="Monitor communication threads, patient status notes, and ledger updates across all clinics."
      />

      {/* KPI Stats Bar with Interactive Filters */}
      {data?.stats && (
        <div className="stats-kpi-grid" role="region" aria-label="Remark status filters">
          <button
            type="button"
            className={`stat-kpi-card interactive ${isAllFilterActive ? 'active' : ''}`}
            onClick={() => update({ awaiting: '', recent7d: '', clinicId: '', type: 'all', q: '', page: 1 })}
            title="Click to view all remarks"
            aria-pressed={isAllFilterActive}
          >
            <div className="kpi-icon-wrap"><IconChat size={20} /></div>
            <div className="kpi-content">
              <span className="kpi-label">Total Remarks</span>
              <strong className="kpi-value">{data.stats.total_remarks ?? 0}</strong>
            </div>
          </button>

          <button
            type="button"
            className={`stat-kpi-card interactive card-plum ${awaiting ? 'active' : ''}`}
            onClick={() => update({ awaiting: awaiting ? '' : '1', recent7d: '', page: 1 })}
            title="Click to filter statements awaiting reply"
            aria-pressed={awaiting}
          >
            <div className="kpi-icon-wrap kpi-plum"><IconClock size={20} /></div>
            <div className="kpi-content">
              <span className="kpi-label">Awaiting Reply</span>
              <strong className="kpi-value text-plum">{data.stats.awaiting_count ?? 0}</strong>
            </div>
          </button>

          <button
            type="button"
            className={`stat-kpi-card interactive card-blue ${clinicId ? 'active' : ''}`}
            onClick={() => {
              const el = document.getElementById('r-clinic');
              if (el) {
                el.focus();
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            title="Click to focus clinic filter"
            aria-pressed={Boolean(clinicId)}
          >
            <div className="kpi-icon-wrap kpi-blue"><IconBuilding size={20} /></div>
            <div className="kpi-content">
              <span className="kpi-label">Active Clinics</span>
              <strong className="kpi-value">{data.clinics?.length ?? 0}</strong>
            </div>
          </button>

          <button
            type="button"
            className={`stat-kpi-card interactive card-teal ${recent7d ? 'active' : ''}`}
            onClick={() => update({ recent7d: recent7d ? '' : '1', awaiting: '', page: 1 })}
            title="Click to filter remarks from the last 7 days"
            aria-pressed={recent7d}
          >
            <div className="kpi-icon-wrap kpi-teal"><IconChat size={20} /></div>
            <div className="kpi-content">
              <span className="kpi-label">Remarks (Last 7 Days)</span>
              <strong className="kpi-value">{data.stats.recent_7d_count ?? 0}</strong>
            </div>
          </button>
        </div>
      )}

      {/* Filter Sheet */}
      <div className="filter-bar-sheet">
        <div className="filter-grid filter-grid-4">
          <div className="filter-item">
            <label htmlFor="r-search">Search patient, account or remarks</label>
            <div className="search-input-wrap">
              <IconSearch size={16} />
              <input
                id="r-search"
                type="search"
                className="form-input search-input"
                placeholder="Search name, account, remark…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-item">
            <label htmlFor="r-clinic">Filter by clinic</label>
            <select
              id="r-clinic"
              className="form-select"
              value={clinicId}
              onChange={(e) => update({ clinicId: e.target.value })}
            >
              <option value="">All clinics</option>
              {data?.clinics?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="r-type">Remark type / source</label>
            <select
              id="r-type"
              className="form-select"
              value={type}
              onChange={(e) => update({ type: e.target.value })}
            >
              <option value="all">All remark types</option>
              <option value="clinic">Clinic Users</option>
              <option value="specialist">US24 Specialists</option>
              <option value="insurance">Insurance Adjudication</option>
            </select>
          </div>

          <div className="filter-item filter-checkbox-item">
            <label htmlFor="r-awaiting" className="filter-checkbox-label">
              <input
                id="r-awaiting"
                type="checkbox"
                checked={awaiting}
                onChange={(e) => update({ awaiting: e.target.checked ? '1' : '' })}
              />
              <span>Awaiting reply only</span>
            </label>
          </div>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Remarks Feed & Table */}
      <div className="table-sheet-card">
        {(awaiting || recent7d || clinicId || type !== 'all' || q) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'rgba(15, 23, 42, 0.03)', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Active filter:</span>
            {awaiting && <span className="badge badge-plum">Awaiting reply</span>}
            {recent7d && <span className="badge badge-info">Last 7 days</span>}
            {clinicId && <span className="badge badge-open">{data?.clinics?.find((c) => c.id === clinicId)?.name || 'Selected clinic'}</span>}
            {type !== 'all' && <span className="badge badge-open">Type: {type}</span>}
            {q && <span className="badge badge-open">Search: “{q}”</span>}
            <button
              type="button"
              className="btn btn-tertiary btn-sm"
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '0.8rem' }}
              onClick={() => update({ awaiting: '', recent7d: '', clinicId: '', type: 'all', q: '', page: 1 })}
            >
              Clear all
            </button>
          </div>
        )}

        {loading && !data ? (
          <Spinner label="Loading clinic updates and remarks…" />
        ) : data?.items?.length === 0 ? (
          <EmptyState
            title={q || clinicId || awaiting || recent7d || type !== 'all' ? 'No remarks match your filters.' : 'No clinic remarks recorded yet.'}
          >
            {q || clinicId || awaiting || recent7d || type !== 'all'
              ? 'Try clearing your filters or selecting all clinics to see all remarks.'
              : 'When clinic users or specialists add notes to patient statements, they will appear here.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-responsive table-always">
              <table className="statements-table">
                <thead>
                  <tr>
                    <th scope="col">Date & Time</th>
                    <th scope="col">Clinic</th>
                    <th scope="col">Patient & Account</th>
                    <th scope="col">Author & Role</th>
                    <th scope="col">Type</th>
                    <th scope="col" style={{ minWidth: '320px' }}>Remark / Update</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items?.map((item) => {
                    const isClinicAuthor = item.authorRole === 'clinic_user';
                    const isSpecialistAuthor = item.authorRole === 'specialist';
                    const typeBadgeClass =
                      item.type === 'clinic'
                        ? 'badge-remark-clinic'
                        : item.type === 'specialist'
                        ? 'badge-remark-specialist'
                        : 'badge-remark-insurance';

                    return (
                      <tr key={item.id} className={item.awaitingReply ? 'row-awaiting-reply' : ''}>
                        <td className="col-date" style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.82rem', color: '#64748B' }}>{dateTime(item.createdAt)}</span>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>{item.clinic.name}</div>
                          <span className="user-clinic-badge" style={{ fontSize: '0.72rem' }}>{item.clinic.code}</span>
                        </td>

                        <td>
                          <div>
                            <Link to={`/statements/${item.statementId}`} className="patient-name-link" style={{ fontWeight: 600 }}>
                              {item.patientName}
                            </Link>
                          </div>
                          <div className="form-hint col-mono">{item.accountNumber}</div>
                          {item.currentBalance && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-primary, #0D5C63)', fontWeight: 700 }}>
                              Bal: {money(item.currentBalance)}
                            </div>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.authorName}</div>
                          <span
                            className={`badge ${
                              isClinicAuthor ? 'badge-info' : isSpecialistAuthor ? 'badge-primary' : 'badge-secondary'
                            }`}
                            style={{ fontSize: '0.72rem', marginTop: 2, display: 'inline-block' }}
                          >
                            {isClinicAuthor ? 'Clinic User' : isSpecialistAuthor ? 'US24 Specialist' : 'Staff'}
                          </span>
                        </td>

                        <td>
                          <span className={`badge-pill ${typeBadgeClass}`}>
                            {item.type === 'clinic' ? 'Clinic Note' : item.type === 'specialist' ? 'Specialist' : 'Insurance'}
                          </span>
                        </td>

                        <td>
                          <div className="admin-remark-bubble">
                            <p className="admin-remark-body">“{item.body}”</p>
                            {item.insuranceName && (
                              <div className="form-hint" style={{ marginTop: 4 }}>
                                <strong>Payer:</strong> {item.insuranceName} {item.insuranceReference && `· Ref: ${item.insuranceReference}`}
                              </div>
                            )}
                          </div>
                          {item.awaitingReply && (
                            <div style={{ marginTop: 4 }}>
                              <span className="badge badge-plum" style={{ fontSize: '0.72rem' }}>
                                Awaiting US24 reply
                              </span>
                            </div>
                          )}
                        </td>

                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Link to={`/statements/${item.statementId}`} className="btn btn-secondary btn-sm">
                            View statement
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {data && data.pageCount > 1 && (
              <div className="table-pagination-bar">
                <span className="pagination-info">
                  Page <strong>{data.page}</strong> of <strong>{data.pageCount}</strong> ({data.total} remarks total)
                </span>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={data.page <= 1}
                    onClick={() => update({ page: data.page - 1 })}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={data.page >= data.pageCount}
                    onClick={() => update({ page: data.page + 1 })}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
