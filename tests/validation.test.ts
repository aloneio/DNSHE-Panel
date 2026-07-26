import { describe, expect, it } from 'vitest';
import { dateOnly, dnsRecord, domain, ipWhitelist, optionalEnum, pagination, positiveId, recordIdentifier, subdomainFields } from '../functions/lib/validation.ts';

describe('input validation', () => {
  it('accepts structured SRV and CAA fields with V2 defaults and aliases', () => {
    expect(dnsRecord({ type: 'SRV', record_weight: 5, record_port: 443, record_target: 'service.example.com' })).toMatchObject({ type: 'SRV', priority: 0, weight: 5, port: 443, target: 'service.example.com', ttl: 600 });
    expect(dnsRecord({ type: 'CAA', caa_value: 'letsencrypt.org' })).toMatchObject({ type: 'CAA', caa_flag: 0, caa_tag: 'issue', ttl: 600 });
    expect(dnsRecord({ type: 'MX', content: 'mail.example.com' })).toMatchObject({ priority: 10, ttl: 600 });
  });
  it('rejects malformed domains, ranges, and unsafe pagination', () => {
    expect(() => domain('<img src=x>')).toThrow('invalid format');
    expect(() => dnsRecord({ type: 'CAA', caa_flag: 256, caa_tag: 'issue', caa_value: 'x' })).toThrow('caa_flag');
    expect(() => dnsRecord({ type: 'SRV', priority: 1, weight: 1, port: 0, target: 'x.example.com' })).toThrow('port');
    expect(() => dnsRecord({ type: 'A', content: '127.0.0.1', ttl: 59 })).toThrow('ttl');
    expect(() => pagination(new URLSearchParams('page=0&per_page=101'))).toThrow('page');
    expect(pagination(new URLSearchParams('page=2&per_page=500&include_total=1'), { maxPerPage: 500 })).toEqual({ page: 2, per_page: 500, include_total: true });
    expect(dateOnly('2025-01-31', 'created_to')).toBe('2025-01-31');
    expect(() => dateOnly('2025-02-31', 'created_to')).toThrow('valid calendar date');
    expect(optionalEnum('expires_at', 'sort_by', ['id', 'expires_at'])).toBe('expires_at');
    expect(subdomainFields('id,subdomain,status,id')).toBe('id,subdomain,status');
    expect(() => positiveId('0', 'id')).toThrow('positive integer');
    expect(ipWhitelist('203.0.113.10;\n198.51.100.0/24')).toBe('203.0.113.10,198.51.100.0/24');
    expect(recordIdentifier({ id: 9 })).toEqual({ id: 9 });
    expect(recordIdentifier({ record_id: 'provider:abc-123' })).toEqual({ record_id: 'provider:abc-123' });
    expect(() => dnsRecord({}, false)).toThrow('At least one');
  });
});
