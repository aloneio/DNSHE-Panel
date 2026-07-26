import { AppError } from './errors.ts';

export class DNSHEApiError extends AppError {
  constructor(message: string, status: number, endpoint: string, action?: string, errorCode?: string, details?: unknown) {
    super(message, status, { errorCode, details, upstream: { endpoint, ...(action ? { action } : {}), status } });
    this.name = 'DNSHEApiError';
  }
}

export class DNSHESubdomainAPI {
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string,
    readonly apiSecret: string,
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
    const headers = new Headers({ 'Accept': 'application/json', 'X-API-Key': this.apiKey, 'X-API-Secret': this.apiSecret });
    const init: RequestInit = { method, headers };
    if (method !== 'GET' && data) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
    }
    let response: Response;
    try { response = await this.fetcher(url.toString(), init); }
    catch (cause) {
      const reason = cause instanceof Error && cause.message ? cause.message : 'Unknown network failure';
      throw new DNSHEApiError('DNSHE service is unavailable', 502, endpoint, action, 'UPSTREAM_NETWORK_ERROR', { reason });
    }
    const raw = await response.text();
    let body: Record<string, any>;
    try { body = raw ? JSON.parse(raw) as Record<string, any> : {}; }
    catch { throw new DNSHEApiError('DNSHE returned an invalid response', 502, endpoint, action, 'UPSTREAM_INVALID_RESPONSE'); }
    if (!response.ok || body.success === false || body.error) {
      const message = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : `DNSHE request failed (${response.status})`;
      const status = response.ok ? 502 : response.status || 502;
      throw new DNSHEApiError(message, status, endpoint, action, typeof body.error_code === 'string' ? body.error_code : 'DNSHE_ERROR', body.details);
    }
    return body;
  }

  listSubdomains(params: Record<string, unknown> = {}) { return this.request('subdomains', 'list', 'GET', params); }
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
