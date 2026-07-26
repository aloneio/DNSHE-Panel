import { describe, expect, it } from 'vitest';
import { createSession, sessionCookie, verifySession } from '../functions/lib/session.ts';

const env = { DNS_PANEL_SESSION_SECRET: 'a'.repeat(48), DNS_PANEL_SESSION_MAX_AGE_SECONDS: '600' };

describe('signed sessions', () => {
  it('creates a verifiable signed HttpOnly session cookie', async () => {
    const session = await createSession(env, 1000);
    const request = new Request('https://panel.example/api/auth', { headers: { Cookie: `dnshe_session=${session.token}` } });
    await expect(verifySession(request, env, 1001)).resolves.toMatchObject({ iat: 1000, exp: 1600, csrf: expect.any(String) });
    expect(sessionCookie(session.token, session.maxAge)).toContain('HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=600');
  });

  it('rejects tampered and expired payloads', async () => {
    const session = await createSession(env, 1000);
    const tampered = `${session.token.slice(0, -1)}x`;
    await expect(verifySession(new Request('https://panel.example', { headers: { Cookie: `dnshe_session=${tampered}` } }), env, 1001)).rejects.toThrow('Invalid session');
    await expect(verifySession(new Request('https://panel.example', { headers: { Cookie: `dnshe_session=${session.token}` } }), env, 1601)).rejects.toThrow('Session expired');
  });
});
