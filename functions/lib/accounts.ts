import { ValidationError } from './errors.ts';
import type { Env } from './types.ts';

const ACCOUNT_PREFIX = 'account:';
const MAX_ACCOUNTS = 100;
const ACCOUNT_INDEX = /^[A-Za-z0-9_-]{1,64}$/;

export interface Account {
  accountIndex: string;
  alias: string;
  key: string;
  secret: string;
  source: 'kv' | 'environment';
}

export interface PublicAccount {
  accountIndex: string;
  alias: string;
  managed: boolean;
}

interface StoredAccount {
  accountIndex: string;
  alias: string;
  credentials: { iv: string; ciphertext: string };
  updatedAt: string;
}

interface AccountInput {
  accountIndex: string;
  alias: string;
  key: string;
  secret: string;
}

type AccountUpdate = { accountIndex: string; alias?: string; key?: string; secret?: string };

function compareIndices(left: string, right: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(left) && numeric.test(right)) return Number(left) - Number(right);
  if (numeric.test(left)) return -1;
  if (numeric.test(right)) return 1;
  return left.localeCompare(right);
}

function accountKey(accountIndex: string): string { return `${ACCOUNT_PREFIX}${accountIndex}`; }

function validStoredAccount(value: unknown, accountIndex: string): value is StoredAccount {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<StoredAccount>;
  return item.accountIndex === accountIndex && typeof item.alias === 'string' && typeof item.updatedAt === 'string' && typeof item.credentials?.iv === 'string' && typeof item.credentials?.ciphertext === 'string';
}

function environmentAccounts(env: Env): Account[] {
  const accounts: Account[] = [];
  for (const [name, value] of Object.entries(env)) {
    const key = typeof value === 'string' ? value : undefined;
    const match = /^DNSHE_KEY_([A-Za-z0-9_-]+)$/.exec(name);
    if (!match || !key) continue;
    const accountIndex = match[1];
    const secretValue = env[`DNSHE_SECRET_${accountIndex}`];
    const aliasValue = env[`DNSHE_ALIAS_${accountIndex}`];
    const secret = typeof secretValue === 'string' ? secretValue : undefined;
    if (!secret) continue;
    const alias = (typeof aliasValue === 'string' ? aliasValue.trim() : '') || `Account ${accountIndex}`;
    accounts.push({ accountIndex, alias, key, secret, source: 'environment' });
  }
  return accounts;
}

async function kvAccounts(env: Env): Promise<Account[]> {
  if (!env.ACCOUNTS_KV) return [];
  const listed = await env.ACCOUNTS_KV.list({ prefix: ACCOUNT_PREFIX, limit: MAX_ACCOUNTS + 1 });
  if (listed.keys.length > MAX_ACCOUNTS) throw new ValidationError(`A maximum of ${MAX_ACCOUNTS} accounts is supported`);
  const records = await Promise.all(listed.keys.map(async ({ name }): Promise<Account | undefined> => {
    const accountIndex = name.slice(ACCOUNT_PREFIX.length);
    if (!ACCOUNT_INDEX.test(accountIndex)) return undefined;
    const stored = await getStoredAccount(env.ACCOUNTS_KV!, accountIndex);
    if (!stored) return undefined;
    const credentials = await decryptCredentials(env, stored.credentials);
    return { accountIndex, alias: stored.alias, ...credentials, source: 'kv' as const };
  }));
  return records.filter((account): account is Account => Boolean(account));
}

async function kvPublicAccounts(env: Env): Promise<PublicAccount[]> {
  if (!env.ACCOUNTS_KV) return [];
  const listed = await env.ACCOUNTS_KV.list({ prefix: ACCOUNT_PREFIX, limit: MAX_ACCOUNTS + 1 });
  if (listed.keys.length > MAX_ACCOUNTS) throw new ValidationError(`A maximum of ${MAX_ACCOUNTS} accounts is supported`);
  const records = await Promise.all(listed.keys.map(async ({ name }): Promise<PublicAccount | undefined> => {
    const accountIndex = name.slice(ACCOUNT_PREFIX.length);
    if (!ACCOUNT_INDEX.test(accountIndex)) return undefined;
    const stored = await getStoredAccount(env.ACCOUNTS_KV!, accountIndex);
    return stored ? { accountIndex, alias: stored.alias, managed: true } : undefined;
  }));
  return records.filter((account): account is PublicAccount => Boolean(account));
}

