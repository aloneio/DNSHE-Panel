import { apiFetch, errorMessage, withLoading } from './api.js';
import { loadAccounts, selectedAccount } from './accounts.js';
import { refreshSession, installAuthentication } from './auth.js';
import { button, clear, el, textCell } from './dom.js';
import { bindDialogClose, closeDialog, confirmAction, openDialog } from './dialog.js';
import { clearStatus, showStatus, toast } from './status.js';
import { initializeI18n, t } from './i18n.js';

const upgrades = { page: 1, perPage: 50, hasMore: false };

function labeledCell(label, children) { return el('td', { 'data-label': label }, Array.isArray(children) ? children : [children]); }
function showResult(title, summary, data, trigger) { document.querySelector('#result-title').textContent = title; document.querySelector('#result-summary').textContent = summary; document.querySelector('#result-value').textContent = JSON.stringify(data, null, 2); openDialog(document.querySelector('#result-dialog'), trigger); }
function detailItem(label, value) { return el('div', { className: 'detail-item' }, [el('dt', { text: label }), el('dd', { text: value == null || value === '' ? '—' : Array.isArray(value) ? value.join(', ') : String(value) })]); }

function renderKeys(keys) {
  const body = document.querySelector('#keys-body'); clear(body);
  if (!keys.length) return body.append(el('tr', {}, [el('td', { colSpan: 7, className: 'empty-cell', text: t('No API keys found.') })]));
  for (const key of keys) {
    const actions = el('td', { className: 'actions', 'data-label': t('Actions') });
    actions.append(button(t('Regenerate'), { className: 'btn btn--quiet', 'data-action': 'regenerate', 'data-id': key.id || key.key_id }));
    actions.append(button(t('Delete'), { className: 'btn btn--danger', 'data-action': 'delete', 'data-id': key.id || key.key_id }));
    const name = labeledCell(t('Name / Key'), [el('div', { className: 'cell-primary', text: key.key_name }), el('div', { className: 'cell-secondary mono', text: key.api_key })]);
    body.append(el('tr', {}, [textCell(key.id || key.key_id, 'mono', t('ID')), name, textCell(key.status, '', t('Status')), textCell(key.request_count ?? 0, '', t('Requests')), textCell(key.last_used_at, '', t('Last used')), textCell(key.created_at, '', t('Created')), actions]));
  }
}

function clearSecret() { const value = document.querySelector('#secret-value'); if (value) value.textContent = ''; }
function showSecret(response, trigger) { const secret = response.api_secret || response.data?.api_secret || response.data?.secret; if (!secret) return; const dialog = document.querySelector('#secret-dialog'); clearSecret(); dialog.querySelector('#secret-value').textContent = secret; openDialog(dialog, trigger); }

async function loadKeys() {
  const accountIndex = selectedAccount(document.querySelector('#tools-account')); const status = document.querySelector('#tools-status');
  try { const response = await apiFetch(`/api/keys?accountIndex=${encodeURIComponent(accountIndex)}`); renderKeys(response.data.keys || []); showStatus(status, t('Loaded {count} API key(s).', { count: response.data.count ?? response.data.keys?.length ?? 0 }), 'success'); }
  catch (error) { renderKeys([]); showStatus(status, errorMessage(error), 'error'); }
}

function renderQuota(quota) {
  for (const [key, id] of Object.entries({ available: 'quota-available', used: 'quota-used', base: 'quota-base', invite_bonus: 'quota-invite', total: 'quota-total' })) document.querySelector(`#${id}`).textContent = String(quota?.[key] ?? '—');
  const used = Number(quota?.used || 0); const total = Number(quota?.total || 0); const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  document.querySelector('#quota-progress').style.width = `${percent}%`;
  document.querySelector('#quota-percent').textContent = total > 0 ? t('{percent}% used', { percent }) : t('No capacity data');
  document.querySelector('#quota-value').textContent = JSON.stringify(quota || {}, null, 2);
}
async function loadQuota() { try { const response = await apiFetch(`/api/quota?accountIndex=${encodeURIComponent(selectedAccount(document.querySelector('#tools-account')))}`); renderQuota(response.data.quota); } catch (error) { renderQuota({}); document.querySelector('#quota-value').textContent = errorMessage(error); } }

