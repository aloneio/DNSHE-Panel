import { describe, expect, it, vi } from 'vitest';
import { onRequest as accounts } from '../functions/api/accounts.ts';
import { onRequest as quota } from '../functions/api/quota.ts';
import { createSession } from '../functions/lib/session.ts';

class MemoryKV {
  private readonly values = new Map<string, string>();
  async get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any> {
    const value = this.values.get(key) ?? null;
    if (value === null || type !== 'json') return value;
    return JSON.parse(value);
  }
  async put(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
  async list(options?: { prefix?: string; limit?: number }) {
    const prefix = options?.prefix || '';
    const limit = options?.limit || 1000;
    const keys = [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort().slice(0, limit).map((name) => ({ name }));
    return { keys, list_complete: true, cacheStatus: null };
  }
}

function keyMaterial() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))); }
function makeEnv() {
  return {
    DNS_PANEL_PASSWORD: 'test-password',
    DNS_PANEL_SESSION_SECRET: 'a'.repeat(48),
    ACCOUNT_ENCRYPTION_KEY: keyMaterial(),
    DNSHE_KEY_1: 'environment-key',
    DNSHE_SECRET_1: 'environment-secret',
    DNSHE_ALIAS_1: 'Legacy account',
    ACCOUNTS_KV: new MemoryKV() as unknown as KVNamespace
  };
}

function context(env: ReturnType<typeof makeEnv>, request: Request) { return { request, env, data: {} }; }
async function headers(env: ReturnType<typeof makeEnv>) {
  const session = await createSession(env);
  return { Cookie: `dnshe_session=${session.token}`, 'X-CSRF-Token': session.payload.csrf, 'Content-Type': 'application/json' };
}

async function body(response: Response) { return response.json() as Promise<any>; }

describe('KV-backed account management', () => {
  it('requires a valid session and CSRF token for account mutations', async () => {
    const env = makeEnv();
    const payload = JSON.stringify({ accountIndex: 'new', alias: 'New', key: 'key', secret: 'secret' });
    expect((await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })))).status).toBe(401);
    const session = await createSession(env);
    expect((await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'POST', headers: { Cookie: `dnshe_session=${session.token}`, 'Content-Type': 'application/json' }, body: payload })))).status).toBe(403);
  });

  it('creates, lists, updates and deletes encrypted KV accounts without exposing credentials', async () => {
    const env = makeEnv();
    const auth = await headers(env);
    const created = await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'POST', headers: auth, body: JSON.stringify({ accountIndex: 'new', alias: 'New account', key: 'dynamic-key', secret: 'dynamic-secret' }) })));
    expect(created.status).toBe(201);
    expect(await body(created)).toMatchObject({ data: { account: { accountIndex: 'new', alias: 'New account', managed: true } } });
    const stored = await env.ACCOUNTS_KV.get('account:new');
    expect(stored).not.toContain('dynamic-key');
    expect(stored).not.toContain('dynamic-secret');
    const listed = await accounts(context(env, new Request('https://panel.test/api/accounts', { headers: { Cookie: auth.Cookie } })));
    const data = await body(listed);
    expect(data).toMatchObject({ data: { accounts: expect.arrayContaining([{ accountIndex: '1', alias: 'Legacy account', managed: false }, { accountIndex: 'new', alias: 'New account', managed: true }]) } });
    expect(JSON.stringify(data)).not.toContain('dynamic-key');
    expect(JSON.stringify(data)).not.toContain('dynamic-secret');
    const updated = await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'PATCH', headers: auth, body: JSON.stringify({ accountIndex: 'new', alias: 'Renamed' }) })));
    expect(await body(updated)).toMatchObject({ data: { account: { accountIndex: 'new', alias: 'Renamed', managed: true } } });
    const deleted = await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'DELETE', headers: auth, body: JSON.stringify({ accountIndex: 'new' }) })));
    expect(await body(deleted)).toMatchObject({ data: { deleted: true } });
  });

  it('resolves dynamically-created credentials for existing account-scoped routes', async () => {
    const env = makeEnv();
    const auth = await headers(env);
    await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'POST', headers: auth, body: JSON.stringify({ accountIndex: 'dynamic', alias: 'Dynamic', key: 'dynamic-key', secret: 'dynamic-secret' }) })));
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, quota: { available: 3 } }), { status: 200 }));
    try {
      const response = await quota(context(env, new Request('https://panel.test/api/quota?accountIndex=dynamic', { headers: { Cookie: auth.Cookie } })));
      expect(response.status).toBe(200);
      expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-API-Key')).toBe('dynamic-key');
      expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-API-Secret')).toBe('dynamic-secret');
    } finally { fetcher.mockRestore(); }
  });

  it('does not allow environment-only accounts to be edited or deleted', async () => {
    const env = makeEnv();
    const auth = await headers(env);
    const changed = await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'PATCH', headers: auth, body: JSON.stringify({ accountIndex: '1', alias: 'Attempt' }) })));
    const removed = await accounts(context(env, new Request('https://panel.test/api/accounts', { method: 'DELETE', headers: auth, body: JSON.stringify({ accountIndex: '1' }) })));
    expect(changed.status).toBe(400);
    expect(removed.status).toBe(400);
  });
});
