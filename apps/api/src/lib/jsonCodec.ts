/**
 * Unified JSON serialization/deserialization helpers for SQL Server String columns.
 * Keeps external HTTP API contracts and frontend types identical to native JSON.
 */

export function stringifyJson(value: unknown, fallback = '{}'): string {
  if (value === undefined) {
    return fallback;
  }
  return JSON.stringify(value);
}

export function stringifyNullableJson(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

export function parseJson<T = unknown>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  if (typeof raw !== 'string') {
    return raw as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseNullableJson<T = unknown>(raw: unknown): T | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  if (typeof raw !== 'string') {
    return raw as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
