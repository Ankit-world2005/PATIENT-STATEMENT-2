import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ClinicsDropdown } from '../../components/ClinicsDropdown.jsx';
import { IconBuilding, IconChat, IconClock, IconDocument, IconTable, IconUpload } from '../../components/Icons.jsx';
import { Alert, EmptyState, PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dateTime, shortDate } from '../../lib/format.js';
import { ImportTabContent } from './ImportTabContent.jsx';

// S1 – Specialist dashboard (F6, FR-5.1)
export function DashboardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const activeTab = searchParams.get('tab') === 'import' ? 'import' : 'overview';

  const selectTab = (tab) => {
    if (tab === 'overview') {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
    } else {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    api('/dashboard').then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="container"><Alert tone="error">{error}</Alert></div>;
  if (!data) return <div className="container"><Spinner label="Loading your dashboard…" /></div>;

  const canPublish = data.clinics.some((c) => c.isActive);
  const firstName = user.fullName.split(' ')[0];
  const recentImports = data.recent.filter((r) => r.kind === 'import');

  return (
    <div className="container page-pad">
      <PageHeader
        title="Specialist dashboard"
        subtitle={`Welcome back, ${firstName}. Here's what needs your attention.`}
      >
        <ClinicsDropdown clinics={data.clinics} />
        {canPublish ? (
          <>
            <Link to="/statements/upload" className="btn btn-secondary">
              <IconUpload /> Upload statement
            </Link>
            {activeTab === 'overview' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => selectTab('import')}
              >
                <IconTable /> Import statements
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => selectTab('overview')}
              >
                <IconBuilding /> View overview
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" disabled>
              <IconUpload /> Upload statement
            </button>
            <button type="button" className="btn btn-primary" disabled>
              <IconTable /> Import statements
            </button>
          </>
        )}
      </PageHeader>

      {/* Navigation tabs */}
      <div className="dashboard-tabs-nav" role="tablist" aria-label="Specialist dashboard sections">
        <button
          type="button"
          role="tab"
          id="tab-overview"
          aria-controls="panel-overview"
          aria-selected={activeTab === 'overview'}
          className={`dashboard-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => selectTab('overview')}
        >
          <IconBuilding size={18} />
          <span>Overview</span>
          {data.unanswered.length > 0 && (
            <span className="badge badge-plum">{data.unanswered.length}</span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-import"
          aria-controls="panel-import"
          aria-selected={activeTab === 'import'}
          className={`dashboard-tab-btn ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => selectTab('import')}
        >
          <IconTable size={18} />
          <span>Import statements</span>
          <span className="badge badge-open">Batch</span>
        </button>
      </div>

      {data.clinics.length === 0 && (
        <Alert tone="info">You haven't been assigned to any clinics yet. Contact your administrator.</Alert>
      )}

      {activeTab === 'import' ? (
        <div id="panel-import" role="tabpanel" aria-labelledby="tab-import">
          <ImportTabContent clinics={data.clinics} recentImports={recentImports} />
        </div>
      ) : (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="dashboard-grid">
          <div className="dashboard-main">
            {/* Aggregate Specialist KPI Stats Cards */}
            <div className="stats-kpi-grid" style={{ marginBottom: '20px' }}>
              <div className="stat-kpi-card">
                <div className="kpi-icon-wrap kpi-blue"><IconBuilding size={20} /></div>
                <div className="kpi-content">
                  <span className="kpi-label">Assigned Clinics</span>
                  <strong className="kpi-value">{data.clinics.length}</strong>
                </div>
              </div>
              <div className="stat-kpi-card">
                <div className="kpi-icon-wrap"><IconDocument size={20} /></div>
                <div className="kpi-content">
                  <span className="kpi-label">Active Statements</span>
                  <strong className="kpi-value">
                    {data.clinics.reduce((sum, c) => sum + (c.statementCount || 0), 0)}
                  </strong>
                </div>
              </div>
              <div className="stat-kpi-card">
                <div className="kpi-icon-wrap kpi-teal"><IconClock size={20} /></div>
                <div className="kpi-content">
                  <span className="kpi-label">Unopened by Clinics</span>
                  <strong className="kpi-value">
                    {data.clinics.reduce((sum, c) => sum + (c.unopenedCount || 0), 0)}
                  </strong>
                </div>
              </div>
              <div className="stat-kpi-card">
                <div className="kpi-icon-wrap kpi-plum"><IconChat size={20} /></div>
                <div className="kpi-content">
                  <span className="kpi-label">Awaiting Reply</span>
                  <strong className="kpi-value text-plum">{data.unanswered.length}</strong>
                </div>
              </div>
            </div>

            <section className="panel" aria-labelledby="my-clinics">
              <div className="panel-header"><h2 id="my-clinics">My clinics</h2></div>
              {data.clinics.length === 0 ? (
                <p className="panel-empty">No clinics assigned.</p>
              ) : (
                <ul className="clinic-tiles">
                  {data.clinics.map((c) => (
                    <li key={c.id}>
                      <Link to={`/clinics/${c.id}/statements`} className={`clinic-tile ${c.isActive ? '' : 'inactive'}`}>
                        <div className="clinic-tile-head">
                          <span className="clinic-tile-name">{c.name}</span>
                          <span className="user-clinic-badge">{c.code}</span>
                        </div>
                        {!c.isActive && <StatusBadge status="deactivated" />}
                        <dl className="clinic-tile-stats">
                          <div><dt>Statements</dt><dd>{c.statementCount}</dd></div>
                          <div><dt>Unopened</dt><dd>{c.unopenedCount}</dd></div>
                          <div><dt>Awaiting reply</dt><dd className={c.awaitingCount ? 'text-plum' : ''}>{c.awaitingCount}</dd></div>
                        </dl>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" aria-labelledby="recent">
              <div className="panel-header"><h2 id="recent">Recent uploads and imports</h2></div>
              {data.recent.length === 0 ? (
                <p className="panel-empty">No uploads yet.</p>
              ) : (
                <div className="table-responsive table-always">
                  <table className="statements-table compact">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Clinic</th>
                        <th scope="col">Type</th>
                        <th scope="col">Details</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r) => (
                        <tr key={`${r.kind}-${r.id}`}>
                          <td className="col-date">{shortDate(r.at)}</td>
                          <td>{r.clinicName}</td>
                          <td>{r.kind === 'import' ? 'Import' : 'Single upload'}</td>
                          <td>
                            <Link to={r.kind === 'import' ? (r.status === 'previewed' ? `/imports/${r.id}/preview` : `/imports/${r.id}`) : `/statements/${r.id}`}>
                              {r.label}
                            </Link>
                            {r.kind === 'import' && r.counts.total != null && (
                              <div className="form-hint">
                                {r.counts.total} {r.counts.total === 1 ? 'row' : 'rows'}
                                {r.status !== 'previewed' && r.status !== 'cancelled' && ` · ${r.counts.published} published`}
                                {r.counts.failed ? ` · ${r.counts.failed} failed` : ''}
                                {r.counts.skipped ? ` · ${r.counts.skipped} skipped` : ''}
                              </div>
                            )}
                          </td>
                          <td><StatusBadge status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="panel dashboard-side" aria-labelledby="unanswered">
            <div className="panel-header">
              <h2 id="unanswered"><IconChat size={18} /> Unanswered clinic remarks</h2>
              {data.unanswered.length > 0 && <span className="badge badge-plum">{data.unanswered.length}</span>}
            </div>
            {data.unanswered.length === 0 ? (
              <EmptyState title="You're all caught up">No clinic remarks are waiting for a reply.</EmptyState>
            ) : (
              <ul className="unanswered-list">
                {data.unanswered.map((u) => (
                  <li key={u.statementId}>
                    <Link to={`/statements/${u.statementId}`} className="unanswered-item">
                      <div className="unanswered-top">
                        <strong>{u.patientName}</strong>
                        <span className="col-mono">{u.accountNumber}</span>
                      </div>
                      <p className="unanswered-excerpt">“{u.excerpt}”</p>
                      <div className="form-hint">{u.clinicName} · {u.authorName} · {dateTime(u.createdAt)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
