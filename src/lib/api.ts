// API client for NetAdmin backend on VPS
const API_BASE = '/api';

let authToken = localStorage.getItem('netadmin-token') || '';

export function setToken(token: string) {
  authToken = token;
  localStorage.setItem('netadmin-token', token);
}

export function getToken() {
  return authToken;
}

export function clearToken() {
  authToken = '';
  localStorage.removeItem('netadmin-token');
}

export function isAuthenticated() {
  return !!authToken;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('No autorizado');
  }
  return res.json();
}

// Auth
export const api = {
  login: (password: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then(r => r.json()),

  // Services
  getServices: () => apiFetch('/services'),
  getSystem: () => apiFetch('/system'),

  // Ping
  getPing: () => apiFetch('/ping'),
  getDowntime: () => apiFetch('/ping/downtime'),

  // AdGuard
  getAdGuardStatus: () => apiFetch('/adguard/status'),
  getAdGuardStats: () => apiFetch('/adguard/stats'),
  getAdGuardQueryLog: () => apiFetch('/adguard/querylog'),
  getAdGuardFiltering: () => apiFetch('/adguard/filtering'),
  addFilter: (url: string, name: string) =>
    apiFetch('/adguard/filtering/add', { method: 'POST', body: JSON.stringify({ url, name }) }),
  removeFilter: (url: string) =>
    apiFetch('/adguard/filtering/remove', { method: 'POST', body: JSON.stringify({ url }) }),

  // Local blocklist
  getBlocklist: () => apiFetch('/blocklist'),
  addToBlocklist: (domain: string) =>
    apiFetch('/blocklist/add', { method: 'POST', body: JSON.stringify({ domain }) }),
  removeFromBlocklist: (domain: string) =>
    apiFetch('/blocklist/remove', { method: 'POST', body: JSON.stringify({ domain }) }),
  getBlocklistUpdateStatus: () => apiFetch('/blocklist/update-status'),
  getBlocklistUpdateLog: () => apiFetch('/blocklist/update-log'),
  triggerBlocklistUpdate: () => apiFetch('/blocklist/update-now', { method: 'POST' }),

  // Cache
  getCacheSquid: () => apiFetch('/cache/squid'),
  getCacheLancache: () => apiFetch('/cache/lancache'),
  getCacheApt: () => apiFetch('/cache/apt'),
  getCacheNginx: () => apiFetch('/cache/nginx'),

  // Kuma
  getKumaMonitors: () => apiFetch('/kuma/monitors'),

  // Tunnel
  getTunnelStatus: () => apiFetch('/tunnel/status'),
  startTunnel: (token?: string) =>
    apiFetch('/tunnel/start', { method: 'POST', body: JSON.stringify({ token }) }),
  stopTunnel: () =>
    apiFetch('/tunnel/stop', { method: 'POST' }),

  // Docker containers
  getContainers: () => apiFetch('/docker/containers'),
  startContainer: (name: string) =>
    apiFetch('/docker/start', { method: 'POST', body: JSON.stringify({ name }) }),
  stopContainer: (name: string) =>
    apiFetch('/docker/stop', { method: 'POST', body: JSON.stringify({ name }) }),
  restartContainer: (name: string) =>
    apiFetch('/docker/restart', { method: 'POST', body: JSON.stringify({ name }) }),

  // DNS config
  getDnsConfig: () => apiFetch('/dns/config'),
  setDnsConfig: (primary: string, secondary: string) =>
    apiFetch('/dns/config', { method: 'POST', body: JSON.stringify({ primary, secondary }) }),
};
