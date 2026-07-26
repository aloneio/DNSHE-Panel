import { getAccount } from '../lib/accounts.ts';
import { dnsheClient } from '../lib/dnshe_api.ts';
import { jsonOk, methodNotAllowed } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    if (context.request.method !== 'GET') return methodNotAllowed(requestId, ['GET']);
    const account = await getAccount(context.env, new URL(context.request.url).searchParams.get('accountIndex'));
    const response = await dnsheClient(account.key, account.secret).getQuota();
    return jsonOk(requestId, { quota: response.quota ?? response.data ?? response });
  });
}
