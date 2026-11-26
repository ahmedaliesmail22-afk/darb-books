const API_BASE_STORAGE_KEY = 'darb_api_base';
const TOKENS_STORAGE_KEY = 'darb_auth_tokens_v1';

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
}

declare global {
  interface Window {
    __DARB_API_BASE__?: string;
  }
}

export function resolveApiBaseUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const apiParam = url.searchParams.get('api');
    if (apiParam !== null) {
      const cleaned = apiParam.trim().replace(/\/+$/, '');
      if (cleaned === 'off' || cleaned === 'static') {
        localStorage.removeItem(API_BASE_STORAGE_KEY);
        return null;
      }
      if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        localStorage.setItem(API_BASE_STORAGE_KEY, cleaned);
        return cleaned;
      }
    }
  } catch {
    // ignore malformed URL
  }

  if (typeof window !== 'undefined' && window.__DARB_API_BASE__) {
    return window.__DARB_API_BASE__.replace(/\/+$/, '');
  }

  const envUrl = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  try {
    const saved = localStorage.getItem(API_BASE_STORAGE_KEY);
    if (saved && saved.trim().length > 0) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // ignore storage errors
  }

  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  if (isDev) {
    return '';
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const port = typeof window !== 'undefined' ? window.location.port : '';
  if (host.endsWith('github.io') || port === '4173') {
    return null;
  }

  return '';
}

export function getStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTokens;
    return parsed?.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredTokens(tokens: StoredTokens | null): void {
  try {
    if (!tokens) {
      localStorage.removeItem(TOKENS_STORAGE_KEY);
    } else {
      localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
    }
  } catch {
    // ignore storage quota
  }
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshSession(apiBase: string): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const tokens = getStoredTokens();
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens?.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      });
      if (!res.ok) {
        setStoredTokens(null);
        return false;
      }
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (data.accessToken) {
        setStoredTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken ?? tokens?.refreshToken,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    apiBase?: string | null;
    skipRefresh?: boolean;
  } = {}
): Promise<T> {
  const base = options.apiBase !== undefined ? options.apiBase : resolveApiBaseUrl();
  if (base === null) {
    throw new ApiError(0, 'STATIC_MODE', 'المنصة تعمل حالياً بوضع العرض الثابت دون خادم API');
  }

  const makeFetch = async () => {
    const tokens = getStoredTokens();
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (tokens?.accessToken) {
      headers.Authorization = `Bearer ${tokens.accessToken}`;
    }

    return fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await makeFetch();

  if (res.status === 401 && !options.skipRefresh && path !== '/api/v1/auth/login') {
    const refreshed = await tryRefreshSession(base);
    if (refreshed) {
      res = await makeFetch();
    }
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new ApiError(res.status, 'NON_JSON_RESPONSE', 'الاستجابة ليست من خادم API');
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(json.error ?? 'API_ERROR'),
      String(json.message ?? json.error ?? 'حدث خطأ أثناء الاتصال بالخادم'),
      json
    );
  }

  return json as T;
}

export function resolveMediaBaseUrl(
  rawDir: string | null | undefined,
  apiBase: string | null
): string {
  const cleaned = (rawDir ?? '')
    .trim()
    .replace(/^\.\.\//, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
  }
  const normalized = cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
  if (apiBase !== null) {
    return `${apiBase}/api/v1/media/stream/${normalized}`;
  }
  return `./${normalized}`;
}
