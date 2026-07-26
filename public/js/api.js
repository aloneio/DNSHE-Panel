let csrfToken = null;

export class ApiError extends Error {
  constructor(message, { status = 0, errorCode, details, requestId, upstream } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
    this.requestId = requestId;
    this.upstream = upstream;
  }
}

export function setCsrfToken(token) { csrfToken = token || null; }
export function getCsrfToken() { return csrfToken; }
export function isUnsafe(method) { return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method || 'GET').toUpperCase()); }

export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (isUnsafe(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  let response;
  try {
    response = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
  } catch (error) {
    if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
    throw new ApiError('Network request failed');
  }
  let payload;
  try { payload = await response.json(); }
  catch (error) {
    if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
    throw new ApiError('Server returned an invalid response', { status: response.status });
  }
  if (!response.ok || payload.success !== true) {
    if (method === 'GET' && response.status === 502 && payload.error_code === 'UPSTREAM_NETWORK_ERROR' && !options.__dnsheRetried) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 700));
      return apiFetch(path, { ...options, __dnsheRetried: true });
    }
    const error = new ApiError(payload.message || 'Request failed', { status: response.status, errorCode: payload.error_code, details: payload.details, requestId: payload.requestId, upstream: payload.upstream });
    if (response.status === 401) window.dispatchEvent(new CustomEvent('dnshe:unauthorized'));
    throw error;
  }
  return payload;
}

export function errorMessage(error) {
  const code = error?.errorCode ? ` [${error.errorCode}]` : '';
  const request = error?.requestId ? ` Request ${error.requestId}.` : '';
  if (error?.status === 429) {
    const remaining = error?.details?.remaining !== undefined ? ` ${error.details.remaining} request(s) remaining.` : '';
    const reset = error?.details?.reset_at ? ` Retry after ${error.details.reset_at}.` : '';
    return `${error.message || 'Rate limit exceeded'}${code}${remaining}${reset}${request}`;
  }
  if (error?.upstream) return `${error?.message || 'Request failed'}${code} Upstream ${error.upstream.endpoint}${error.upstream.action ? `/${error.upstream.action}` : ''} returned ${error.upstream.status}.${request}`;
  return `${error?.message || 'Unexpected error'}${code}${request}`;
}

export async function withLoading(button, task) {
  const previous = button?.textContent;
  if (button) { button.disabled = true; button.classList.add('is-loading'); }
  try { return await task(); }
  finally { if (button) { button.disabled = false; button.classList.remove('is-loading'); button.textContent = previous; } }
}
