import { ValidationError } from './errors.ts';
import type { Env } from './types.ts';

export interface Account {
  accountIndex: string;
  alias: string;
  key: string;
  secret: string;
}

function compareIndices(left: string, right: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(left) && numeric.test(right)) return Number(left) - Number(right);
  if (numeric.test(left)) return -1;
  if (numeric.test(right)) return 1;
  return left.localeCompare(right);
}

export function listAccounts(env: Env): Account[] {
  const accounts: Account[] = [];
  for (const [name, key] of Object.entries(env)) {
    const match = /^DNSHE_KEY_([A-Za-z0-9_-]+)$/.exec(name);
    if (!match || !key) continue;
    const accountIndex = match[1];
    const secret = env[`DNSHE_SECRET_${accountIndex}`];
    if (!secret) continue;
    const alias = env[`DNSHE_ALIAS_${accountIndex}`]?.trim() || `Account ${accountIndex}`;
    accounts.push({ accountIndex, alias, key, secret });
  }
  return accounts.sort((a, b) => compareIndices(a.accountIndex, b.accountIndex));
}

export function getAccount(env: Env, accountIndex: unknown): Account {
  if (typeof accountIndex !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(accountIndex)) {
    throw new ValidationError('Invalid accountIndex');
  }
  const account = listAccounts(env).find((item) => item.accountIndex === accountIndex);
  if (!account) throw new ValidationError('Account is not configured');
  return account;
}

export function assertAccountIndex(env: Env, value: unknown): string {
  return getAccount(env, value).accountIndex;
}

export function publicAccounts(env: Env): Array<Pick<Account, 'accountIndex' | 'alias'>> {
  return listAccounts(env).map(({ accountIndex, alias }) => ({ accountIndex, alias }));
}
