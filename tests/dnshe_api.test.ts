import { describe, expect, it, vi } from 'vitest';
import { DNSHEApiError, DNSHESubdomainAPI, publicDnsheClient } from '../functions/lib/dnshe_api.ts';

describe('DNSHE V2 client', () => {
  it('uses credential headers and structured GET fields', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true, subdomains: [] }), { status: 200 })));
    const client = new DNSHESubdomainAPI('https://api.example/index.php', 'key', 'secret', fetcher);
    await client.listSubdomains({ page: 2, per_page: 50 });
    await client.getSubdomain(9);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain('endpoint=subdomains');
    expect(url).toContain('page=2');
    expect(new Headers(init.headers).get('X-API-Secret')).toBe('secret');
    expect(String(fetcher.mock.calls[1][0])).toContain('action=get');
    expect(String(fetcher.mock.calls[1][0])).toContain('subdomain_id=9');
  });
  it('omits credential headers for the public client', async () => {
    const original = globalThis.fetch;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, registered: false }), { status: 200 }));
    globalThis.fetch = fetcher;
    try { await publicDnsheClient().whois('foo.example.com'); }
    finally { globalThis.fetch = original; }
    const headers = new Headers(fetcher.mock.calls[0][1].headers);
    expect(headers.has('X-API-Key')).toBe(false);
    expect(headers.has('X-API-Secret')).toBe(false);
  });

  it('preserves upstream 429 details and rejects body-level and invalid JSON failures', async () => {
    const limited = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error_code: 'RATE_LIMITED', message: 'Slow down', details: { remaining: 0 } }), { status: 429 })));
    await expect(limited.getQuota()).rejects.toMatchObject({ status: 429, errorCode: 'RATE_LIMITED', details: { remaining: 0 } } satisfies Partial<DNSHEApiError>);
    const network = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockRejectedValue(new Error('connection reset')));
    await expect(network.getQuota()).rejects.toMatchObject({ status: 502, errorCode: 'UPSTREAM_NETWORK_ERROR', details: { reason: 'connection reset' } });
    const bodyFailure = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error_code: 'provider_operation_failed', message: 'Provider rejected the request' }), { status: 200 })));
    await expect(bodyFailure.getQuota()).rejects.toMatchObject({ status: 502, errorCode: 'provider_operation_failed' });
    const bodyLimited = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error_code: 'rate_limit_exceeded', message: 'Slow down', details: { remaining: 0, reset_at: 'soon' } }), { status: 200 })));
    await expect(bodyLimited.getQuota()).rejects.toMatchObject({ status: 429, errorCode: 'rate_limit_exceeded', details: { remaining: 0 } });
    const invalid = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));
    await expect(invalid.getQuota()).rejects.toMatchObject({ status: 502, errorCode: 'UPSTREAM_INVALID_RESPONSE' });
  });
  it('uses documented DNS record identifiers and assist payloads', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })));
    const client = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', fetcher);
    await client.updateDnsRecord({ id: 7 }, { content: '192.0.2.1' });
    await client.deleteDnsRecord({ record_id: 'provider:abc-123' });
    await client.assistPermanentUpgrade('FRIEND-CODE');
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({ id: 7, content: '192.0.2.1' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({ record_id: 'provider:abc-123' });
    expect(JSON.parse(String(fetcher.mock.calls[2][1].body))).toEqual({ assist_code: 'FRIEND-CODE' });
  });
});
