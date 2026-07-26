import { accountCreateInput, accountUpdateInput, createAccount, deleteAccount, publicAccounts, updateAccount } from '../lib/accounts.ts';
import { jsonOk, methodNotAllowed, parseJsonBody } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    const request = context.request;
    if (request.method === 'GET') return jsonOk(requestId, { accounts: await publicAccounts(context.env) });
    if (request.method === 'POST') {
      const account = await createAccount(context.env, accountCreateInput(await parseJsonBody<Record<string, unknown>>(request)));
      return jsonOk(requestId, { account }, { status: 201 });
    }
    if (request.method === 'PATCH') {
      const account = await updateAccount(context.env, accountUpdateInput(await parseJsonBody<Record<string, unknown>>(request)));
      return jsonOk(requestId, { account });
    }
    if (request.method === 'DELETE') {
      const body = await parseJsonBody<Record<string, unknown>>(request);
      await deleteAccount(context.env, body.accountIndex);
      return jsonOk(requestId, { deleted: true });
    }
    return methodNotAllowed(requestId, ['GET', 'POST', 'PATCH', 'DELETE']);
  });
}
