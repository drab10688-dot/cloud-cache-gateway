/**
 * MikroTik API Client — Device-based connection via VPS backend proxy.
 * Inspired by MikroTik Connect Hub architecture.
 * Frontend → VPS API → MikroTik REST API (RouterOS v7+ or API v6)
 */

export interface MikroTikDevice {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  version: 'v7' | 'v6';
  connected?: boolean;
  identity?: string;
  routeros_version?: string;
}

// ─── Storage ──────────────────────────────────────────────

const DEVICE_KEY = 'mk-device';

export function saveDevice(device: MikroTikDevice) {
  localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
}

export function getDevice(): MikroTikDevice | null {
  const raw = localStorage.getItem(DEVICE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearDevice() {
  localStorage.removeItem(DEVICE_KEY);
}

// ─── API Error ────────────────────────────────────────────

export class MikroTikApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'MikroTikApiError';
  }
}

// ─── Fetch with timeout ──────────────────────────────────

async function mkFetch<T = any>(
  path: string,
  options: { method?: string; body?: any; timeoutMs?: number } = {}
): Promise<T> {
  const { method = 'GET', body, timeoutMs = method === 'GET' ? 15000 : 30000 } = options;
  const token = localStorage.getItem('netadmin-token') || '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new MikroTikApiError(
        `Timeout (${Math.ceil(timeoutMs / 1000)}s). Verifica que el MikroTik sea accesible desde el VPS.`,
        408
      );
    }
    throw new MikroTikApiError(error?.message || 'Error de conexión con la API', 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorData: any;
    try { errorData = await response.json(); } catch { errorData = null; }
    throw new MikroTikApiError(
      errorData?.error || errorData?.message || `Error ${response.status}`,
      response.status,
      errorData
    );
  }

  const text = await response.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return text as T; }
}

// ─── Device API ───────────────────────────────────────────

export const mikrotikDeviceApi = {
  /** Save config to VPS and test connection */
  connect: async (host: string, username: string, password: string, port: number = 443, version: 'v7' | 'v6' = 'v7') => {
    // Save config to backend
    await mkFetch('/mikrotik/config', {
      method: 'POST',
      body: { host, user: username, password, port, version },
    });

    // Test connection
    const result = await mkFetch<{
      success: boolean;
      identity?: string;
      version?: string;
      error?: string;
    }>('/mikrotik/test', { method: 'POST', timeoutMs: 20000 });

    if (!result.success) {
      throw new MikroTikApiError(result.error || 'No se pudo conectar al MikroTik', 502);
    }

    // Save device locally
    const device: MikroTikDevice = {
      id: `${host}:${port}`,
      name: result.identity || host,
      host,
      port,
      username,
      version,
      connected: true,
      identity: result.identity,
      routeros_version: result.version,
    };
    saveDevice(device);
    return device;
  },

  /** Quick reconnect test with saved config */
  testConnection: async () => {
    const result = await mkFetch<{
      success: boolean;
      identity?: string;
      version?: string;
      error?: string;
    }>('/mikrotik/test', { method: 'POST', timeoutMs: 15000 });
    return result;
  },

  /** Get saved config from backend */
  getConfig: () => mkFetch<{ host?: string; user?: string; port?: number; version?: string }>('/mikrotik/config'),

  /** Execute commands on the MikroTik */
  execute: (commands: string[]) =>
    mkFetch<{ success: boolean; message?: string; error?: string; results?: any[] }>(
      '/mikrotik/execute',
      { method: 'POST', body: { commands }, timeoutMs: 30000 }
    ),

  /** Disconnect / clear config */
  disconnect: () => {
    clearDevice();
  },
};
