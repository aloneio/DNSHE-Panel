import { getAccount } from '../lib/accounts.ts';
import { jsonOk, methodNotAllowed, parseJsonBody } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { dnsRecord, pagination, positiveId, recordIdentifier } from '../lib/validation.ts';

function recordList(response: Record<string, any>): any[] {
  return Array.isArray(response.records) ? response.records : Array.isArray(response.data?.records) ? response.data.records : Array.isArray(response.data) ? response.data : [];
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    const request = context.request;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const account = getAccount(context.env, url.searchParams.get('accountIndex'));
      const subdomainId = positiveId(url.searchParams.get('subdomain_id'), 'subdomain_id');
      const page = pagination(url.searchParams, { defaultPerPage: 100, maxPerPage: 500 });
      const response = await (await import('../lib/dnshe_api.ts')).dnsheClient(account.key, account.secret).listDnsRecords(subdomainId, { page: page.page, per_page: page.per_page, ...(page.include_total ? { include_total: 1 } : {}) });
      const records = recordList(response);
      const upstream = response.pagination || response.data?.pagination;
      return jsonOk(requestId, { records, count: Number(response.count ?? response.data?.count ?? records.length) }, { pagination: upstream ? { page: Number(upstream.page || page.page), per_page: Number(upstream.per_page || page.per_page), ...(Number.isFinite(Number(upstream.total)) ? { total: Number(upstream.total) } : {}), ...(typeof upstream.has_more === 'boolean' ? { has_more: upstream.has_more } : {}), ...(Number.isFinite(Number(upstream.next_page)) ? { next_page: Number(upstream.next_page) } : {}), ...(Number.isFinite(Number(upstream.prev_page)) ? { prev_page: Number(upstream.prev_page) } : {}) } : { page: page.page, per_page: page.per_page } });
    }
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE') {
      const body = await parseJsonBody<Record<string, unknown>>(request);
      const account = getAccount(context.env, body.accountIndex);
      const { dnsheClient } = await import('../lib/dnshe_api.ts');
      const api = dnsheClient(account.key, account.secret);
      if (request.method === 'POST' && body.subdomain_id !== undefined) return jsonOk(requestId, await api.createDnsRecord(positiveId(body.subdomain_id, 'subdomain_id'), dnsRecord(body)));
      if (request.method === 'DELETE') return jsonOk(requestId, await api.deleteDnsRecord(recordIdentifier(body)));
      return jsonOk(requestId, await api.updateDnsRecord(recordIdentifier(body), dnsRecord(body, false)));
    }
    return methodNotAllowed(requestId, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  });
}
