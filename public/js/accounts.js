import { apiFetch } from './api.js';
import { clear, el } from './dom.js';
import { t } from './i18n.js';

export async function loadAccounts(selector, { allowAll = false } = {}) {
  const response = await apiFetch('/api/accounts');
  const accounts = response.data.accounts || [];
  clear(selector);
  if (allowAll) selector.append(el('option', { value: 'all', text: t('All configured accounts') }));
  for (const account of accounts) selector.append(el('option', { value: account.accountIndex, text: account.alias }));
  return accounts;
}

export async function createManagedAccount(values) {
  const response = await apiFetch('/api/accounts', { method: 'POST', body: JSON.stringify(values) });
  return response.data.account;
}

export async function updateManagedAccount(values) {
  const response = await apiFetch('/api/accounts', { method: 'PATCH', body: JSON.stringify(values) });
  return response.data.account;
}

export async function deleteManagedAccount(accountIndex) {
  await apiFetch('/api/accounts', { method: 'DELETE', body: JSON.stringify({ accountIndex }) });
}

export function selectedAccount(selector) { return selector?.value || ''; }
