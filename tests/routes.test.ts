import { describe, expect, it, vi } from 'vitest';
import { onRequest as auth } from '../functions/api/auth.ts';
import { onRequest as subdomains } from '../functions/api/subdomains.ts';
import { onRequest as records } from '../functions/api/dns_records.ts';
import { onRequest as permanentUpgrade } from '../functions/api/permanent_upgrade.ts';
import { createSession } from '../functions/lib/session.ts';

const env = {
  DNS_PANEL_PASSWORD: 'test-password',
  DNS_PANEL_SESSION_SECRET: 'a'.repeat(48),
  DNSHE_KEY_2: 'key-two',
  DNSHE_SECRET_2: 'secret-two',
  DNSHE_ALIAS_2: 'Production 2026'
};

function context(request: Request) { return { request, env, data: {} }; }
async function csrfHeaders(method = 'POST') {
  const session = await createSession(env);
  return { Cookie: `dnshe_session=${session.token}`, 'X-CSRF-Token': session.payload.csrf, 'Content-Type': 'application/json', method };
}

describe('route contracts', () => {
  it('issues a signed session only after valid login', async () => {
    const wrong = await auth(context(new Request('https://panel.test/api/auth', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('Set-Cookie')).toBeNull();
    const valid = await auth(context(new Request('https://panel.test/api/auth', { method: 'POST', body: JSON.stringify({ password: 'test-password' }) })));
    expect(valid.status).toBe(200);
    expect(valid.headers.get('Set-Cookie')).toContain('HttpOnly');
  });
  it('rejects direct protected access and mutations without CSRF', async () => {
    expect((await subdomains(context(new Request('https://panel.test/api/subdomains')))).status).toBe(401);
    const session = await createSession(env);
    const response = await subdomains(context(new Request('https://panel.test/api/subdomains', { method: 'POST', headers: { Cookie: `dnshe_session=${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'renew', accountIndex: '2', subdomain_id: 1 }) })));
    expect(response.status).toBe(403);
  });
  it('validates account before calling upstream', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const headers = await csrfHeaders();
    const response = await records(context(new Request('https://panel.test/api/dns_records', { method: 'POST', headers, body: JSON.stringify({ accountIndex: 'not-configured', subdomain_id: 1, type: 'A', content: '127.0.0.1' }) })));
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });
});

import { resetRateLimitForTests } from '../functions/lib/rate_limit.ts';

describe('upstream mappings and login protection', () => {
  it('sends structured SRV fields and permanent-upgrade create action to DNSHE', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })));
    const headers = await csrfHeaders();
    const srv = await records(context(new Request('https://panel.test/api/dns_records', {
      method: 'POST', headers,
      body: JSON.stringify({ accountIndex: '2', subdomain_id: 7, type: 'SRV', name: '_https', priority: 10, weight: 20, port: 443, target: 'app.example.com' })
    })));
    expect(srv.status).toBe(200);
    const [, srvOptions] = fetcher.mock.calls[0];
    expect(JSON.parse(String(srvOptions!.body))).toMatchObject({ subdomain_id: 7, type: 'SRV', priority: 10, weight: 20, port: 443, target: 'app.example.com' });

    const upgradeHeaders = await csrfHeaders();
    const upgrade = await permanentUpgrade(context(new Request('https://panel.test/api/permanent_upgrade', {
      method: 'POST', headers: upgradeHeaders,
      body: JSON.stringify({ action: 'create', accountIndex: '2', subdomain_id: 7 })
    })));
    expect(upgrade.status).toBe(200);
    const [upgradeUrl, upgradeOptions] = fetcher.mock.calls[1];
    expect(String(upgradeUrl)).toContain('endpoint=permanent_upgrade');
    expect(String(upgradeUrl)).toContain('action=create');
    expect(JSON.parse(String(upgradeOptions!.body))).toMatchObject({ subdomain_id: 7 });
    fetcher.mockRestore();
  });

  it('reads documented permanent-upgrade state and sends assist code without a request id', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, state: { requests: [{ id: 5 }], assist_logs: [{ id: 8 }], eligible_subdomains: [{ id: 7 }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const session = await createSession(env);
    const listed = await permanentUpgrade(context(new Request('https://panel.test/api/permanent_upgrade?accountIndex=2&page=1&per_page=10', { headers: { Cookie: `dnshe_session=${session.token}` } })));
    expect(await listed.json()).toMatchObject({ data: { upgrades: [{ id: 5 }], assistLogs: [{ id: 8 }], eligibleSubdomains: [{ id: 7 }] } });
    const headers = await csrfHeaders();
    const assisted = await permanentUpgrade(context(new Request('https://panel.test/api/permanent_upgrade', { method: 'POST', headers, body: JSON.stringify({ action: 'assist', accountIndex: '2', assist_code: 'FRIEND-CODE' }) })));
    expect(assisted.status).toBe(200);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]!.body))).toEqual({ assist_code: 'FRIEND-CODE' });
    fetcher.mockRestore();
  });

  it('limits repeated bad logins within one isolate', async () => {
    resetRateLimitForTests();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await auth(context(new Request('https://panel.test/api/auth', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.9' }, body: JSON.stringify({ password: 'incorrect' }) })))).status).toBe(401);
    }
    const limited = await auth(context(new Request('https://panel.test/api/auth', { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.9' }, body: JSON.stringify({ password: 'incorrect' }) })));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error_code: 'RATE_LIMITED' });
  });
});
