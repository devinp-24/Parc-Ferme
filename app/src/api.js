// The one place the frontend talks to the server. Relative URLs: Vite proxies
// /api in development, and in production the server serves this app itself.
import { ownerToken } from './lib/owner.js';

// Every request carries the owner token when there is one. Reads never need
// it; writes do once the server has ADMIN_TOKEN set.
const withAuth = (headers = {}) => {
  const token = ownerToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
};

async function json(res) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok) {
    const error = new Error(body.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

const send = (method, url, data) =>
  fetch(url, {
    method,
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: data === undefined ? undefined : JSON.stringify(data),
  }).then(json);

export const api = {
  auth: () => fetch('/api/auth', { headers: withAuth() }).then(json),
  catalogue: () => fetch('/api/catalogue').then(json),
  garage: () => fetch('/api/garage').then(json),
  history: (id) => fetch(`/api/history/${id}`).then(json),
  patchCar: (id, patch) => send('PATCH', `/api/garage/cars/${id}`, patch),
  bulk: (ids, patch) => send('POST', '/api/garage/bulk', { ids, patch }),
  setWallet: (wallet) => send('PUT', '/api/garage/wallet', { wallet }),
  importGarage: (data) => send('POST', '/api/garage/import', data),
  sync: (options = {}) => send('POST', '/api/sync', options),
  syncStatus: () => fetch('/api/sync/status').then(json),
};

export const photoUrl = (id, shot = '2_01', width = 800) => `/api/images/car/${id}/${shot}?w=${width}`;
// v=2: logos are now redrawn as light monochrome on the server; the version
// keeps browsers from showing the month-cached originals.
export const logoUrl = (makerId) => `/api/images/logo/${makerId}?v=2`;
export const EXPORT_URL = '/api/garage/export';