export async function listAccounts(env: Env): Promise<Account[]> {
  const accounts = new Map<string, Account>();
  for (const account of environmentAccounts(env)) accounts.set(account.accountIndex, account);
  for (const account of await kvAccounts(env)) if (!accounts.has(account.accountIndex)) accounts.set(account.accountIndex, account);
  return [...accounts.values()].sort((a, b) => compareIndices(a.accountIndex, b.accountIndex));
}

export async function getAccount(env: Env, accountIndex: unknown): Promise<Account> {
  if (typeof accountIndex !== 'string' || !ACCOUNT_INDEX.test(accountIndex)) throw new ValidationError('Invalid accountIndex');
  if (env.ACCOUNTS_KV) {
    const stored = await getStoredAccount(env.ACCOUNTS_KV, accountIndex);
    if (stored) return { accountIndex, alias: stored.alias, ...(await decryptCredentials(env, stored.credentials)), source: 'kv' };
  }
  const account = environmentAccounts(env).find((item) => item.accountIndex === accountIndex);
  if (!account) throw new ValidationError('Account is not configured');
  return account;
}

export async function assertAccountIndex(env: Env, value: unknown): Promise<string> {
  return (await getAccount(env, value)).accountIndex;
}

export async function publicAccounts(env: Env): Promise<PublicAccount[]> {
  const accounts = new Map<string, PublicAccount>();
  for (const { accountIndex, alias } of environmentAccounts(env)) accounts.set(accountIndex, { accountIndex, alias, managed: false });
  for (const account of await kvPublicAccounts(env)) if (!accounts.has(account.accountIndex)) accounts.set(account.accountIndex, account);
  return [...accounts.values()].sort((a, b) => compareIndices(a.accountIndex, b.accountIndex));
}

export function accountCreateInput(value: Record<string, unknown>): AccountInput {
  const accountIndex = validAccountIndex(value.accountIndex);
  return {
    accountIndex,
    alias: stringValue(value.alias, 'alias', 80),
    key: stringValue(value.key, 'key', 512),
    secret: stringValue(value.secret, 'secret', 512)
  };
}

export function accountUpdateInput(value: Record<string, unknown>): AccountUpdate {
  const accountIndex = validAccountIndex(value.accountIndex);
  const alias = optionalStringValue(value.alias, 'alias', 80);
  const key = optionalStringValue(value.key, 'key', 512);
  const secret = optionalStringValue(value.secret, 'secret', 512);
  if (alias === undefined && key === undefined && secret === undefined) throw new ValidationError('Provide an alias, key, or secret to update');
  return { accountIndex, ...(alias === undefined ? {} : { alias }), ...(key === undefined ? {} : { key }), ...(secret === undefined ? {} : { secret }) };
}

export async function createAccount(env: Env, input: AccountInput): Promise<PublicAccount> {
  const kv = requiredKv(env);
  if (environmentAccounts(env).some((account) => account.accountIndex === input.accountIndex) || await getStoredAccount(kv, input.accountIndex)) throw new ValidationError('accountIndex is already configured');
  const stored: StoredAccount = {
    accountIndex: input.accountIndex,
    alias: input.alias,
    credentials: await encryptCredentials(env, { key: input.key, secret: input.secret }),
    updatedAt: new Date().toISOString()
  };
  await kv.put(accountKey(input.accountIndex), JSON.stringify(stored));
  return { accountIndex: input.accountIndex, alias: input.alias, managed: true };
}

