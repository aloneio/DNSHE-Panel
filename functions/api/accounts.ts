import { publicAccounts } from '../lib/accounts.ts';
import { jsonOk, methodNotAllowed } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    if (context.request.method !== 'GET') return methodNotAllowed(requestId, ['GET']);
    return jsonOk(requestId, { accounts: publicAccounts(context.env) });
  });
}
