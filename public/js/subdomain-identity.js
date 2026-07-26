export function subdomainId(subdomain) {
  return subdomain?.subdomain_id ?? subdomain?.id;
}

export function findSubdomainByIdentity(subdomains, accountIndex, id) {
  return subdomains.find((entry) => String(entry.accountIndex) === String(accountIndex) && String(subdomainId(entry)) === String(id));
}
