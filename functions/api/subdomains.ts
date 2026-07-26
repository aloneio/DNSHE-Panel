import { getAccount, listAccounts } from '../lib/accounts.ts';
import { DNSHEApiError, dnsheClient } from '../lib/dnshe_api.ts';
import { ValidationError } from '../lib/errors.ts';
import { jsonOk, methodNotAllowed, parseJsonBody } from '../lib/http.ts';
import { secured } from '../lib/route.ts';
import type { FunctionContext } from '../lib/types.ts';
import { dateOnly, domain, optionalEnum, pagination, positiveId, requiredString, subdomain, subdomainFields } from '../lib/validation.ts';

const STATUSES = ['active', 'suspended', 'expired'] as const;
const SORT_FIELDS = ['id', 'created_at', 'updated_at', 'expires_at', 'subdomain'] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

function subdomainList(response: Record<string, any>): any[] {
  const list = response.subdomains || response.data?.subdomains || response.data || [];
  return Array.isArray(list) ? list : [];
}

function paginationMeta(upstream: Record<string, any>, fallback: { page: number; per_page: number }) {
  return {
    page: Number(upstream.page || fallback.page),
    per_page: Number(upstream.per_page || fallback.per_page),
    ...(Number.isFinite(Number(upstream.total)) ? { total: Number(upstream.total) } : {}),
    ...(typeof upstream.has_more === 'boolean' ? { has_more: upstream.has_more } : {}),
    ...(Number.isFinite(Number(upstream.next_page)) ? { next_page: Number(upstream.next_page) } : {}),
    ...(Number.isFinite(Number(upstream.prev_page)) ? { prev_page: Number(upstream.prev_page) } : {})
  };
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  return secured(context, async (requestId) => {
    const request = context.request;
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const accountIndex = url.searchParams.get('accountIndex') || 'all';
      const subdomainId = url.searchParams.get('subdomain_id');
      if (subdomainId !== null) {
        if (accountIndex === 'all') throw new ValidationError('Select one account to load subdomain details');
        const account = getAccount(context.env, accountIndex);
        const response = await dnsheClient(account.key, account.secret).getSubdomain(positiveId(subdomainId, 'subdomain_id'));
        const detail = response.subdomain || response.data?.subdomain || response.data || response;
        const records = Array.isArray(response.dns_records) ? response.dns_records : Array.isArray(response.data?.dns_records) ? response.data.dns_records : [];
        return jsonOk(requestId, { subdomain: { ...detail, accountIndex: account.accountIndex, accountAlias: account.alias }, dns_records: records, dns_count: Number(response.dns_count ?? response.data?.dns_count ?? records.length) });
      }

      const page = pagination(url.searchParams, { defaultPerPage: 50, maxPerPage: 500 });
      const search = url.searchParams.get('search') || url.searchParams.get('query');
      if (search !== null && search.length > 253) throw new ValidationError('search is too long');
      const rootdomain = url.searchParams.get('rootdomain');
      const status = optionalEnum(url.searchParams.get('status'), 'status', STATUSES);
      const createdFrom = dateOnly(url.searchParams.get('created_from'), 'created_from');
      const createdTo = dateOnly(url.searchParams.get('created_to'), 'created_to');
      if (createdFrom && createdTo && createdFrom > createdTo) throw new ValidationError('created_from cannot be later than created_to');
      const sortBy = optionalEnum(url.searchParams.get('sort_by'), 'sort_by', SORT_FIELDS);
      const sortDir = optionalEnum(url.searchParams.get('sort_dir'), 'sort_dir', SORT_DIRECTIONS);
      const fields = subdomainFields(url.searchParams.get('fields'));
      const params = {
        page: page.page,
        per_page: page.per_page,
        ...(page.include_total ? { include_total: 1 } : {}),
        ...(search ? { search } : {}),
        ...(rootdomain ? { rootdomain: domain(rootdomain, 'rootdomain') } : {}),
        ...(status ? { status } : {}),
        ...(createdFrom ? { created_from: createdFrom } : {}),
        ...(createdTo ? { created_to: createdTo } : {}),
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(sortDir ? { sort_dir: sortDir } : {}),
        ...(fields ? { fields } : {})
      };
      const accounts = accountIndex === 'all' ? listAccounts(context.env) : [getAccount(context.env, accountIndex)];
      const subdomains: any[] = [];
      const byAccount: Record<string, ReturnType<typeof paginationMeta> & { count?: number }> = {};
      const partialErrors: Array<{ accountIndex: string; accountAlias: string; status: number; error_code?: string; message: string; details?: unknown }> = [];
      for (const account of accounts) {
        try {
          const response = await dnsheClient(account.key, account.secret).listSubdomains(params);
          const upstreamPagination = response.pagination || response.data?.pagination || {};
          const accountItems = subdomainList(response);
          byAccount[account.accountIndex] = { ...paginationMeta(upstreamPagination, page), count: Number(response.count ?? response.data?.count ?? accountItems.length) };
          subdomains.push(...accountItems.map((item) => ({ ...item, accountIndex: account.accountIndex, accountAlias: account.alias })));
        } catch (error) {
          if (accountIndex !== 'all') throw error;
          const upstream = error instanceof DNSHEApiError ? error : undefined;
          partialErrors.push({ accountIndex: account.accountIndex, accountAlias: account.alias, status: upstream?.status || 502, ...(upstream?.errorCode ? { error_code: upstream.errorCode } : {}), message: upstream?.message || 'Unable to load this account', ...(upstream?.details === undefined ? {} : { details: upstream.details }) });
        }
      }
      return jsonOk(requestId, { subdomains, count: subdomains.length }, { pagination: { page: page.page, per_page: page.per_page, byAccount }, partialErrors });
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await parseJsonBody<Record<string, unknown>>(request);
      const action = requiredString(body.action, 'action', 16);
      const account = getAccount(context.env, body.accountIndex);
      const api = dnsheClient(account.key, account.secret);
      if (action === 'register' && request.method === 'POST') return jsonOk(requestId, await api.registerSubdomain(subdomain(body.subdomain), domain(body.rootdomain, 'rootdomain')));
      if (action === 'renew') return jsonOk(requestId, await api.renewSubdomain(positiveId(body.subdomain_id, 'subdomain_id')));
      if (action === 'delete' && request.method === 'POST') return jsonOk(requestId, await api.deleteSubdomain(positiveId(body.subdomain_id, 'subdomain_id')));
      throw new ValidationError('Unsupported subdomain action');
    }
    if (request.method === 'DELETE') {
      const body = await parseJsonBody<Record<string, unknown>>(request);
      const account = getAccount(context.env, body.accountIndex);
      return jsonOk(requestId, await dnsheClient(account.key, account.secret).deleteSubdomain(positiveId(body.subdomain_id, 'subdomain_id')));
    }
    return methodNotAllowed(requestId, ['GET', 'POST', 'PUT', 'DELETE']);
  });
}
