import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error browser ES module intentionally has no TypeScript declaration
import { apiFetch } from '../public/js/api.js';

describe('frontend API retry behavior', () => {
  it('retries one safe GET after an upstream network error', async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error_code: 'UPSTREAM_NETWORK_ERROR', message: 'DNSHE service is unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { subdomains: [{ id: 1 }] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetcher;
    try {
      await expect(apiFetch('/api/subdomains')).resolves.toMatchObject({ data: { subdomains: [{ id: 1 }] } });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { globalThis.fetch = originalFetch; }
  });

  it('does not retry mutations', async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error_code: 'UPSTREAM_NETWORK_ERROR', message: 'DNSHE service is unavailable' }), { status: 502, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetcher;
    try {
      await expect(apiFetch('/api/subdomains', { method: 'POST', body: '{}' })).rejects.toMatchObject({ errorCode: 'UPSTREAM_NETWORK_ERROR' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { globalThis.fetch = originalFetch; }
  });
});
