// Thin fetch wrapper for the My Patient API. Every state-changing request sends
// the custom header the server requires as its CSRF defence.

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Something went wrong. Please try again.');
    this.status = status;
    this.data = data || {};
    this.fieldErrors = data?.fieldErrors || {};
  }
}

let unauthorizedHandler = null;
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

// --- Activity clock (FR-1.9) -------------------------------------------------
// The server extends the session on every API call, so the last call time is
// the last activity. Shared across tabs through localStorage when available.
const ACTIVITY_KEY = 'mp:lastActivity';
let lastActivity = Date.now();

export const activity = {
  touch() {
    lastActivity = Date.now();
    try {
      localStorage.setItem(ACTIVITY_KEY, String(lastActivity));
    } catch {
      /* storage unavailable: this tab's clock still works */
    }
  },
  get() {
    try {
      const shared = Number(localStorage.getItem(ACTIVITY_KEY));
      if (shared > lastActivity) lastActivity = shared;
    } catch {
      /* ignore */
    }
    return lastActivity;
  },
  set(ts) {
    lastActivity = ts;
  },
};

export async function api(path, { method = 'GET', body, form, skipActivity = false } = {}) {
  const headers = { 'X-Requested-With': 'MyPatient' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: "Couldn't reach the server. Check your connection and try again." });
  }
  if (!path.startsWith('/auth/session-status') && !path.startsWith('/notifications') && !skipActivity) activity.touch();

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = res.status === 204 ? null : isJson ? await res.json() : null;

  if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.(data);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Downloads a file from the API (the server records the download before sending it). */
export async function downloadFile(path, fallbackName = 'download') {
  const normalizedPath = path.startsWith('/api') ? path.slice(4) : path;
  const res = await fetch(`/api${normalizedPath}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'MyPatient' } });
  activity.touch();
  if (!res.ok) {
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
    if (res.status === 401) unauthorizedHandler?.(data);
    throw new ApiError(res.status, data);
  }
  const disposition = res.headers.get('content-disposition') || '';
  const name = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file in a new browser tab using an authenticated Blob URL (immune to CSP/SameSite issues). */
export async function viewFileInTab(path, fallbackName = 'document') {
  const normalizedPath = path.startsWith('/api') ? path.slice(4) : path;
  const res = await fetch(`/api${normalizedPath}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'MyPatient' } });
  activity.touch();
  if (!res.ok) {
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
    if (res.status === 401) unauthorizedHandler?.(data);
    throw new ApiError(res.status, data);
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const blob = await res.blob();
  const typedBlob = new Blob([blob], { type: contentType });
  const url = URL.createObjectURL(typedBlob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
