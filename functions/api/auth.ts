import { AppError, ValidationError } from '../lib/errors.ts';
import { jsonError, jsonOk, methodNotAllowed, parseJsonBody, requestIdFor } from '../lib/http.ts';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from '../lib/rate_limit.ts';
import { requireCsrf, requireSession } from '../lib/security.ts';
import { clearSessionCookie, createSession, sessionCookie } from '../lib/session.ts';
import type { FunctionContext } from '../lib/types.ts';

async function passwordsMatch(supplied: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [actual, target] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const a = new Uint8Array(actual);
  const b = new Uint8Array(target);
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  const requestId = requestIdFor(context);
  context.data.requestId = requestId;
  try {
    if (context.request.method === 'POST') {
      assertLoginAllowed(context.request);
      const body = await parseJsonBody<{ password?: unknown; remember?: unknown }>(context.request);
      if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 1024) throw new ValidationError('password must be a non-empty string');
      if (body.remember !== undefined && typeof body.remember !== 'boolean') throw new ValidationError('remember must be a boolean');
      const configured = context.env.DNS_PANEL_PASSWORD;
      if (!configured || !context.env.DNS_PANEL_SESSION_SECRET || context.env.DNS_PANEL_SESSION_SECRET.length < 32) {
        throw new AppError('Authentication service is not configured', 500, { errorCode: 'AUTH_CONFIGURATION_ERROR' });
      }
      if (!await passwordsMatch(body.password, configured)) {
        recordLoginFailure(context.request);
        throw new AppError('Invalid password', 401, { errorCode: 'INVALID_CREDENTIALS' });
      }
      clearLoginFailures(context.request);
      const session = await createSession(context.env);
      return jsonOk(requestId, { authenticated: true, expiresAt: new Date(session.payload.exp * 1000).toISOString(), csrfToken: session.payload.csrf }, {
        headers: { 'Set-Cookie': sessionCookie(session.token, session.maxAge) }
      });
    }
    if (context.request.method === 'GET') {
      const session = await requireSession(context);
      return jsonOk(requestId, { authenticated: true, expiresAt: new Date(session.exp * 1000).toISOString(), csrfToken: session.csrf });
    }
    if (context.request.method === 'DELETE') {
      const session = await requireSession(context);
      requireCsrf(context.request, session);
      return jsonOk(requestId, { authenticated: false }, { headers: { 'Set-Cookie': clearSessionCookie() } });
    }
    return methodNotAllowed(requestId, ['GET', 'POST', 'DELETE']);
  } catch (error) {
    return jsonError(requestId, error);
  }
}
