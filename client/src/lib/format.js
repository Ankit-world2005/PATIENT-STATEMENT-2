const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Money from the API's 2-decimal strings. Negative balances are credits. */
export function money(value, { credit = true } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  const s = `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n < 0) return credit ? `-${s} (credit)` : `-${s}`;
  return s;
}

/** Calendar dates ('YYYY-MM-DD') shown without time-zone shifting. */
export function date(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')}, ${y}`;
}

/** Timestamps in the viewer's own time zone, with the zone label (TRD Q8). */
export function dateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

export function shortDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export const ROLE_LABELS = { admin: 'Admin', specialist: 'US24 Specialist', clinic_user: 'Clinic User' };

export const STATUS_LABELS = {
  published: 'Published',
  partially_imported: 'Partially imported',
  failed: 'Failed',
  previewed: 'Awaiting review',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
  active: 'Active',
  invited: 'Invited',
  deactivated: 'Deactivated',
};

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function landingPath(user) {
  if (!user) return '/login';
  return '/home';
}

export function fileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
