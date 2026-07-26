import { describe, expect, it } from 'vitest';
import { dnsRecord, domain, ipWhitelist, pagination, positiveId, recordIdentifier } from '../functions/lib/validation.ts';

describe('input validation', () => {
  it('accepts structured SRV and CAA fields', () => {
    expect(dnsRecord({ type: 'SRV', priority: 10, weight: 5, port: 443, target: 'service.example.com' })).toMatchObject({ type: 'SRV', port: 443, target: 'service.example.com' });
    expect(dnsRecord({ type: 'CAA', caa_flag: 0, caa_tag: 'issue', caa_value: 'letsencrypt.org' })).toMatchObject({ type: 'CAA', caa_tag: 'issue' });
  });
  it('rejects malformed domains, ranges, and unsafe pagination', () => {
    expect(() => domain('<img src=x>')).toThrow('invalid format');
    expect(() => dnsRecord({ type: 'CAA', caa_flag: 256, caa_tag: 'issue', caa_value: 'x' })).toThrow('caa_flag');
    expect(() => dnsRecord({ type: 'SRV', priority: 1, weight: 1, port: 0, target: 'x.example.com' })).toThrow('port');
    expect(() => dnsRecord({ type: 'A', content: '127.0.0.1', ttl: 59 })).toThrow('ttl');
    expect(() => pagination(new URLSearchParams('page=0&per_page=101'))).toThrow('page');
    expect(() => positiveId('0', 'id')).toThrow('positive integer');
    expect(ipWhitelist('203.0.113.10;\n198.51.100.0/24')).toBe('203.0.113.10,198.51.100.0/24');
    expect(recordIdentifier({ id: 9 })).toEqual({ id: 9 });
    expect(recordIdentifier({ record_id: 'provider:abc-123' })).toEqual({ record_id: 'provider:abc-123' });
    expect(() => dnsRecord({}, false)).toThrow('At least one');
  });
});
