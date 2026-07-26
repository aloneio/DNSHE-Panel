import { ValidationError } from './errors.ts';

const DOMAIN_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const FQDN = new RegExp(`^(?=.{1,253}$)(?:${DOMAIN_LABEL}\\.)+${DOMAIN_LABEL}$`, 'i');
const SUBDOMAIN = new RegExp(`^(?=.{1,63}$)${DOMAIN_LABEL}$`, 'i');
const RECORD_TYPES = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']);

export interface PaginationInput { page: number; per_page: number; include_total: boolean; }
export interface PaginationOptions { defaultPerPage?: number; maxPerPage?: number; }
export interface DnsRecordInput {
  type?: string;
  name?: string;
  content?: string;
  ttl?: number;
  priority?: number;
  line?: string;
  weight?: number;
  port?: number;
  target?: string;
  caa_flag?: number;
  caa_tag?: string;
  caa_value?: string;
}

function string(value: unknown, field: string, options: { required?: boolean; max?: number; trim?: boolean } = {}): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (options.required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const result = options.trim === false ? value : value.trim();
  if (options.required && !result) throw new ValidationError(`${field} is required`);
  if (options.max && result.length > options.max) throw new ValidationError(`${field} is too long`);
  return result;
}

export function requiredString(value: unknown, field: string, max = 255): string { return string(value, field, { required: true, max })!; }

export function positiveId(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ValidationError(`${field} must be a positive integer`);
  return parsed;
}

export function pagination(params: URLSearchParams, options: PaginationOptions = {}): PaginationInput {
  const defaultPerPage = options.defaultPerPage ?? 50;
  const maxPerPage = options.maxPerPage ?? 100;
  const rawPage = params.get('page') || '1';
  const rawPerPage = params.get('per_page') || String(defaultPerPage);
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawPerPage)) throw new ValidationError('page and per_page must be integers');
  const page = Number(rawPage);
  const per_page = Number(rawPerPage);
  if (page < 1 || per_page < 1 || per_page > maxPerPage) throw new ValidationError(`page must be at least 1 and per_page must be between 1 and ${maxPerPage}`);
  const include = params.get('include_total');
  if (include !== null && !['1', '0', 'true', 'false'].includes(include)) throw new ValidationError('include_total must be 1, 0, true, or false');
  return { page, per_page, include_total: include === '1' || include === 'true' };
}

export function subdomain(value: unknown): string {
  const result = requiredString(value, 'subdomain', 63).toLowerCase();
  if (!SUBDOMAIN.test(result)) throw new ValidationError('subdomain has an invalid format');
  return result;
}

export function domain(value: unknown, field = 'domain'): string {
  const result = requiredString(value, field, 253).replace(/\.$/, '').toLowerCase();
  if (!FQDN.test(result)) throw new ValidationError(`${field} has an invalid format`);
  return result;
}

