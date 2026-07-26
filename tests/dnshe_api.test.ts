import { describe, expect, it, vi } from 'vitest';
import { DNSHEApiError, DNSHESubdomainAPI } from '../functions/lib/dnshe_api.ts';

describe('DNSHE V2 client', () => {
  it('uses credential headers and structured GET fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, subdomains: [] }), { status: 200 }));
    const client = new DNSHESubdomainAPI('https://api.example/index.php', 'key', 'secret', fetcher);
    await client.listSubdomains({ page: 2, per_page: 50 });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain('endpoint=subdomains');
    expect(url).toContain('page=2');
    expect(new Headers(init.headers).get('X-API-Secret')).toBe('secret');
  });
  it('preserves upstream 429 details and rejects body-level and invalid JSON failures', async () => {
    const limited = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error_code: 'RATE_LIMITED', message: 'Slow down', details: { remaining: 0 } }), { status: 429 })));
    await expect(limited.getQuota()).rejects.toMatchObject({ status: 429, errorCode: 'RATE_LIMITED', details: { remaining: 0 } } satisfies Partial<DNSHEApiError>);
    const network = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockRejectedValue(new Error('connection reset')));
    await expect(network.getQuota()).rejects.toMatchObject({ status: 502, errorCode: 'UPSTREAM_NETWORK_ERROR', details: { reason: 'connection reset' } });
    const bodyFailure = new DNSHESubdomainAPI('https://api.example', 'key', 'secret', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error_code: 'provider_operation_failed', message: 'Provider rejected the request' }), { status: 200 })));
    await expect(bodyFailure.getQuota()).rejects.toMatchObject({ status: 502, errorCode: 'provider_operation_failed' });
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
