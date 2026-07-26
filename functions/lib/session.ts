import { AuthError } from './errors.ts';
import type { Env, SessionPayload } from './types.ts';

const COOKIE_NAME = 'dnshe_session';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new AuthError('Invalid session');
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const decoded = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (base64UrlEncode(decoded) !== input) throw new AuthError('Invalid session');
  return decoded;
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(payload: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let value = 0;
  for (let index = 0; index < a.length; index += 1) value |= a[index] ^ b[index];
  return value === 0;
}

function maxAge(env: Env): number {
  const candidate = Number(env.DNS_PANEL_SESSION_MAX_AGE_SECONDS || '28800');
  return Number.isInteger(candidate) && candidate >= 300 && candidate <= 60 * 60 * 24 * 30 ? candidate : 28800;
}

function requireSecret(env: Env): string {
  const secret = env.DNS_PANEL_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new AuthError('Session service is not configured');
  return secret;
}

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers.get('Cookie')?.split(';').map((piece) => piece.trim()).find((piece) => piece.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function createSession(env: Env, now = Math.floor(Date.now() / 1000)): Promise<{ token: string; payload: SessionPayload; maxAge: number }> {
  const secret = requireSecret(env);
  const age = maxAge(env);
  const payload: SessionPayload = {
    iat: now,
    exp: now + age,
    csrf: base64UrlEncode(crypto.getRandomValues(new Uint8Array(32))),
    nonce: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)))
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return { token: `${encoded}.${await sign(encoded, secret)}`, payload, maxAge: age };
}

export async function verifySession(request: Request, env: Env, now = Math.floor(Date.now() / 1000)): Promise<SessionPayload> {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) throw new AuthError();
  const parts = token.split('.');
  if (parts.length !== 2) throw new AuthError('Invalid session');
  const secret = requireSecret(env);
  const expected = await sign(parts[0], secret);
  let equal = false;
  try { equal = constantTimeEqual(base64UrlDecode(expected), base64UrlDecode(parts[1])); } catch { throw new AuthError('Invalid session'); }
  if (!equal) throw new AuthError('Invalid session');
  try {
    const payload = JSON.parse(decoder.decode(base64UrlDecode(parts[0]))) as SessionPayload;
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= now || payload.iat > now + 60 || !/^[A-Za-z0-9_-]{32,}$/.test(payload.csrf) || !/^[A-Za-z0-9_-]{16,}$/.test(payload.nonce)) {
      throw new AuthError('Session expired or invalid');
    }
    return payload;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('Invalid session');
  }
}

export function sessionCookie(token: string, age: number): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function getCookieName(): string { return COOKIE_NAME; }
