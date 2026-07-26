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

export function selectedAccount(selector) { return selector?.value || ''; }