function renderEligible(items) {
  const body = document.querySelector('#eligible-body'); const select = document.querySelector('#upgrade-subdomain-id'); clear(body); clear(select).append(el('option', { value: '', text: items.length ? t('Select an eligible subdomain') : t('No eligible subdomains') }));
  if (!items.length) return body.append(el('tr', {}, [el('td', { colSpan: 4, className: 'empty-cell', text: t('No eligible subdomains reported.') })]));
  for (const item of items) {
    const id = item.subdomain_id || item.id; const domain = item.full_domain || item.domain || [item.subdomain, item.rootdomain].filter(Boolean).join('.');
    select.append(el('option', { value: id, text: `${domain || t('Subdomain {id}', { id })} (#${id})` }));
    const actions = el('td', { className: 'actions', 'data-label': t('Action') }, [button(t('Select'), { className: 'btn btn--quiet', 'data-action': 'select-eligible', 'data-id': id })]);
    body.append(el('tr', {}, [textCell(id, 'mono', t('ID')), textCell(domain, '', t('Domain')), textCell(item.status || t('eligible'), '', t('Status')), actions]));
  }
}
function renderAssistLogs(items) {
  const body = document.querySelector('#assist-logs-body'); clear(body);
  if (!items.length) return body.append(el('tr', {}, [el('td', { colSpan: 5, className: 'empty-cell', text: t('No assist activity.') })]));
  for (const item of items) body.append(el('tr', {}, [textCell(item.id || item.log_id, 'mono', t('ID')), textCell(item.assist_code || item.request_id, 'mono', t('Code / Request')), textCell(item.status, '', t('Status')), textCell(item.account || item.user || item.assisted_by, '', t('Account / User')), textCell(item.created_at, '', t('Created'))]));
}
function renderUpgrades(items) {
  const body = document.querySelector('#upgrades-body'); clear(body);
  if (!items.length) return body.append(el('tr', {}, [el('td', { colSpan: 6, className: 'empty-cell', text: t('No permanent-upgrade requests.') })]));
  for (const item of items) {
    const requestId = item.request_id || item.id; const actions = el('td', { className: 'actions', 'data-label': t('Actions') });
    actions.append(button(t('Assist'), { className: 'btn btn--quiet', 'data-action': 'assist-upgrade', 'data-id': requestId })); actions.append(button(t('Cancel'), { className: 'btn btn--danger', 'data-action': 'cancel-upgrade', 'data-id': requestId }));
    body.append(el('tr', {}, [textCell(requestId, 'mono', t('Request')), textCell(item.full_domain || item.domain || item.subdomain_id, '', t('Subdomain')), textCell(item.status, '', t('Status')), textCell(item.created_at, '', t('Created')), textCell(item.updated_at, '', t('Updated')), actions]));
  }
}
function renderUpgradePagination() { document.querySelector('#upgrade-page-label').textContent = t('Page {page}', { page: upgrades.page }); document.querySelector('#upgrade-previous').disabled = upgrades.page <= 1; document.querySelector('#upgrade-next').disabled = !upgrades.hasMore; }
async function loadUpgrades() {
  const body = document.querySelector('#upgrades-body'); clear(body);
  try { const accountIndex = selectedAccount(document.querySelector('#tools-account')); const response = await apiFetch(`/api/permanent_upgrade?accountIndex=${encodeURIComponent(accountIndex)}&page=${upgrades.page}&per_page=${upgrades.perPage}`); renderUpgrades(response.data.upgrades || []); renderAssistLogs(response.data.assistLogs || []); renderEligible(response.data.eligibleSubdomains || []); upgrades.hasMore = Boolean(response.pagination?.has_more ?? (response.data.upgrades || []).length === upgrades.perPage); renderUpgradePagination(); }
  catch (error) { renderEligible([]); renderAssistLogs([]); body.append(el('tr', {}, [el('td', { colSpan: 6, className: 'empty-cell', text: errorMessage(error) })])); upgrades.hasMore = false; renderUpgradePagination(); }
}

