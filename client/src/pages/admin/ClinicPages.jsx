import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { IconBuilding, IconChat, IconShield, IconTrash, IconUsers } from '../../components/Icons.jsx';
import { Alert, BackBar, ConfirmDialog, EmptyState, Field, PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { shortDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';

// --- M1: admin home ----------------------------------------------------------------
export function AdminHome() {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    api('/admin/summary').then(setSummary).catch(() => {});
  }, []);
  const cards = [
    {
      to: '/manage/clinics',
      icon: IconBuilding,
      title: 'Clinics',
      desc: 'Add clinics, assign specialists and manage clinic access.',
      stat: summary ? `${summary.active_clinics} active` : 'Loading…',
      badgeClass: 'badge-open',
    },
    {
      to: '/manage/users',
      icon: IconUsers,
      title: 'Users',
      desc: 'Invite users, reset 2-step verification and deactivate accounts.',
      stat: summary ? `${summary.active_users} active · ${summary.invited_users} invited` : 'Loading…',
      badgeClass: 'badge-open',
    },
    {
      to: '/manage/audit',
      icon: IconShield,
      title: 'Audit log',
      desc: 'Review and export who viewed, uploaded or downloaded what.',
      stat: summary ? `${summary.blocked_7d} blocked (7d) · ${summary.total_audit_events ?? 0} events` : 'Loading…',
      badgeClass: summary?.blocked_7d > 0 ? 'badge-warning' : 'badge-open',
    },
    {
      to: '/manage/remarks',
      icon: IconChat,
      title: 'Clinic updates & remarks',
      desc: 'Track clinic remarks, patient status notes and ledger updates.',
      stat: summary ? `${summary.total_remarks ?? 0} remarks${summary.awaiting_remarks ? ` · ${summary.awaiting_remarks} awaiting reply` : ''}` : 'Loading…',
      badgeClass: summary?.awaiting_remarks > 0 ? 'badge-plum' : 'badge-open',
    },
  ];
  return (
    <div className="container">
      <div className="hub-wrapper">
        <BackBar to="/home" label="Back to portal home" />
        <div className="hub-welcome-banner">
          <h1 className="hub-clinic-headline">Administration</h1>
          <p className="hub-subheadline">
            {summary
              ? `${summary.active_statements.toLocaleString('en-US')} active statements across all clinics`
              : 'Loading system overview…'}
          </p>
        </div>
        <div className="admin-cards-grid">
          {cards.map((c) => (
            <Link key={c.to} to={c.to} className="hub-card hub-card-active">
              <div className="hub-card-icon-wrap"><c.icon size={30} /></div>
              <h2 className="hub-card-title">{c.title}</h2>
              <p className="hub-card-desc">{c.desc}</p>
              <div className="hub-card-tag">
                <span className={`badge ${c.badgeClass}`}>{c.stat}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- M2: clinics list ----------------------------------------------------------------
export function ClinicsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [clinics, setClinics] = useState(null);
  const [error, setError] = useState('');
  const [deletingClinic, setDeletingClinic] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const loadClinics = useCallback(() => {
    api(`/admin/clinics?${new URLSearchParams({ q, status })}`)
      .then((d) => setClinics(d.clinics))
      .catch((e) => setError(e.message));
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(loadClinics, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadClinics, q]);

  const handleDelete = async () => {
    if (!deletingClinic) return;
    setBusy(true);
    try {
      await api(`/admin/clinics/${deletingClinic.id}`, { method: 'DELETE' });
      toast(`Clinic "${deletingClinic.name}" has been deleted from the database.`, 'success');
      setDeletingClinic(null);
      loadClinics();
    } catch (err) {
      toast(err.message || 'Failed to delete clinic.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <BackBar to="/admin" label="Back to admin home" trail={['Admin', 'Clinics']} />
      <PageHeader title="Clinics">
        <Link to="/manage/clinics/new" className="btn btn-primary">Add clinic</Link>
      </PageHeader>
      <div className="filter-bar-sheet">
        <div className="filter-grid filter-grid-2">
          <div className="filter-item">
            <label htmlFor="c-q">Search by name or clinic ID</label>
            <input id="c-q" type="search" className="form-input" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="filter-item">
            <label htmlFor="c-status">Status</label>
            <select id="c-status" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="table-sheet-card">
        {!clinics ? <Spinner /> : clinics.length === 0 ? (
          <EmptyState title={q || status !== 'all' ? 'No clinics match.' : 'No clinics yet. Add your first clinic.'} />
        ) : (
          <div className="table-responsive table-always">
            <table className="statements-table">
              <thead>
                <tr>
                  <th scope="col">Clinic</th>
                  <th scope="col">Clinic ID</th>
                  <th scope="col">Status</th>
                  <th scope="col">Users</th>
                  <th scope="col">Specialists</th>
                  <th scope="col" style={{ textAlign: 'center', width: 100 }}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {clinics.map((c) => (
                  <tr key={c.id} className="row-static">
                    <td><Link to={`/manage/clinics/${c.id}`} className="strong-link">{c.name}</Link><div className="form-hint">{c.city}, {c.state}</div></td>
                    <td className="col-mono">{c.clinicCode}</td>
                    <td><StatusBadge status={c.isActive ? 'active' : 'deactivated'} /></td>
                    <td>{c.userCount}</td>
                    <td>{c.specialists || <span className="text-warning">None assigned</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-danger-outline btn-xs"
                        onClick={() => setDeletingClinic(c)}
                        title={`Delete ${c.name} from database`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <IconTrash size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deletingClinic && (
        <ConfirmDialog
          title="Delete clinic from database?"
          destructive
          busy={busy}
          confirmLabel={busy ? 'Deleting…' : 'Delete clinic'}
          message={`Are you sure you want to permanently delete "${deletingClinic.name}" (${deletingClinic.clinicCode}) from the database? All statements, remarks, files, and clinic users will be removed.`}
          onCancel={() => !busy && setDeletingClinic(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// --- M3: clinic detail -------------------------------------------------------------------
export function ClinicDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [assignId, setAssignId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/admin/clinics/${id}`).then(setData).catch(setError), [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error?.status === 404) return <NotFoundPage />;
  if (error) return <div className="container"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <div className="container"><Spinner /></div>;
  const c = data.clinic;

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      toast(message);
      setDialog(null);
      setAssignId('');
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <BackBar to="/manage/clinics" label="Back to clinics" trail={['Clinics', c.name]} />
      {location.state?.saved && <Alert tone="success">Clinic saved.</Alert>}
      <PageHeader title={c.name} subtitle={`${c.clinicCode} · ${data.activeStatements} active statements`}>
        <StatusBadge status={c.isActive ? 'active' : 'deactivated'} />
        <Link to={`/clinics/${c.id}/statements`} className="btn btn-secondary btn-sm">View statements</Link>
        <Link to={`/manage/clinics/${c.id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
        {c.isActive ? (
          <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setDialog('deactivate')}>Deactivate clinic</button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('reactivate')}>Reactivate clinic</button>
        )}
        <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setDialog('delete')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconTrash size={14} /> Delete clinic
        </button>
      </PageHeader>

      <div className="detail-columns-grid admin-grid">
        <section className="panel">
          <div className="panel-header"><h2>Details</h2></div>
          <dl className="summary-list">
            <div><dt>Address</dt><dd>{c.addressLine1}{c.addressLine2 && `, ${c.addressLine2}`}<br />{c.city}, {c.state} {c.postalCode}</dd></div>
            <div><dt>Primary contact</dt><dd>{c.contactName}<br />{c.contactPhone} · {c.contactEmail}</dd></div>
            {!c.isActive && <div><dt>Deactivated</dt><dd>{shortDate(c.deactivatedAt)}</dd></div>}
          </dl>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>Assigned specialists</h2></div>
          {data.specialists.length === 0 ? (
            <Alert tone="warning">No specialist assigned. Statements can't be uploaded until one is assigned.</Alert>
          ) : (
            <ul className="simple-list">
              {data.specialists.map((s) => (
                <li key={s.id}>
                  <span><Link to={`/manage/users/${s.id}`}>{s.fullName}</Link> <span className="form-hint">{s.email}</span></span>
                  <button type="button" className="btn-tertiary danger" onClick={() => setDialog({ unassign: s })}>Unassign</button>
                </li>
              ))}
            </ul>
          )}
          {data.availableSpecialists.length > 0 && (
            <div className="inline-form">
              <label htmlFor="assign-spec" className="sr-only">Specialist to assign</label>
              <select id="assign-spec" className="form-select" value={assignId} onChange={(e) => setAssignId(e.target.value)}>
                <option value="">Assign a specialist…</option>
                {data.availableSpecialists.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.email})</option>)}
              </select>
              <button type="button" className="btn btn-primary btn-sm" disabled={!assignId || busy}
                onClick={() => run(() => api(`/admin/clinics/${id}/specialists`, { method: 'POST', body: { specialistId: assignId } }), 'Specialist assigned.')}>
                Assign
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Clinic users</h2>
          <Link to={`/manage/users/invite?clinicId=${c.id}&role=clinic_user`} className="btn btn-secondary btn-sm">Invite user</Link>
        </div>
        {data.users.length === 0 ? <p className="panel-empty">No users yet.</p> : (
          <div className="table-responsive table-always">
            <table className="statements-table compact">
              <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Last sign-in</th></tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="row-static">
                    <td><Link to={`/manage/users/${u.id}`}>{u.fullName}</Link></td>
                    <td>{u.email}</td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="col-date">{u.lastLogin ? shortDate(u.lastLogin) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog === 'deactivate' && (
        <ConfirmDialog title="Deactivate this clinic?" destructive busy={busy} confirmLabel="Deactivate"
          message={`All ${data.users.filter((u) => u.status !== 'deactivated').length} users of ${c.name} will be signed out and blocked. Statements are kept.`}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => api(`/admin/clinics/${id}/deactivate`, { method: 'POST' }), 'Clinic deactivated.')} />
      )}
      {dialog === 'reactivate' && (
        <ConfirmDialog title="Reactivate this clinic?" busy={busy} confirmLabel="Reactivate"
          message={`${c.name}'s active users will be able to sign in again.`}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => api(`/admin/clinics/${id}/reactivate`, { method: 'POST' }), 'Clinic reactivated.')} />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title="Delete this clinic permanently?"
          destructive
          busy={busy}
          confirmLabel={busy ? 'Deleting…' : 'Delete clinic'}
          message={`Are you sure you want to permanently delete "${c.name}" (${c.clinicCode}) from the database? All statements, remarks, files, and clinic users will be removed.`}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api(`/admin/clinics/${id}`, { method: 'DELETE' });
              toast(`Clinic "${c.name}" deleted from database.`, 'success');
              navigate('/manage/clinics');
            } catch (err) {
              toast(err.message || 'Failed to delete clinic.', 'error');
              setBusy(false);
            }
          }}
        />
      )}
      {dialog?.unassign && (
        <ConfirmDialog title="Unassign specialist?" destructive busy={busy} confirmLabel="Unassign"
          message={`${dialog.unassign.fullName} will lose access to ${c.name} immediately.`}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => api(`/admin/clinics/${id}/specialists/${dialog.unassign.id}`, { method: 'DELETE' }), 'Specialist unassigned.')} />
      )}
    </div>
  );
}

// --- M4: clinic form -------------------------------------------------------------------
const CLINIC_FIELDS = [
  ['name', 'Clinic name', true], ['clinicCode', 'Clinic ID', true, 'Letters, digits, - or _. Example: CLN-4082'],
  ['addressLine1', 'Street address', true], ['addressLine2', 'Address line 2', false],
  ['city', 'City', true], ['state', 'State', true, '2-letter code, e.g. IL'], ['postalCode', 'ZIP code', true],
  ['contactName', 'Primary contact name', true], ['contactPhone', 'Contact phone', true], ['contactEmail', 'Contact email', true],
];
const BLANK = Object.fromEntries(CLINIC_FIELDS.map(([k]) => [k, '']));

export function ClinicFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [values, setValues] = useState(editing ? null : BLANK);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api(`/admin/clinics/${id}`)
      .then((d) => setValues(Object.fromEntries(CLINIC_FIELDS.map(([k]) => [k, d.clinic[k] ?? '']))))
      .catch((e) => setError(e.message));
  }, [editing, id]);

  if (!values) return <div className="container">{error ? <Alert tone="error">{error}</Alert> : <Spinner />}</div>;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api(editing ? `/admin/clinics/${id}` : '/admin/clinics', { method: editing ? 'PUT' : 'POST', body: values });
      navigate(`/manage/clinics/${editing ? id : d.id}`, { replace: true, state: { saved: true } });
    } catch (err) {
      setErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="container page-narrow">
      <BackBar to={editing ? `/manage/clinics/${id}` : '/manage/clinics'} label={editing ? 'Back to clinic' : 'Back to clinics'} trail={['Clinics', editing ? 'Edit' : 'Add clinic']} />
      <PageHeader title={editing ? 'Edit clinic' : 'Add clinic'} />
      {error && <Alert tone="error">{error}</Alert>}
      <form className="panel form-panel" onSubmit={save} noValidate>
        <div className="form-row-2">
          {CLINIC_FIELDS.map(([key, label, required, hint]) => (
            <Field key={key} label={label} required={required} hint={hint} error={errors[key]}>
              {(p) => (
                <input {...p} className="form-input" value={values[key]}
                  type={key === 'contactEmail' ? 'email' : key === 'contactPhone' ? 'tel' : 'text'}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
              )}
            </Field>
          ))}
        </div>
        <div className="form-actions">
          <Link to={editing ? `/manage/clinics/${id}` : '/manage/clinics'} className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
