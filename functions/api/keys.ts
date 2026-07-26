import { getAccount } from '../lib/accounts.ts';
import { dnsheClient } from '../lib/dnshe_api.ts';
import { ValidationError } from '../lib/errors.ts';
import { jsonOk, methodNotAllowed, parseJsonBody } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { ipWhitelist, keyName, positiveId, requiredString } from '../lib/validation.ts';

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    if (context.request.method === 'GET') {
      const account = getAccount(context.env, new URL(context.request.url).searchParams.get('accountIndex'));
      const response = await dnsheClient(account.key, account.secret).listKeys();
      const keys = Array.isArray(response.keys) ? response.keys : Array.isArray(response.data?.keys) ? response.data.keys : Array.isArray(response.data) ? response.data : [];
      return jsonOk(requestId, { keys, count: Number(response.count ?? response.data?.count ?? keys.length) });
    }
    if (context.request.method === 'POST' || context.request.method === 'DELETE') {
      const body = await parseJsonBody<Record<string, unknown>>(context.request);
      const account = getAccount(context.env, body.accountIndex);
      const action = context.request.method === 'DELETE' ? 'delete' : requiredString(body.action, 'action', 16);
      const api = dnsheClient(account.key, account.secret);
      if (action === 'create') return jsonOk(requestId, await api.createKey(keyName(body.key_name), ipWhitelist(body.ip_whitelist)));
      if (action === 'regenerate') return jsonOk(requestId, await api.regenerateKey(positiveId(body.key_id, 'key_id')));
      if (action === 'delete') return jsonOk(requestId, await api.deleteKey(positiveId(body.key_id, 'key_id')));
      throw new ValidationError('Unsupported keys action');
    }
    return methodNotAllowed(requestId, ['GET', 'POST', 'DELETE']);
  });
}