export function dateOnly(value: unknown, field: string): string | undefined {
  const result = string(value, field, { max: 10 });
  if (!result) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!match) throw new ValidationError(`${field} must use YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new ValidationError(`${field} must be a valid calendar date`);
  return result;
}

export function optionalEnum(value: unknown, field: string, allowed: readonly string[]): string | undefined {
  const result = string(value, field, { max: 128 });
  if (!result) return undefined;
  if (!allowed.includes(result)) throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  return result;
}

export function subdomainFields(value: unknown): string | undefined {
  const result = string(value, 'fields', { max: 512 });
  if (!result || result === 'all') return result || undefined;
  const allowed = new Set(['id', 'subdomain', 'rootdomain', 'full_domain', 'status', 'created_at', 'updated_at', 'expires_at', 'never_expires', 'cloudflare_zone_id', 'provider_account_id']);
  const fields = result.split(',').map((field) => field.trim()).filter(Boolean);
  if (!fields.length || fields.some((field) => !allowed.has(field))) throw new ValidationError('fields contains an unsupported subdomain field');
  return [...new Set(fields)].join(',');
}

export function keyName(value: unknown): string {
  const result = requiredString(value, 'key_name', 64);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u.test(result)) throw new ValidationError('key_name contains unsupported characters');
  return result;
}

export function ipWhitelist(value: unknown): string | undefined {
  const result = string(value, 'ip_whitelist', { max: 512 });
  if (!result) return undefined;
  const ipv4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?:\/(?:[0-9]|[12]\d|3[0-2]))?$/;
  const entries = result.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
  if (!entries.length || entries.some((entry) => !ipv4.test(entry))) throw new ValidationError('ip_whitelist must contain IPv4 addresses or CIDRs');
  return entries.join(',');
}

function optionalNumber(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ValidationError(`${field} must be an integer between ${min} and ${max}`);
  return parsed;
}

export function dnsRecord(value: Record<string, unknown>, requireType = true): DnsRecordInput {
  const providedType = string(value.type, 'type', { max: 10 });
  const type = providedType?.toUpperCase();
  if (requireType && !type) throw new ValidationError('type is required');
  if (type && !RECORD_TYPES.has(type)) throw new ValidationError('Unsupported DNS record type');
  const name = string(value.name, 'name', { max: 253 });
  if (name && name !== '@' && !/^(?:[A-Za-z0-9_*](?:[A-Za-z0-9_*-]{0,61}[A-Za-z0-9_*])?\.)*[A-Za-z0-9_*](?:[A-Za-z0-9_*-]{0,61}[A-Za-z0-9_*])?$/.test(name)) throw new ValidationError('name has an invalid format');
  const content = string(value.content, 'content', { max: 2048, trim: false });
  const line = string(value.line, 'line', { max: 64 });
  const ttlInput = optionalNumber(value.ttl, 'ttl', 60, 86400);
  const priorityInput = optionalNumber(value.priority, 'priority', 0, 65535);
  const weight = optionalNumber(value.record_weight ?? value.weight, 'weight', 0, 65535);
  const port = optionalNumber(value.record_port ?? value.port, 'port', 1, 65535);
  const target = string(value.record_target ?? value.target, 'target', { max: 253 });
  const caaFlagInput = optionalNumber(value.caa_flag, 'caa_flag', 0, 255);
  const caaTagInput = string(value.caa_tag, 'caa_tag', { max: 32 });
  const caa_value = string(value.caa_value, 'caa_value', { max: 1024, trim: false });
  const ttl = requireType ? ttlInput ?? 600 : ttlInput;
  const priority = requireType && type === 'MX' ? priorityInput ?? 10 : requireType && type === 'SRV' ? priorityInput ?? 0 : priorityInput;
  const caa_flag = requireType && type === 'CAA' ? caaFlagInput ?? 0 : caaFlagInput;
  const caa_tag = requireType && type === 'CAA' ? caaTagInput ?? 'issue' : caaTagInput;
  if (requireType && type === 'SRV') {
    if (weight === undefined || port === undefined || !target) throw new ValidationError('SRV requires weight, port, and target');
  } else if (requireType && type === 'CAA') {
    if (caa_value === undefined) throw new ValidationError('CAA requires caa_value');
  } else if (requireType && !content) {
    throw new ValidationError(`${type} requires content`);
  }
  if (caa_tag && !/^(issue|issuewild|iodef)$/i.test(caa_tag)) throw new ValidationError('CAA tag must be issue, issuewild, or iodef');
  const result = { ...(type ? { type } : {}), ...(name === undefined ? {} : { name }), ...(content === undefined ? {} : { content }), ...(ttl === undefined ? {} : { ttl }), ...(priority === undefined ? {} : { priority }), ...(line === undefined ? {} : { line }), ...(weight === undefined ? {} : { weight }), ...(port === undefined ? {} : { port }), ...(target === undefined ? {} : { target }), ...(caa_flag === undefined ? {} : { caa_flag }), ...(caa_tag === undefined ? {} : { caa_tag }), ...(caa_value === undefined ? {} : { caa_value }) };
  if (!requireType && Object.keys(result).length === 0) throw new ValidationError('At least one DNS record field must be provided');
  return result;
}

export function recordIdentifier(value: Record<string, unknown>): { id: number } | { record_id: string } {
  if (value.id !== undefined && value.id !== null && value.id !== '') return { id: positiveId(value.id, 'id') };
  const record_id = requiredString(value.record_id, 'record_id', 255);
  if (!/^[A-Za-z0-9._:-]+$/.test(record_id)) throw new ValidationError('record_id has an invalid format');
  return { record_id };
}

export function permanentAssistCode(value: unknown): string {
  const result = requiredString(value, 'assist_code', 128);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new ValidationError('assist_code has an invalid format');
  return result;
}

export function requestId(value: unknown): string | number {
  if (typeof value === 'number') return positiveId(value, 'request_id');
  const result = requiredString(value, 'request_id', 128);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new ValidationError('request_id has an invalid format');
  return result;
}