export async function updateAccount(env: Env, input: AccountUpdate): Promise<PublicAccount> {
  const kv = requiredKv(env);
  const existing = await getStoredAccount(kv, input.accountIndex);
  if (!existing) {
    if (environmentAccounts(env).some((account) => account.accountIndex === input.accountIndex)) throw new ValidationError('Environment-configured accounts cannot be edited in the panel');
    throw new ValidationError('Account is not configured');
  }
  const credentials = input.key === undefined && input.secret === undefined
    ? existing.credentials
    : await encryptCredentials(env, { ...(await decryptCredentials(env, existing.credentials)), ...(input.key === undefined ? {} : { key: input.key }), ...(input.secret === undefined ? {} : { secret: input.secret }) });
  const next: StoredAccount = { ...existing, alias: input.alias ?? existing.alias, credentials, updatedAt: new Date().toISOString() };
  await kv.put(accountKey(input.accountIndex), JSON.stringify(next));
  return { accountIndex: next.accountIndex, alias: next.alias, managed: true };
}

export async function deleteAccount(env: Env, accountIndex: unknown): Promise<void> {
  const index = validAccountIndex(accountIndex);
  const kv = requiredKv(env);
  if (!await getStoredAccount(kv, index)) {
    if (environmentAccounts(env).some((account) => account.accountIndex === index)) throw new ValidationError('Environment-configured accounts cannot be deleted in the panel');
    throw new ValidationError('Account is not configured');
  }
  await kv.delete(accountKey(index));
}

function requiredKv(env: Env): KVNamespace {
  if (!env.ACCOUNTS_KV) throw new ValidationError('Account storage is not configured');
  return env.ACCOUNTS_KV;
}

async function getStoredAccount(kv: KVNamespace, accountIndex: string): Promise<StoredAccount | undefined> {
  const value = await kv.get(accountKey(accountIndex), 'json');
  return validStoredAccount(value, accountIndex) ? value : undefined;
}

async function encryptCredentials(env: Env, credentials: { key: string; secret: string }): Promise<StoredAccount['credentials']> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asArrayBuffer(iv) }, await encryptionKey(env), asArrayBuffer(plaintext));
  return { iv: encodeBase64(iv), ciphertext: encodeBase64(new Uint8Array(ciphertext)) };
}

async function decryptCredentials(env: Env, credentials: StoredAccount['credentials']): Promise<{ key: string; secret: string }> {
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asArrayBuffer(decodeBase64(credentials.iv)) }, await encryptionKey(env), asArrayBuffer(decodeBase64(credentials.ciphertext)));
    const decoded: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Invalid credentials');
    const value = decoded as { key?: unknown; secret?: unknown };
    if (typeof value.key !== 'string' || typeof value.secret !== 'string' || !value.key || !value.secret) throw new Error('Invalid credentials');
    return { key: value.key, secret: value.secret };
  } catch {
    throw new ValidationError('Stored account credentials could not be decrypted');
  }
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const encoded = env.ACCOUNT_ENCRYPTION_KEY;
  if (typeof encoded !== 'string') throw new ValidationError('Credential encryption is not configured');
  const raw = decodeBase64(encoded);
  if (raw.byteLength !== 32) throw new ValidationError('Credential encryption is not configured');
  return crypto.subtle.importKey('raw', asArrayBuffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function encodeBase64(value: Uint8Array): string { return btoa(String.fromCharCode(...value)); }
function asArrayBuffer(value: Uint8Array): ArrayBuffer { return value.slice().buffer as ArrayBuffer; }
function decodeBase64(value: string): Uint8Array {
  try { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
  catch { throw new ValidationError('Credential encryption is not configured'); }
}

function validAccountIndex(value: unknown): string {
  const accountIndex = stringValue(value, 'accountIndex', 64);
  if (!ACCOUNT_INDEX.test(accountIndex) || accountIndex === 'all') throw new ValidationError('accountIndex has an invalid format');
  return accountIndex;
}

function stringValue(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} is required`);
  const result = value.trim();
  if (!result) throw new ValidationError(`${field} is required`);
  if (result.length > max) throw new ValidationError(`${field} is too long`);
  return result;
}

function optionalStringValue(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  return stringValue(value, field, max);
}
