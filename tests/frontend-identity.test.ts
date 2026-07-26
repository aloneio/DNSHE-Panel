import { describe, expect, it } from 'vitest';
import { findSubdomainByIdentity, subdomainId } from '../public/js/subdomain-identity.js';

describe('multi-account subdomain identity', () => {
  it('matches duplicate subdomain ids within the clicked account scope', () => {
    const subdomains = [
      { id: 1, accountIndex: '1', full_domain: 'one.example.com' },
      { id: 1, accountIndex: '2', full_domain: 'two.example.com' }
    ];
    expect(subdomainId(subdomains[0])).toBe(1);
    expect(findSubdomainByIdentity(subdomains, '2', '1')).toMatchObject({ accountIndex: '2', full_domain: 'two.example.com' });
  });
});
