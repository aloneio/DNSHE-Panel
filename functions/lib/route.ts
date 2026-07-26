import { jsonError, requestIdFor } from './http.ts';
import { requireCsrf, requireSession, UNSAFE_METHODS } from './security.ts';
import type { FunctionContext } from './types.ts';

/** Keeps direct handler tests and non-middleware execution secure. */
export async function protect(context: FunctionContext): Promise<string> {
  const requestId = requestIdFor(context);
  context.data.requestId = requestId;
  const session = await requireSession(context);
  if (UNSAFE_METHODS.has(context.request.method)) requireCsrf(context.request, session);
  return requestId;
}

export async function secured(context: FunctionContext, handler: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = requestIdFor(context);
  try {
    await protect(context);
    return await handler(requestId);
  } catch (error) {
    return jsonError(requestId, error);
  }
}
