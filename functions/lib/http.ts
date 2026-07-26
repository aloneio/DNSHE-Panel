import { AppError, ValidationError, toApiError } from './errors.ts';
import type { FunctionContext, Pagination } from './types.ts';

const MAX_JSON_BYTES = 64 * 1024;

export function getRequestId(request: Request): string {
  const supplied = request.headers.get('CF-Ray') || request.headers.get('X-Request-Id');
  if (supplied && /^[A-Za-z0-9._-]{8,128}$/.test(supplied)) return supplied;
  return crypto.randomUUID();
}

export function requestIdFor(context: Pick<FunctionContext, 'request' | 'data'>): string {
  return context.data.requestId || getRequestId(context.request);
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function jsonOk<T>(requestId: string, data: T, options: { status?: number; pagination?: Pagination; partialErrors?: unknown[]; headers?: HeadersInit } = {}): Response {
  const body = {
    success: true as const,
    data,
    requestId,
    ...(options.pagination ? { pagination: options.pagination } : {}),
    ...(options.partialErrors && options.partialErrors.length ? { partialErrors: options.partialErrors } : {})
  };
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Request-Id', requestId);
  return new Response(JSON.stringify(body), { status: options.status || 200, headers });
}

export function jsonError(requestId: string, error: unknown): Response {
  const converted = toApiError(error, requestId);
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId });
  return new Response(JSON.stringify(converted.body), { status: converted.status, headers });
}

export function methodNotAllowed(requestId: string, allowed: string[]): Response {
  return jsonError(requestId, new AppError('Method not allowed', 405, { errorCode: 'METHOD_NOT_ALLOWED', details: { allowed } }));
}

export async function parseJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  const declaredSize = Number(request.headers.get('Content-Length') || '0');
  if (Number.isFinite(declaredSize) && declaredSize > MAX_JSON_BYTES) throw new ValidationError('Request body is too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) throw new ValidationError('Request body is too large');
  if (!raw.trim()) throw new ValidationError('Request body must be valid JSON');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ValidationError('Request body must be a JSON object');
    return parsed as T;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Request body must be valid JSON');
  }
}
