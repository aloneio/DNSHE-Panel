import { RateLimitError } from './errors.ts';

interface Attempt { count: number; resetAt: number; }
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

/** Best-effort per-isolate login protection; use Cloudflare WAF/Access for durable global controls. */
export function assertLoginAllowed(request: Request, now = Date.now()): void {
  const key = clientKey(request);
  const entry = attempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    throw new RateLimitError('Too many login attempts', { limit: MAX_FAILURES, reset_at: new Date(entry.resetAt).toISOString() });
  }
  if (entry && entry.resetAt <= now) attempts.delete(key);
}

export function recordLoginFailure(request: Request, now = Date.now()): void {
  const key = clientKey(request);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else current.count += 1;
}

export function clearLoginFailures(request: Request): void { attempts.delete(clientKey(request)); }
export function resetRateLimitForTests(): void { attempts.clear(); }
