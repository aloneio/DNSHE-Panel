import type { Env } from './types.ts';

const SENSITIVE_KEY = /(?:api[_-]?(?:key|secret)|x-api-secret|authorization|cookie|session|password|cloudflare_zone_id|provider_account_id|^content$|^txt$)/i;

export function redact(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  }
  return value;
}

function emit(level: 'debug' | 'warn' | 'error', env: Env | undefined, message: string, meta?: unknown): void {
  if (level === 'debug' && env?.DEBUG !== 'true') return;
  const safeMeta = meta === undefined ? undefined : redact(meta);
  const logger = level === 'debug' ? console.debug : level === 'warn' ? console.warn : console.error;
  if (safeMeta === undefined) logger(message);
  else logger(message, safeMeta);
}

export function debug(env: Env, message: string, meta?: unknown): void { emit('debug', env, message, meta); }
export function warn(env: Env | undefined, message: string, meta?: unknown): void { emit('warn', env, message, meta); }
export function error(env: Env | undefined, message: string, meta?: unknown): void { emit('error', env, message, meta); }
