import { getAccount } from '../lib/accounts.ts';
import { jsonOk, methodNotAllowed, parseJsonBody } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { dnsRecord, pagination, positiveId, recordIdentifier } from '../lib/validation.ts';

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    const request = context.request;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const account = getAccount(context.env, url.searchParams.get('accountIndex'));
      const subdomainId = positiveId(url.searchParams.get('subdomain_id'), 'subdomain_id');
      const page = pagination(url.searchParams);
      const response = await (await import('../lib/dnshe_api.ts')).dnsheClient(account.key, account.secret).listDnsRecords(subdomainId, { page: page.page, per_page: page.per_page });
      const records = Array.isArray(response.records) ? response.records : Array.isArray(response.data?.records) ? response.data.records : Array.isArray(response.data) ? response.data : [];
      const upstream = response.pagination || response.data?.pagination;
      return jsonOk(requestId, { records }, { pagination: upstream ? { page: Number(upstream.page || page.page), per_page: Number(upstream.per_page || page.per_page), ...(Number.isFinite(Number(upstream.total)) ? { total: Number(upstream.total) } : {}), ...(typeof upstream.has_more === 'boolean' ? { has_more: upstream.has_more } : {}) } : undefined });
    }
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
      const body = await parseJsonBody<Record<string, unknown>>(request);
      const account = getAccount(context.env, body.accountIndex);
      const { dnsheClient } = await import('../lib/dnshe_api.ts');
      const api = dnsheClient(account.key, account.secret);
      if (request.method === 'POST') return jsonOk(requestId, await api.createDnsRecord(positiveId(body.subdomain_id, 'subdomain_id'), dnsRecord(body)));
      const identifier = recordIdentifier(body);
      if (request.method === 'PUT') return jsonOk(requestId, await api.updateDnsRecord(identifier, dnsRecord(body, false)));
      return jsonOk(requestId, await api.deleteDnsRecord(identifier));
    }
    return methodNotAllowed(requestId, ['GET', 'POST', 'PUT', 'DELETE']);
  });
}
