import { AuthError, CsrfError } from './errors.ts';
import { verifySession } from './session.ts';
import type { FunctionContext, SessionPayload } from './types.ts';

export const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function requireSession(context: FunctionContext): Promise<SessionPayload> {
  const session = context.data.session || await verifySession(context.request, context.env);
  context.data.session = session;
  return session;
}

export function requireCsrf(request: Request, session: SessionPayload): void {
  const supplied = request.headers.get('X-CSRF-Token');
  if (!supplied || supplied.length !== session.csrf.length) throw new CsrfError();
  let diff = 0;
  for (let index = 0; index < supplied.length; index += 1) diff |= supplied.charCodeAt(index) ^ session.csrf.charCodeAt(index);
  if (diff !== 0) throw new CsrfError();
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new CsrfError('Cross-origin request denied');
}

export function securityHeaders(): Headers {
  return new Headers({
    'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self'; script-src 'self'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
}

export function isAuthenticationPath(request: Request): boolean {
  return new URL(request.url).pathname === '/api/auth';
}

export function assertAuthenticatedApiPath(request: Request): void {
  if (!new URL(request.url).pathname.startsWith('/api/')) throw new AuthError();
}