function renderWhois(value) {
  const target = document.querySelector('#whois-fields'); clear(target); target.hidden = false;
  const fields = [[t('Domain'), value.domain], [t('Registered'), value.registered === false ? t('No') : t('Yes')], [t('Status'), value.status], [t('Registered at'), value.registered_at], [t('Expires at'), value.expires_at], [t('Registrant email'), value.registrant_email], [t('Nameservers'), value.nameservers || value.name_servers], [t('Rate limit'), value.rate_limit ? t('{remaining}/{limit} remaining; reset {reset}', { remaining: value.rate_limit.remaining, limit: value.rate_limit.limit, reset: value.rate_limit.reset_at || t('Unknown') }) : t('Not reported')]];
  for (const [label, fieldValue] of fields) target.append(detailItem(label, fieldValue));
  document.querySelector('#whois-result').textContent = JSON.stringify(value, null, 2);
}

let toolsInstalled = false;
function installTools() {
  if (toolsInstalled) return; toolsInstalled = true; const selector = document.querySelector('#tools-account');
  selector.addEventListener('change', async () => { upgrades.page = 1; await Promise.all([loadKeys(), loadQuota(), loadUpgrades()]); });
  document.querySelector('#refresh-keys').addEventListener('click', (event) => withLoading(event.currentTarget, () => Promise.all([loadKeys(), loadQuota(), loadUpgrades()])));
  document.querySelector('#key-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; try { const values = Object.fromEntries(new FormData(form).entries()); values.action = 'create'; values.accountIndex = selectedAccount(selector); const result = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/keys', { method: 'POST', body: JSON.stringify(values) })); closeDialog(document.querySelector('#key-dialog')); showSecret(result.data, document.querySelector('#new-key')); toast(result.data.warning || t('API key created. Store its secret now.'), 'success'); await loadKeys(); } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); } });
  document.querySelector('#new-key').addEventListener('click', (event) => { const form = document.querySelector('#key-form'); form.reset(); clearStatus(form.querySelector('.form-status')); openDialog(document.querySelector('#key-dialog'), event.target); });
  document.querySelector('#keys-body').addEventListener('click', async (event) => { const target = event.target.closest('button'); const action = target?.dataset.action; if (!action) return; const keyId = target.dataset.id; const accountIndex = selectedAccount(selector); if (action === 'delete') { if (!await confirmAction({ title: t('Delete API key'), message: t('Delete API key #{id} permanently?', { id: keyId }), confirmLabel: t('Delete key') })) return; try { const result = await withLoading(target, () => apiFetch('/api/keys', { method: 'DELETE', body: JSON.stringify({ accountIndex, key_id: Number(keyId) }) })); showResult(t('API key deleted'), result.data.message || t('Key #{id} deleted.', { id: keyId }), result.data, target); await loadKeys(); } catch (error) { toast(errorMessage(error), 'error'); } } else if (action === 'regenerate') { if (!await confirmAction({ title: t('Regenerate API key'), message: t('The existing API secret will stop working. Continue?'), confirmLabel: t('Regenerate') })) return; try { const result = await withLoading(target, () => apiFetch('/api/keys', { method: 'POST', body: JSON.stringify({ action: 'regenerate', accountIndex, key_id: Number(keyId) }) })); showSecret(result.data, target); toast(result.data.warning || t('API key regenerated. Store its new secret now.'), 'success'); await loadKeys(); } catch (error) { toast(errorMessage(error), 'error'); } } });
  document.querySelector('#whois-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const domain = values.get('domain'); const mode = values.get('mode'); try { const response = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch(`/api/whois?accountIndex=${encodeURIComponent(selectedAccount(selector))}&mode=${encodeURIComponent(mode)}&domain=${encodeURIComponent(domain)}`)); renderWhois(response.data.whois); document.querySelector('#whois-auth-mode').textContent = response.data.authMode === 'public' ? t('Queried with DNSHE public WHOIS mode.') : t('Queried with the selected DNSHE account.'); } catch (error) { document.querySelector('#whois-fields').hidden = true; document.querySelector('#whois-auth-mode').textContent = t('WHOIS lookup failed.'); document.querySelector('#whois-result').textContent = errorMessage(error); } });
  document.querySelector('#eligible-body').addEventListener('click', (event) => { const target = event.target.closest('button[data-action="select-eligible"]'); if (target) { document.querySelector('#upgrade-subdomain-id').value = target.dataset.id; document.querySelector('#upgrade-subdomain-id').focus(); } });
  document.querySelector('#upgrade-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; const id = Number(new FormData(form).get('subdomain_id')); if (!await confirmAction({ title: t('Request permanent upgrade'), message: t('Request permanent upgrade for subdomain #{id}? This can affect quota and may be irreversible.', { id }), confirmLabel: t('Request upgrade') })) return; try { const result = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/permanent_upgrade', { method: 'PUT', body: JSON.stringify({ action: 'create', accountIndex: selectedAccount(selector), subdomain_id: id }) })); showResult(t('Permanent upgrade requested'), result.data.message || t('Upgrade requested for subdomain #{id}.', { id }), result.data, form.querySelector('[type="submit"]')); form.reset(); await loadUpgrades(); } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); } });
  document.querySelector('#upgrades-body').addEventListener('click', async (event) => { const target = event.target.closest('button'); const action = target?.dataset.action; if (!action) return; const request_id = target.dataset.id; if (action === 'cancel-upgrade') { if (!await confirmAction({ title: t('Cancel permanent upgrade'), message: t('Cancel permanent-upgrade request #{id}?', { id: request_id }), confirmLabel: t('Cancel request') })) return; try { const result = await withLoading(target, () => apiFetch('/api/permanent_upgrade', { method: 'DELETE', body: JSON.stringify({ accountIndex: selectedAccount(selector), request_id }) })); showResult(t('Upgrade request cancelled'), result.data.message || t('Request #{id} cancelled.', { id: request_id }), result.data, target); await loadUpgrades(); } catch (error) { toast(errorMessage(error), 'error'); } } else { const form = document.querySelector('#assist-form'); form.reset(); clearStatus(form.querySelector('.form-status')); openDialog(document.querySelector('#assist-dialog'), target); } });
  document.querySelector('#open-assist').addEventListener('click', (event) => { const form = document.querySelector('#assist-form'); form.reset(); clearStatus(form.querySelector('.form-status')); openDialog(document.querySelector('#assist-dialog'), event.currentTarget); });
  document.querySelector('#assist-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries()); if (!await confirmAction({ title: t('Submit assist code'), message: t('Submit this assist code for the selected account?'), confirmLabel: t('Submit code') })) return; try { const result = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/permanent_upgrade', { method: 'POST', body: JSON.stringify({ action: 'assist', accountIndex: selectedAccount(selector), assist_code: values.assist_code }) })); closeDialog(document.querySelector('#assist-dialog')); showResult(t('Assist code submitted'), result.data.message || t('Assist operation completed.'), result.data, document.querySelector('#open-assist')); await loadUpgrades(); } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); } });
  document.querySelector('#upgrade-previous').addEventListener('click', () => { if (upgrades.page > 1) { upgrades.page -= 1; loadUpgrades(); } }); document.querySelector('#upgrade-next').addEventListener('click', () => { if (upgrades.hasMore) { upgrades.page += 1; loadUpgrades(); } });
  document.querySelector('#copy-secret').addEventListener('click', async () => { try { await navigator.clipboard.writeText(document.querySelector('#secret-value').textContent); toast(t('Secret copied.'), 'success'); } catch { toast(t('Copy is unavailable. Select and copy the displayed value.'), 'warning'); } });
  const secretDialog = document.querySelector('#secret-dialog'); secretDialog.addEventListener('close', clearSecret); ['key-dialog', 'secret-dialog', 'assist-dialog', 'result-dialog'].forEach((id) => bindDialogClose(document.querySelector(`#${id}`)));
}

async function initialize() { await loadAccounts(document.querySelector('#tools-account')); installTools(); upgrades.page = 1; renderUpgradePagination(); await Promise.all([loadKeys(), loadQuota(), loadUpgrades()]); }
async function initializeSafely() { try { await initialize(); } catch (error) { showStatus(document.querySelector('#tools-status'), t('Signed in, but the tools page could not initialize: {message}', { message: errorMessage(error) }), 'error'); toast(errorMessage(error), 'error'); } }
initializeI18n();
const auth = installAuthentication({ onAuthenticated: initializeSafely });
refreshSession().then(initializeSafely).catch((error) => { if (error?.status === 401) auth.requireLogin(); else showStatus(document.querySelector('#tools-status'), t('Unable to check the current session: {message}', { message: errorMessage(error) }), 'error'); });
