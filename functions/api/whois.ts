import { getAccount } from '../lib/accounts.ts';
import { dnsheClient } from '../lib/dnshe_api.ts';
import { jsonOk, methodNotAllowed } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { domain } from '../lib/validation.ts';

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    if (context.request.method !== 'GET') return methodNotAllowed(requestId, ['GET']);
    const url = new URL(context.request.url);
    const account = getAccount(context.env, url.searchParams.get('accountIndex'));
    const response = await dnsheClient(account.key, account.secret).whois(domain(url.searchParams.get('domain')));
    return jsonOk(requestId, { whois: response.whois ?? response.data ?? response });
  });
}
