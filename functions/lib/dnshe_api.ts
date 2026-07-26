import { AppError } from './errors.ts';

function bodyStatus(errorCode: unknown): number {
  const code = typeof errorCode === 'string' ? errorCode.toLowerCase() : '';
  if (code === 'bad_request') return 400;
  if (code === 'auth_invalid_credentials') return 401;
  if (code.includes('insufficient_balance')) return 402;
  if (code === 'auth_ip_not_allowed' || code === 'api_access_disabled' || code === 'feature_disabled' || code.includes('renewal_disabled') || code.includes('renewal_window_expired') || code.includes('redemption_period')) return 403;
  if (code === 'not_found' || code.endsWith('_not_found')) return 404;
  if (code === 'renewal_not_yet_available') return 422;
  if (code === 'quota_exceeded' || code === 'rate_limit_exceeded' || code === 'rate_limited') return 429;
  if (code === 'internal_error') return 500;
  return 502;
}

function networkReason(cause: unknown): string {
  if (!(cause instanceof Error)) return 'Unknown network failure';
  const nested = (cause as Error & { cause?: { name?: unknown; message?: unknown; code?: unknown } }).cause;
  const parts = [cause.name, cause.message, typeof nested?.name === 'string' ? nested.name : undefined, typeof nested?.message === 'string' ? nested.message : undefined, typeof nested?.code === 'string' ? nested.code : undefined].filter(Boolean);
  return parts.join(': ') || 'Unknown network failure';
}

function alternateDnsheUrl(url: URL): URL | undefined {
  if (url.hostname === 'api005.dnshe.com') { const alternate = new URL(url); alternate.hostname = 'my.dnshe.com'; return alternate; }
  if (url.hostname === 'my.dnshe.com') { const alternate = new URL(url); alternate.hostname = 'api005.dnshe.com'; return alternate; }
  return undefined;
}

export class DNSHEApiError extends AppError {
  constructor(message: string, status: number, endpoint: string, action?: string, errorCode?: string, details?: unknown) {
    super(message, status, { errorCode, details, upstream: { endpoint, ...(action ? { action } : {}), status } });
    this.name = 'DNSHEApiError';
  }
}

export class DNSHESubdomainAPI {
  constructor(
    readonly baseUrl: string,
    readonly apiKey = '',
    readonly apiSecret = '',
    readonly fetcher: typeof fetch = fetch
  ) {}

  async request(endpoint: string, action?: string, method = 'GET', data?: Record<string, unknown> | object): Promise<Record<string, any>> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('m', 'domain_hub');
    url.searchParams.set('endpoint', endpoint);
    if (action) url.searchParams.set('action', action);
    if (method === 'GET' && data) {
      for (const [key, value] of Object.entries(data)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ 'Accept': 'application/json', 'User-Agent': 'DNSHE-Panel/1.0' });
    if (this.apiKey) headers.set('X-API-Key', this.apiKey);
    if (this.apiSecret) headers.set('X-API-Secret', this.apiSecret);
    const init: RequestInit = { method, headers, redirect: 'follow' };
    if (method !== 'GET' && data) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
    }
    let response: Response;
    try {
      response = await this.fetcher(url.toString(), init);
    } catch (primaryCause) {
      const alternate = method === 'GET' ? alternateDnsheUrl(url) : undefined;
      if (alternate) {
        try { response = await this.fetcher(alternate.toString(), init); }
        catch (alternateCause) {
          throw new DNSHEApiError('DNSHE service is unavailable', 502, endpoint, action, 'UPSTREAM_NETWORK_ERROR', { attempts: [{ host: url.hostname, reason: networkReason(primaryCause) }, { host: alternate.hostname, reason: networkReason(alternateCause) }] });
        }
      } else {
        throw new DNSHEApiError('DNSHE service is unavailable', 502, endpoint, action, 'UPSTREAM_NETWORK_ERROR', { reason: networkReason(primaryCause), host: url.hostname, retrySuppressed: method !== 'GET' });
      }
    }
    const raw = await response.text();
    let body: Record<string, any>;
    try { body = raw ? JSON.parse(raw) as Record<string, any> : {}; }
    catch { throw new DNSHEApiError('DNSHE returned an invalid response', 502, endpoint, action, 'UPSTREAM_INVALID_RESPONSE'); }
    if (!response.ok || body.success === false || body.error) {
      const message = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : `DNSHE request failed (${response.status})`;
      const status = response.ok ? bodyStatus(body.error_code) : response.status || 502;
      throw new DNSHEApiError(message, status, endpoint, action, typeof body.error_code === 'string' ? body.error_code : 'DNSHE_ERROR', body.details);
    }
    return body;
  }

  listSubdomains(params: Record<string, unknown> = {}) { return this.request('subdomains', 'list', 'GET', params); }
  getSubdomain(subdomain_id: number) { return this.request('subdomains', 'get', 'GET', { subdomain_id }); }
  registerSubdomain(subdomain: string, rootdomain: string) { return this.request('subdomains', 'register', 'POST', { subdomain, rootdomain }); }
  deleteSubdomain(subdomain_id: number) { return this.request('subdomains', 'delete', 'POST', { subdomain_id }); }
  renewSubdomain(subdomain_id: number) { return this.request('subdomains', 'renew', 'POST', { subdomain_id }); }
  listDnsRecords(subdomain_id: number, params: Record<string, unknown> = {}) { return this.request('dns_records', 'list', 'GET', { subdomain_id, ...params }); }
  createDnsRecord(subdomain_id: number, values: Record<string, unknown> | object) { return this.request('dns_records', 'create', 'POST', { subdomain_id, ...values }); }
  updateDnsRecord(identifier: { id: number } | { record_id: string }, values: Record<string, unknown> | object) { return this.request('dns_records', 'update', 'POST', { ...identifier, ...values }); }
  deleteDnsRecord(identifier: { id: number } | { record_id: string }) { return this.request('dns_records', 'delete', 'POST', identifier); }
  listKeys() { return this.request('keys', 'list', 'GET'); }
  createKey(key_name: string, ip_whitelist?: string) { return this.request('keys', 'create', 'POST', { key_name, ...(ip_whitelist ? { ip_whitelist } : {}) }); }
  deleteKey(key_id: number) { return this.request('keys', 'delete', 'POST', { key_id }); }
  regenerateKey(key_id: number) { return this.request('keys', 'regenerate', 'POST', { key_id }); }
  getQuota() { return this.request('quota', undefined, 'GET'); }
  whois(domain: string) { return this.request('whois', undefined, 'GET', { domain }); }
  listPermanentUpgrade(params: Record<string, unknown> = {}) { return this.request('permanent_upgrade', 'list', 'GET', params); }
  createPermanentUpgrade(subdomain_id: number) { return this.request('permanent_upgrade', 'create', 'POST', { subdomain_id }); }
  assistPermanentUpgrade(assist_code: string) { return this.request('permanent_upgrade', 'assist', 'POST', { assist_code }); }
  cancelPermanentUpgrade(request_id: string | number) { return this.request('permanent_upgrade', 'cancel', 'POST', { request_id }); }
}

export function dnsheClient(key: string, secret: string): DNSHESubdomainAPI {
  return new DNSHESubdomainAPI('https://api005.dnshe.com/index.php', key, secret);
}

export function publicDnsheClient(): DNSHESubdomainAPI {
  return new DNSHESubdomainAPI('https://api005.dnshe.com/index.php');
}
