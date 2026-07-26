export interface SubdomainIdentity {
  id?: string | number;
  subdomain_id?: string | number;
  accountIndex?: string | number;
  [key: string]: unknown;
}

export function subdomainId(subdomain: SubdomainIdentity): string | number | undefined;
export function findSubdomainByIdentity<T extends SubdomainIdentity>(subdomains: T[], accountIndex: string | number, id: string | number): T | undefined;
