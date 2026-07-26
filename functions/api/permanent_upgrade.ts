import { getAccount } from '../lib/accounts.ts';
import { dnsheClient } from '../lib/dnshe_api.ts';
import { ValidationError } from '../lib/errors.ts';
import { jsonOk, methodNotAllowed, parseJsonBody } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { pagination, permanentAssistCode, positiveId, requestId, requiredString } from '../lib/validation.ts';

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (id) => {
    if (context.request.method === 'GET') {
      const url = new URL(context.request.url);
      const account = getAccount(context.env, url.searchParams.get('accountIndex'));
      const page = pagination(url.searchParams);
      const response = await dnsheClient(account.key, account.secret).listPermanentUpgrade({ page: page.page, per_page: page.per_page });
      const state = response.state || response.data?.state || {};
      const upgrades = Array.isArray(state.requests) ? state.requests : Array.isArray(response.requests) ? response.requests : Array.isArray(response.permanent_upgrades) ? response.permanent_upgrades : Array.isArray(response.data?.requests) ? response.data.requests : Array.isArray(response.data) ? response.data : [];
      const assistLogs = Array.isArray(state.assist_logs) ? state.assist_logs : [];
      const eligibleSubdomains = Array.isArray(state.eligible_subdomains) ? state.eligible_subdomains : [];
      const upstream = response.pagination || response.data?.pagination;
      return jsonOk(id, { upgrades, assistLogs, eligibleSubdomains }, { pagination: upstream ? { page: Number(upstream.page || page.page), per_page: Number(upstream.per_page || page.per_page), ...(Number.isFinite(Number(upstream.total)) ? { total: Number(upstream.total) } : {}), ...(typeof upstream.has_more === 'boolean' ? { has_more: upstream.has_more } : {}) } : undefined });
    }
    if (context.request.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(context.request);
      const account = getAccount(context.env, body.accountIndex);
      const action = requiredString(body.action, 'action', 16);
      const api = dnsheClient(account.key, account.secret);
      if (action === 'create') return jsonOk(id, await api.createPermanentUpgrade(positiveId(body.subdomain_id, 'subdomain_id')));
      if (action === 'assist') return jsonOk(id, await api.assistPermanentUpgrade(permanentAssistCode(body.assist_code)));
      if (action === 'cancel') return jsonOk(id, await api.cancelPermanentUpgrade(requestId(body.request_id)));
      throw new ValidationError('Unsupported permanent upgrade action');
    }
    return methodNotAllowed(id, ['GET', 'POST']);
  });
}
