import { getRequestId, jsonError, withRequestId } from './lib/http.ts';
import { isAuthenticationPath, requireCsrf, requireSession, securityHeaders, UNSAFE_METHODS } from './lib/security.ts';
import type { FunctionContext } from './lib/types.ts';

export const onRequest = async (context: FunctionContext): Promise<Response> => {
  const requestId = getRequestId(context.request);
  context.data.requestId = requestId;
  try {
    const path = new URL(context.request.url).pathname;
    if (path.startsWith('/api/') && !isAuthenticationPath(context.request)) {
      const session = await requireSession(context);
      if (UNSAFE_METHODS.has(context.request.method)) requireCsrf(context.request, session);
    }
    if (!context.next) throw new Error('Pages context.next is unavailable');
    const response = await context.next();
    const headers = new Headers(response.headers);
    securityHeaders().forEach((value, name) => headers.set(name, value));
    headers.set('X-Request-Id', requestId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const response = jsonError(requestId, error);
    const headers = new Headers(response.headers);
    securityHeaders().forEach((value, name) => headers.set(name, value));
    return new Response(response.body, { status: response.status, headers });
  }
};
