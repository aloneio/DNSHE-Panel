import { getAccount } from '../lib/accounts.ts';
import { DNSHEApiError, dnsheClient, publicDnsheClient } from '../lib/dnshe_api.ts';
import { jsonOk, methodNotAllowed } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { domain } from '../lib/validation.ts';

function canRetryWithCredentials(error: unknown): boolean {
  return error instanceof DNSHEApiError && (error.status === 401 || error.status === 403 || error.errorCode === 'auth_invalid_credentials' || error.errorCode === 'api_access_disabled');
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    if (context.request.method !== 'GET') return methodNotAllowed(requestId, ['GET']);
    const url = new URL(context.request.url);
    const name = domain(url.searchParams.get('domain'));
    const accountIndex = url.searchParams.get('accountIndex');
    const mode = url.searchParams.get('mode') || 'auto';
    let response: Record<string, any>;
    let authMode: 'public' | 'authenticated' = 'public';
    if (mode === 'authenticated') {
      const account = await getAccount(context.env, accountIndex);
      response = await dnsheClient(account.key, account.secret).whois(name);
      authMode = 'authenticated';
    } else {
      try {
        response = await publicDnsheClient().whois(name);
      } catch (error) {
        if (!accountIndex || !canRetryWithCredentials(error)) throw error;
        const account = await getAccount(context.env, accountIndex);
        response = await dnsheClient(account.key, account.secret).whois(name);
        authMode = 'authenticated';
      }
    }
    return jsonOk(requestId, { whois: response.whois ?? response.data ?? response, authMode });
  });
}
