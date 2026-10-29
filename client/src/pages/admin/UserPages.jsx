import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconTrash } from '../../components/Icons.jsx';
import { Alert, BackBar, ConfirmDialog, EmptyState, Field, PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { ROLE_LABELS, dateTime, shortDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';

function useClinicOptions() {
  const [clinics, setClinics] = useState([]);
  useEffect(() => {
    api('/admin/clinics?status=all').then((d) => setClinics(d.clinics)).catch(() => {});
  }, []);
  return clinics;
}

// --- M5: users list -------------------------------------------------------------------
export function UsersPage() {
  const clinics = useClinicOptions();
  const [filters, setFilters] = useState({ q: '', role: '', status: '', clinicId: '' });
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [deletingUser, setDeletingUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const loadUsers = useCallback(() => {
    api(`/admin/users?${new URLSearchParams(filters)}`)
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(loadUsers, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadUsers, filters.q]);

  const handleDelete = async () => {
    if (!deletingUser) return;
    setBusy(true);
    try {
      await api(`/admin/users/${deletingUser.id}`, { method: 'DELETE' });
      toast(`User "${deletingUser.fullName}" has been deleted from the database.`, 'success');
      setDeletingUser(null);
      loadUsers();
    } catch (err) {
      toast(err.message || 'Failed to delete user.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="container">
      <BackBar to="/admin" label="Back to admin home" trail={['Admin', 'Users']} />
      <PageHeader title="Users"><Link to="/manage/users/invite" className="btn btn-primary">Invite user</Link></PageHeader>
      <div className="filter-bar-sheet">
        <div className="filter-grid filter-grid-4">
          <div className="filter-item">
            <label htmlFor="u-q">Search name or email</label>
            <input id="u-q" type="search" className="form-input" value={filters.q} onChange={set('q')} />
          </div>
          <div className="filter-item">
            <label htmlFor="u-role">Role</label>
            <select id="u-role" className="form-select" value={filters.role} onChange={set('role')}>
              <option value="">All roles</option><option value="admin">Admin</option><option value="specialist">Specialist</option><option value="clinic_user">Clinic User</option>
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="u-clinic">Clinic</label>
            <select id="u-clinic" className="form-select" value={filters.clinicId} onChange={set('clinicId')}>
              <option value="">All clinics</option>
              {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="u-status">Status</label>
            <select id="u-status" className="form-select" value={filters.status} onChange={set('status')}>
              <option value="">All</option><option value="invited">Invited</option><option value="active">Active</option><option value="deactivated">Deactivated</option>
            </select>
          </div>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="table-sheet-card">
        {!users ? <Spinner /> : users.length === 0 ? <EmptyState title="No users match." /> : (
          <div className="table-responsive table-always">
            <table className="statements-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Clinic</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col" style={{ textAlign: 'center', width: 100 }}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="row-static">
                    <td><Link to={`/manage/users/${u.id}`} className="strong-link">{u.fullName}</Link></td>
                    <td>{u.email}</td>
                    <td>{ROLE_LABELS[u.role]}</td>
                    <td>{u.clinic?.name ?? '—'}</td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="col-date">{u.lastLogin ? shortDate(u.lastLogin) : 'Never'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-danger-outline btn-xs"
                        onClick={() => setDeletingUser(u)}
                        title={`Delete ${u.fullName} from database`}
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

      {deletingUser && (
        <ConfirmDialog
          title="Delete user from database?"
          destructive
          busy={busy}
          confirmLabel={busy ? 'Deleting…' : 'Delete user'}
          message={`Are you sure you want to permanently delete "${deletingUser.fullName}" (${deletingUser.email}) from the database? This action cannot be undone.`}
          onCancel={() => !busy && setDeletingUser(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// --- M6: invite user ----------------------------------------------------------------------
export function InviteUserPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clinics = useClinicOptions().filter((c) => c.isActive);
  const [values, setValues] = useState({
    fullName: '', email: '', role: params.get('role') ?? '', clinicId: params.get('clinicId') ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const backTo = params.get('clinicId') ? `/manage/clinics/${params.get('clinicId')}` : '/manage/users';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/admin/users', { method: 'POST', body: values });
      navigate(`/manage/users/${d.id}`, {
        replace: true,
        state: {
          message: d.emailFailed
            ? "The user was created, but the invitation couldn't be sent. Use Resend invitation."
            : `Invitation sent to ${values.email}. It expires in 72 hours.`,
          tone: d.emailFailed ? 'warning' : 'success',
        },
      });
    } catch (err) {
      setErrors(err.fieldErrors);
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="container page-narrow">
      <BackBar to={backTo} label="Back" trail={['Users', 'Invite user']} />
      <PageHeader title="Invite user" subtitle="The user gets an email with a link to set their password. It contains no patient information." />
      {error && (
        <Alert tone="error">
          {error.message}{' '}
          {error.data.existingUserId && <Link to={`/manage/users/${error.data.existingUserId}`}>View that user</Link>}
        </Alert>
      )}
      <form className="panel form-panel" onSubmit={submit} noValidate>
        <Field label="Full name" error={errors.fullName} required>
          {(p) => <input {...p} className="form-input" value={values.fullName} onChange={set('fullName')} />}
        </Field>
        <Field label="Email" error={errors.email} required>
          {(p) => <input {...p} type="email" className="form-input" value={values.email} onChange={set('email')} />}
        </Field>
        <Field label="Role" error={errors.role} required>
          {(p) => (
            <select {...p} className="form-select" value={values.role} onChange={set('role')}>
              <option value="">Choose a role…</option>
              <option value="clinic_user">Clinic User</option>
              <option value="specialist">Specialist (US24)</option>
              <option value="admin">Admin (US24)</option>
            </select>
          )}
        </Field>
        {values.role === 'clinic_user' && (
          <Field label="Clinic" error={errors.clinicId} required>
            {(p) => (
              <select {...p} className="form-select" value={values.clinicId} onChange={set('clinicId')}>
                <option value="">Choose a clinic…</option>
                {clinics.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.clinicCode})</option>)}
              </select>
            )}
          </Field>
        )}
        <div className="form-actions">
          <Link to={backTo} className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</button>
        </div>
      </form>
    </div>
  );
}

// --- M7: user detail ------------------------------------------------------------------------
export function UserDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [assignId, setAssignId] = useState('');

  const load = useCallback(() => api(`/admin/users/${id}`).then(setData).catch(setError), [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error?.status === 404) return <NotFoundPage />;
  if (error) return <div className="container"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <div className="container"><Spinner /></div>;
  const u = data.user;

  const run = async (fn, message) => {
    setBusy(true);
    try {
      const r = await fn();
      toast(r?.emailFailed ? "Saved, but the email couldn't be sent." : message, r?.emailFailed ? 'error' : 'success');
      setDialog(null);
      setAssignId('');
      await load();
    } catch (err) {
      toast(err.message, 'error');
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <BackBar to="/manage/users" label="Back to users" trail={['Users', u.fullName]} />
      {location.state?.message && <Alert tone={location.state.tone}>{location.state.message}</Alert>}
      <PageHeader title={u.fullName} subtitle={`${ROLE_LABELS[u.role]}${u.clinic ? ` · ${u.clinic.name}` : ''}`}>
        <StatusBadge status={u.status} />
        {u.status === 'invited' && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => run(() => api(`/admin/users/${id}/resend-invite`, { method: 'POST' }), 'Invitation resent.')}>
            Resend invitation
          </button>
        )}
        {u.status === 'active' && u.hasTotp && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('reset')}>Reset 2-step</button>
        )}
        {u.status !== 'deactivated' && !data.isSelf && (
          <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setDialog('deactivate')}>Deactivate</button>
        )}
        {u.status === 'deactivated' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('reactivate')}>Reactivate</button>
        )}
        {!data.isSelf && (
          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            onClick={() => setDialog('delete')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <IconTrash size={14} /> Delete user
          </button>
        )}
      </PageHeader>

      <div className="detail-columns-grid admin-grid">
        <section className="panel">
          <div className="panel-header"><h2>Account</h2></div>
          <dl className="summary-list">
            <div><dt>Email</dt><dd>{u.email}</dd></div>
            <div><dt>Role</dt><dd>{ROLE_LABELS[u.role]}</dd></div>
            {u.clinic && <div><dt>Clinic</dt><dd><Link to={`/manage/clinics/${u.clinic.id}`}>{u.clinic.name}</Link></dd></div>}
            <div><dt>Invited</dt><dd>{dateTime(u.invitedAt)}</dd></div>
            <div><dt>Last sign-in</dt><dd>{u.lastLogin ? dateTime(u.lastLogin) : 'Never'}</dd></div>
            <div><dt>2-step method</dt><dd>{u.hasTotp ? 'Authenticator app (email codes also available)' : 'Email code'}</dd></div>
            {u.deactivatedAt && <div><dt>Deactivated</dt><dd>{dateTime(u.deactivatedAt)}</dd></div>}
          </dl>
        </section>

        {u.role === 'specialist' && (
          <section className="panel">
            <div className="panel-header"><h2>Assigned clinics</h2></div>
            {data.assignments.length === 0 ? <p className="panel-empty">No clinics assigned.</p> : (
              <ul className="simple-list">
                {data.assignments.map((c) => (
                  <li key={c.id}>
                    <span><Link to={`/manage/clinics/${c.id}`}>{c.name}</Link> <span className="user-clinic-badge">{c.code}</span> {!c.isActive && <StatusBadge status="deactivated" />}</span>
                    <button type="button" className="btn-tertiary danger" onClick={() => setDialog({ unassign: c })}>Unassign</button>
                  </li>
                ))}
              </ul>
            )}
            {data.availableClinics.length > 0 && u.status !== 'deactivated' && (
              <div className="inline-form">
                <label htmlFor="assign-clinic" className="sr-only">Clinic to assign</label>
                <select id="assign-clinic" className="form-select" value={assignId} onChange={(e) => setAssignId(e.target.value)}>
                  <option value="">Assign a clinic…</option>
                  {data.availableClinics.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
                <button type="button" className="btn btn-primary btn-sm" disabled={!assignId || busy}
                  onClick={() => run(() => api(`/admin/users/${id}/clinics`, { method: 'POST', body: { clinicId: assignId } }), 'Clinic assigned.')}>
                  Assign
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      {dialog === 'deactivate' && (
        <ConfirmDialog title={`Deactivate ${u.fullName}?`} destructive busy={busy} confirmLabel="Deactivate"
          message={`${u.fullName} will be signed out now and can't sign in.`}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => api(`/admin/users/${id}/deactivate`, { method: 'POST' }), 'User deactivated.')} />
      )}
      {dialog === 'reactivate' && (
        <ConfirmDialog title={`Reactivate ${u.fullName}?`} busy={busy} confirmLabel="Reactivate"
          message="The user will be able to sign in again (or accept a new invitation if they never set a password)."
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => api(`/admin/users/${id}/reactivate`, { method: 'POST' }), 'User reactivated.')} />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={`Delete ${u.fullName} permanently?`}
          destructive
          busy={busy}
          confirmLabel={busy ? 'Deleting…' : 'Delete user'}
          message={`Are you sure you want to permanently delete "${u.fullName}" (${u.email}) from the database? This action cannot be undone.`}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api(`/admin/users/${id}`, { method: 'DELETE' });
              toast(`User "${u.fullName}" deleted from database.`, 'success');
              navigate('/manage/users');
            } catch (err) {
              toast(err.message || 'Failed to delete user.', 'error');
              setBusy(false);
            }
          }}
        />
      )}
      {dialog === 'reset' && (
        <ConfirmDialog title="Reset 2-step verification?" busy={busy} confirmLabel="Reset"
          message={`${u.fullName}'s authenticator app will be removed. They'll sign in with email codes until they set up a new one.`}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => api(`/admin/users/${id}/reset-2fa`, { method: 'POST' }), '2-step verification reset.')} />
      )}
      {dialog?.unassign && (
        <ConfirmDialog title="Unassign clinic?" destructive busy={busy} confirmLabel="Unassign"
          message={`${u.fullName} will lose access to ${dialog.unassign.name} immediately.`}
          onCancel={() => setDialog(null)}
          onConfirm={() => run(() => api(`/admin/users/${id}/clinics/${dialog.unassign.id}`, { method: 'DELETE' }), 'Clinic unassigned.')} />
      )}
    </div>
  );
}
