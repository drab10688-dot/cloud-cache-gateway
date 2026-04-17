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

async function apiFetch(path: string, options: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...rest.headers,
      },
    });
  } catch (e: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      throw new Error(`Timeout (${Math.ceil((timeoutMs || 0) / 1000)}s) — la operación sigue corriendo en el servidor; recarga la página en unos minutos.`);
    }
    throw new Error('No se pudo contactar al servidor (red o nginx caído)');
  }
  if (timeoutId) clearTimeout(timeoutId);

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('No autorizado');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error || body?.message || JSON.stringify(body).slice(0, 300);
    } catch {
      try { detail = (await res.text()).slice(0, 300); } catch { /* empty */ }
    }
    if (res.status === 504 || res.status === 502) {
      throw new Error(`Gateway timeout (${res.status}) — el build tardó más que nginx. El proceso puede seguir en el servidor; recarga en 2-3 minutos.`);
    }
    throw new Error(`HTTP ${res.status}${detail ? ': ' + detail : ''}`);
  }

  try {
    return await res.json();
  } catch {
    return { success: true };
  }
}

// Auth
export const api = {
  login: (password: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).then(r => r.json()),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

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

  // QUIC / Network Performance
  getQuicStatus: () => apiFetch('/network/quic-status'),
  blockQuic: () => apiFetch('/network/quic-block', { method: 'POST' }),
  unblockQuic: () => apiFetch('/network/quic-unblock', { method: 'POST' }),
  getVideoStats: () => apiFetch('/network/video-stats'),
  getTcpOptimization: () => apiFetch('/network/tcp-optimization'),

  // System updates
  updateDockerImages: () => apiFetch('/system/update-docker', { method: 'POST' }),
  updatePanel: () => apiFetch('/system/update-panel', { method: 'POST' }),

  // Speed Test
  speedTestPing: () => fetch(`${API_BASE}/speedtest/ping?t=${Date.now()}`, { cache: 'no-store' }),
  speedTestDownload: (sizeMB: number) =>
    fetch(`${API_BASE}/speedtest/download?size=${sizeMB}&t=${Date.now()}`, { cache: 'no-store' }),
  speedTestUpload: (data: ArrayBuffer) =>
    fetch(`${API_BASE}/speedtest/upload`, {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'application/octet-stream' },
    }),

  // MikroTik REST API proxy
  mikrotikExecute: (commands: string[]) =>
    apiFetch('/mikrotik/execute', { method: 'POST', body: JSON.stringify({ commands }) }),
  mikrotikTest: () => apiFetch('/mikrotik/test'),
  mikrotikConfig: (host: string, user: string, password: string) =>
    apiFetch('/mikrotik/config', { method: 'POST', body: JSON.stringify({ host, user, password }) }),
  mikrotikGetConfig: () => apiFetch('/mikrotik/config'),

  // Server Monitor
  getServerMonitor: () => apiFetch('/system/monitor'),

  // Cache Stats (Lancache / apt-cacher-ng / Nginx)
  getCacheStats: () => apiFetch('/cache/stats'),

  // Telegram alerts
  getTelegramConfig: () => apiFetch('/telegram/config'),
  setTelegramConfig: (botToken: string, chatId: string, enabled: boolean) =>
    apiFetch('/telegram/config', { method: 'POST', body: JSON.stringify({ botToken, chatId, enabled }) }),
  sendTelegramTest: () => apiFetch('/telegram/test', { method: 'POST' }),
  sendTelegramAlert: (message: string) =>
    apiFetch('/telegram/send', { method: 'POST', body: JSON.stringify({ message }) }),
};
