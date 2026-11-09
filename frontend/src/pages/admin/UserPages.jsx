import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { IconEdit, IconTrash } from '../../components/Icons.jsx';
import { Alert, BackBar, ConfirmDialog, EmptyState, Field, Modal, PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { ROLE_LABELS, dateTime, shortDate } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';

function useClinicOptions(status = 'active') {
  const [clinics, setClinics] = useState([]);
  useEffect(() => {
    api(`/admin/clinics?status=${status}`)
      .then((d) => {
        const sorted = (d.clinics || []).slice().sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        setClinics(sorted);
      })
      .catch(() => {});
  }, [status]);
  return clinics;
}

// --- M5: users list -------------------------------------------------------------------
export function UsersPage() {
  const clinics = useClinicOptions();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role') || '';
  const [filters, setFilters] = useState({ q: '', role: roleParam, status: '', clinicId: '' });

  useEffect(() => {
    const r = searchParams.get('role');
    if (r !== null) {
      setFilters((f) => ({ ...f, role: r }));
    }
  }, [searchParams]);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [deletingUser, setDeletingUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
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
      <PageHeader title="Users" subtitle="Manage clinic portal accounts and internal US24 staff access.">
        {filters.role === 'clinic_user' ? (
          <Link to="/manage/users/invite?tab=clinic" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            + Add Clinic User
          </Link>
        ) : filters.role === 'us24' || filters.role === 'admin' || filters.role === 'specialist' ? (
          <Link to="/manage/users/invite?tab=us24" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            + Add US24 User
          </Link>
        ) : (
          <div className="user-header-actions-wrap">
            <Link to="/manage/users/invite?tab=clinic" className="btn btn-secondary btn-sm">
              + Add Clinic User
            </Link>
            <Link to="/manage/users/invite?tab=us24" className="btn btn-primary btn-sm">
              + Add US24 User
            </Link>
          </div>
        )}
      </PageHeader>
      <div className="segmented-status-track" style={{ marginBottom: 16 }} role="tablist" aria-label="Filter user groups">
        <button
          type="button"
          className={`segmented-tab-btn ${!filters.role ? 'active' : ''}`}
          onClick={() => setFilters((f) => ({ ...f, role: '' }))}
          role="tab"
          aria-selected={!filters.role}
        >
          All Users
        </button>
        <button
          type="button"
          className={`segmented-tab-btn ${filters.role === 'clinic_user' ? 'active' : ''}`}
          onClick={() => setFilters((f) => ({ ...f, role: 'clinic_user' }))}
          role="tab"
          aria-selected={filters.role === 'clinic_user'}
        >
          Clinics
        </button>
        <button
          type="button"
          className={`segmented-tab-btn ${filters.role === 'us24' || filters.role === 'admin' || filters.role === 'specialist' ? 'active' : ''}`}
          onClick={() => setFilters((f) => ({ ...f, role: 'us24' }))}
          role="tab"
          aria-selected={filters.role === 'us24' || filters.role === 'admin' || filters.role === 'specialist'}
        >
          US24 Users
        </button>
      </div>
      <div className="filter-bar-sheet">
        <div className="filter-grid filter-grid-4">
          <div className="filter-item">
            <label htmlFor="u-q">Search name or email</label>
            <input id="u-q" type="search" className="form-input" value={filters.q} onChange={set('q')} />
          </div>
          <div className="filter-item">
            <label htmlFor="u-role">Role</label>
            <select id="u-role" className="form-select" value={filters.role} onChange={set('role')}>
              <option value="">All roles</option>
              <option value="clinic_user">Clinic Users</option>
              <option value="us24">US24 Users (Admin & Specialist)</option>
              <option value="admin">Admin (US24)</option>
              <option value="specialist">Specialist (US24)</option>
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
                  <th scope="col" style={{ textAlign: 'center', width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="row-static">
                    <td><Link to={`/manage/users/${u.id}`} className="strong-link">{u.fullName}</Link></td>
                    <td>{u.email}</td>
                    <td>
                      {u.role === 'clinic_user' && u.isClinicAdmin ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          Clinic User
                          <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, border: '1px solid #bfdbfe' }}>Admin</span>
                        </span>
                      ) : (
                        ROLE_LABELS[u.role]
                      )}
                    </td>
                    <td>{u.clinic?.name ?? '—'}</td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="col-date">{u.lastLogin ? shortDate(u.lastLogin) : 'Never'}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => setEditingUser(u)}
                        title={`Edit ${u.fullName}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6 }}
                      >
                        <IconEdit size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-outline btn-xs"
                        onClick={() => setDeletingUser(u)}
                        title={`Delete ${u.fullName} from database`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <IconTrash size={12} /> Delete
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

      {editingUser && (
        <EditUserModal
          user={editingUser}
          clinics={clinics}
          onClose={() => setEditingUser(null)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
}

// --- M6: invite user ----------------------------------------------------------------------
export function InviteUserPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clinics = useClinicOptions('active').filter((c) => c.isActive);

  const isUs24Initial = params.get('tab') === 'us24' || ['admin', 'specialist'].includes(params.get('role'));
  const [activeTab, setActiveTab] = useState(isUs24Initial ? 'us24' : 'clinic');

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    role: isUs24Initial ? (params.get('role') === 'admin' ? 'admin' : 'specialist') : 'clinic_user',
    clinicId: params.get('clinicId') ?? '',
    isClinicAdmin: false,
  });

  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const backTo = params.get('clinicId')
    ? `/manage/clinics/${params.get('clinicId')}`
    : `/manage/users?role=${activeTab === 'clinic' ? 'clinic_user' : 'us24'}`;

  const switchTab = (tab) => {
    setActiveTab(tab);
    setErrors({});
    setError(null);
    if (tab === 'clinic') {
      setValues((v) => ({ ...v, role: 'clinic_user', isClinicAdmin: false }));
    } else {
      setValues((v) => ({ ...v, role: 'specialist', clinicId: '', isClinicAdmin: false }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const selectedClinic = clinics.find((c) => c.id === values.clinicId);
      const derivedFullName = activeTab === 'clinic'
        ? (selectedClinic ? `${selectedClinic.name}${values.isClinicAdmin ? ' (Clinic Admin)' : ''}` : 'Clinic User')
        : values.fullName;

      const payload = {
        fullName: derivedFullName,
        email: values.email,
        role: activeTab === 'clinic' ? 'clinic_user' : (values.role || 'specialist'),
        clinicId: activeTab === 'clinic' ? values.clinicId : '',
        isClinicAdmin: activeTab === 'clinic' ? Boolean(values.isClinicAdmin) : false,
      };
      const d = await api('/admin/users', { method: 'POST', body: payload });
      navigate(`/manage/users/${d.id}`, {
        replace: true,
        state: {
          message: d.emailFailed
            ? "The user was created, but the invitation couldn't be sent. Use Resend invitation."
            : `User ${values.email} added successfully.`,
          tone: d.emailFailed ? 'warning' : 'success',
        },
      });
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="container page-narrow">
      <BackBar to={backTo} label="Back to users" trail={['Users', activeTab === 'clinic' ? 'Add Clinic User' : 'Add US24 User']} />
      <PageHeader
        title={activeTab === 'clinic' ? 'Add Clinic User' : 'Add US24 User'}
        subtitle={
          activeTab === 'clinic'
            ? 'Create a login account for clinic staff to access their patient statements and reports.'
            : 'Create an internal account for US24 billing specialists or system administrators.'
        }
      />

      {/* Action Tabs for Clinic User vs US24 User */}
      <div className="segmented-status-track" style={{ marginBottom: 20 }} role="tablist" aria-label="Add user type">
        <button
          type="button"
          className={`segmented-tab-btn ${activeTab === 'clinic' ? 'active' : ''}`}
          onClick={() => switchTab('clinic')}
          role="tab"
          aria-selected={activeTab === 'clinic'}
        >
          🏥 Clinic User
        </button>
        <button
          type="button"
          className={`segmented-tab-btn ${activeTab === 'us24' ? 'active' : ''}`}
          onClick={() => switchTab('us24')}
          role="tab"
          aria-selected={activeTab === 'us24'}
        >
          🏢 US24 User
        </button>
      </div>

      {error && (
        <Alert tone="error">
          {error.message}{' '}
          {error.data?.existingUserId && <Link to={`/manage/users/${error.data.existingUserId}`}>View that user</Link>}
        </Alert>
      )}

      <form className="panel form-panel" onSubmit={submit} noValidate>
        {activeTab === 'us24' && (
          <Field label="Full name" error={errors.fullName} required>
            {(p) => (
              <input
                {...p}
                className="form-input"
                placeholder="e.g. John Doe"
                value={values.fullName}
                onChange={set('fullName')}
              />
            )}
          </Field>
        )}
        <Field label="Email" error={errors.email} required>
          {(p) => (
            <input
              {...p}
              type="email"
              className="form-input"
              placeholder={activeTab === 'clinic' ? 'clinic.user@domain.com' : 'staff@us24solutions.com'}
              value={values.email}
              onChange={set('email')}
            />
          )}
        </Field>

        {activeTab === 'clinic' ? (
          <>
            <Field label="Clinic" error={errors.clinicId} required hint="Select which clinic this user can access">
              {(p) => (
                <select {...p} className="form-select" value={values.clinicId} onChange={set('clinicId')}>
                  <option value="">Choose a clinic…</option>
                  {clinics.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.clinicCode})</option>)}
                </select>
              )}
            </Field>

            <Field label="Clinic access level" hint="Admin users can view collection financial summaries and reports">
              {(p) => (
                <select
                  {...p}
                  className="form-select"
                  value={values.isClinicAdmin ? 'admin' : 'user'}
                  onChange={(e) => setValues((v) => ({ ...v, isClinicAdmin: e.target.value === 'admin' }))}
                >
                  <option value="user">User (Statements, remarks &amp; requests)</option>
                  <option value="admin">Admin (Full clinic portal + collection reports)</option>
                </select>
              )}
            </Field>
          </>
        ) : (
          <Field label="US24 Role" error={errors.role} required hint="Choose administrative or specialist billing permissions">
            {(p) => (
              <select {...p} className="form-select" value={values.role} onChange={set('role')}>
                <option value="specialist">Specialist (US24 Billing Specialist)</option>
                <option value="admin">Admin (Full US24 System Administrator)</option>
              </select>
            )}
          </Field>
        )}

        <div className="form-actions">
          <Link to={backTo} className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Adding…' : activeTab === 'clinic' ? 'Add Clinic User' : 'Add US24 User'}
          </button>
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
  const [editing, setEditing] = useState(false);
  const clinics = useClinicOptions();

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
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setEditing(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <IconEdit size={14} /> Edit user
        </button>
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

      {editing && (
        <EditUserModal
          user={u}
          clinics={clinics}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

export function EditUserModal({ user, clinics = [], onClose, onSaved }) {
  const [fullName, setFullName] = useState(user.fullName || '');
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState(user.role || 'clinic_user');
  const [clinicId, setClinicId] = useState(user.clinic?.id || '');
  const [isClinicAdmin, setIsClinicAdmin] = useState(Boolean(user.isClinicAdmin));
  const [status, setStatus] = useState(user.status || 'active');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const allClinics = [...clinics];
  if (user.clinic && !allClinics.some((c) => c.id === user.clinic.id)) {
    allClinics.push({ id: user.clinic.id, name: user.clinic.name, isActive: false });
  }
  allClinics.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setError(null);

    const errs = {};
    if (!fullName.trim()) errs.fullName = 'Enter the full name.';
    if (!email.trim()) errs.email = 'Enter a valid email address.';
    if (role === 'clinic_user' && !clinicId) errs.clinicId = 'Choose a clinic.';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setBusy(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        clinicId: role === 'clinic_user' ? clinicId : undefined,
        isClinicAdmin: role === 'clinic_user' ? isClinicAdmin : false,
        status,
      };
      await api(`/admin/users/${user.id}`, {
        method: 'PUT',
        body: payload,
      });
      toast(`User "${fullName.trim()}" updated successfully.`, 'success');
      onSaved?.();
      onClose();
    } catch (err) {
      if (err.details?.fieldErrors) {
        setErrors(err.details.fieldErrors);
      }
      setError(err.message || 'Failed to update user.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit User: ${user.fullName}`}
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <Alert tone="error" style={{ marginBottom: 16 }}>{error}</Alert>}

        <Field label="Full Name" required error={errors.fullName}>
          {(p) => (
            <input
              {...p}
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          )}
        </Field>

        <Field label="Email Address" required error={errors.email}>
          {(p) => (
            <input
              {...p}
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          )}
        </Field>

        <Field label="Role" required error={errors.role}>
          {(p) => (
            <select
              {...p}
              className="form-select"
              value={role}
              onChange={(e) => {
                const newRole = e.target.value;
                setRole(newRole);
                if (newRole !== 'clinic_user') {
                  setIsClinicAdmin(false);
                }
              }}
            >
              <option value="clinic_user">Clinic User</option>
              <option value="specialist">US24 Specialist</option>
              <option value="admin">US24 Admin</option>
            </select>
          )}
        </Field>

        {role === 'clinic_user' && (
          <>
            <Field label="Clinic" required error={errors.clinicId}>
              {(p) => (
                <select
                  {...p}
                  className="form-select"
                  value={clinicId}
                  onChange={(e) => setClinicId(e.target.value)}
                >
                  <option value="">Select clinic…</option>
                  {allClinics.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.isActive === false ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <div className="form-group" style={{ marginTop: 8, marginBottom: 16 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={isClinicAdmin}
                  onChange={(e) => setIsClinicAdmin(e.target.checked)}
                />
                <span>Grant Clinic Admin privileges (Access to collection reports)</span>
              </label>
            </div>
          </>
        )}

        <Field label="Account Status" error={errors.status}>
          {(p) => (
            <select
              {...p}
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {user.status === 'invited' ? (
                <>
                  <option value="invited">Invited (Awaiting user setup)</option>
                  <option value="deactivated">Deactivated</option>
                </>
              ) : (
                <>
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                </>
              )}
            </select>
          )}
        </Field>
        {user.status === 'invited' && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', marginTop: -6, marginBottom: 12 }}>
            Note: User is currently pending invitation acceptance. Setting to active occurs when the user completes password setup.
          </p>
        )}
      </form>
    </Modal>
  );
}
