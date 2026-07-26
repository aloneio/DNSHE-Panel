import { getAccount, listAccounts } from '../lib/accounts.ts';
import { DNSHEApiError, dnsheClient } from '../lib/dnshe_api.ts';
import { ValidationError } from '../lib/errors.ts';
import { jsonOk, methodNotAllowed, parseJsonBody } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { domain, pagination, positiveId, requiredString, subdomain } from '../lib/validation.ts';

function subdomainList(response: Record<string, any>): any[] {
  const list = response.subdomains || response.data?.subdomains || response.data || [];
  return Array.isArray(list) ? list : [];
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    const request = context.request;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const accountIndex = url.searchParams.get('accountIndex') || 'all';
      const page = pagination(url.searchParams);
      const search = url.searchParams.get('search') || url.searchParams.get('query');
      const status = url.searchParams.get('status');
      if (search !== null && search.length > 253) throw new ValidationError('search is too long');
      if (status !== null && !/^[A-Za-z0-9_-]{0,64}$/.test(status)) throw new ValidationError('status has an invalid format');
      const params = { page: page.page, per_page: page.per_page, include_total: page.include_total, ...(search ? { search } : {}), ...(status ? { status } : {}) };
      const accounts = accountIndex === 'all' ? listAccounts(context.env) : [getAccount(context.env, accountIndex)];
      const subdomains: any[] = [];
      const byAccount: Record<string, { page: number; per_page: number; total?: number; has_more?: boolean }> = {};
      const partialErrors: Array<{ accountIndex: string; accountAlias: string; status: number; error_code?: string; message: string; details?: unknown }> = [];
      for (const account of accounts) {
        try {
          const response = await dnsheClient(account.key, account.secret).listSubdomains(params);
          const upstreamPagination = response.pagination || response.data?.pagination || {};
          byAccount[account.accountIndex] = { page: Number(upstreamPagination.page || page.page), per_page: Number(upstreamPagination.per_page || page.per_page), ...(Number.isFinite(Number(upstreamPagination.total)) ? { total: Number(upstreamPagination.total) } : {}), ...(typeof upstreamPagination.has_more === 'boolean' ? { has_more: upstreamPagination.has_more } : {}) };
          subdomains.push(...subdomainList(response).map((item) => ({ ...item, accountIndex: account.accountIndex, accountAlias: account.alias })));
        } catch (error) {
          if (accountIndex !== 'all') throw error;
          const upstream = error instanceof DNSHEApiError ? error : undefined;
          partialErrors.push({ accountIndex: account.accountIndex, accountAlias: account.alias, status: upstream?.status || 502, ...(upstream?.errorCode ? { error_code: upstream.errorCode } : {}), message: upstream?.message || 'Unable to load this account', ...(upstream?.details === undefined ? {} : { details: upstream.details }) });
        }
      }
      return jsonOk(requestId, { subdomains }, { pagination: { page: page.page, per_page: page.per_page, byAccount }, partialErrors });
    }
    if (request.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(request);
      const action = requiredString(body.action, 'action', 16);
      const account = getAccount(context.env, body.accountIndex);
      const api = dnsheClient(account.key, account.secret);
      if (action === 'register') return jsonOk(requestId, await api.registerSubdomain(subdomain(body.subdomain), domain(body.rootdomain, 'rootdomain')));
      if (action === 'renew') return jsonOk(requestId, await api.renewSubdomain(positiveId(body.subdomain_id, 'subdomain_id')));
      throw new ValidationError('Unsupported subdomain action');
    }
    if (request.method === 'DELETE') {
      const body = await parseJsonBody<Record<string, unknown>>(request);
      const account = getAccount(context.env, body.accountIndex);
      return jsonOk(requestId, await dnsheClient(account.key, account.secret).deleteSubdomain(positiveId(body.subdomain_id, 'subdomain_id')));
    }
    return methodNotAllowed(requestId, ['GET', 'POST', 'DELETE']);
  });
}
