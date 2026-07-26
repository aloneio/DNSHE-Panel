import { apiFetch, errorMessage, withLoading } from './api.js';
import { loadAccounts } from './accounts.js';
import { refreshSession, installAuthentication } from './auth.js';
import { button, clear, el, textCell } from './dom.js';
import { bindDialogClose, closeDialog, confirmAction, openDialog } from './dialog.js';
import { createPagination } from './pagination.js';
import { openRecords, installDnsRecords } from './dns-records.js';
import { recordValue } from './record-schema.js';
import { clearStatus, showStatus, toast } from './status.js';
import { findSubdomainByIdentity, subdomainId } from './subdomain-identity.js';
import { initializeI18n, t } from './i18n.js';

const state = { accounts: [], subdomains: [], response: null };
let pagination;
let initialized = false;

function domainOf(item) { return item.full_domain || item.domain || [item.subdomain, item.rootdomain].filter(Boolean).join('.') || item.subdomain; }
function badge(status) {
  const normalized = String(status || 'unknown').toLowerCase();
  return el('span', { className: `badge badge--${normalized}`, text: t(status || 'Unknown') });
}
function labeledCell(label, children, className) { return el('td', { 'data-label': label, ...(className ? { className } : {}) }, Array.isArray(children) ? children : [children]); }

function renderMetrics(items, response) {
  document.querySelector('#metric-domains').textContent = String(items.length);
  document.querySelector('#metric-active').textContent = String(items.filter((item) => item.status === 'active').length);
  document.querySelector('#metric-attention').textContent = String(items.filter((item) => ['suspended', 'expired'].includes(item.status)).length);
  document.querySelector('#metric-accounts').textContent = String(state.accounts.length);
  document.querySelector('#metric-page').textContent = String(pagination.state.page);
  const byAccount = response?.pagination?.byAccount || {};
  const hasMore = Object.values(byAccount).some((item) => item.has_more);
  document.querySelector('#metric-page-note').textContent = t('Has more: {value}', { value: t(hasMore ? 'yes' : 'no') });
  const totals = Object.values(byAccount).map((item) => item.total).filter(Number.isFinite);
  document.querySelector('#total-label').textContent = totals.length ? t('Reported total: {total}', { total: totals.reduce((sum, value) => sum + value, 0) }) : t('Total not requested');
}

function renderPartialErrors(errors = []) {
  const list = document.querySelector('#partial-errors');
  clear(list);
  list.hidden = !errors.length;
  for (const error of errors) list.append(el('li', { text: `${error.accountAlias}: ${error.message} [${error.error_code || error.status}]` }));
}

function renderSubdomains(items) {
  const body = document.querySelector('#subdomains-body');
  clear(body);
  if (!items.length) {
    body.append(el('tr', {}, [el('td', { colSpan: 8, className: 'empty-cell', text: t('No subdomains match this page and filter set.') })]));
    return;
  }
  for (const item of items) {
    const identity = { 'data-account-index': item.accountIndex, 'data-id': subdomainId(item) };
    const actions = el('td', { className: 'actions', 'data-label': t('Actions') });
    actions.append(button(t('Details'), { className: 'btn btn--quiet', 'data-action': 'details', ...identity }));
    actions.append(button(t('DNS records'), { className: 'btn btn--quiet', 'data-action': 'records', ...identity }));
    actions.append(button(t('Renew'), { className: 'btn btn--secondary', 'data-action': 'renew', ...identity }));
    actions.append(button(t('Delete'), { className: 'btn btn--danger', 'data-action': 'delete', ...identity }));
    const domainCell = labeledCell(t('Domain'), [el('div', { className: 'cell-primary', text: domainOf(item) }), el('div', { className: 'cell-secondary', text: item.rootdomain || '—' })]);
    const providerCell = labeledCell(t('Provider'), [el('div', { className: 'mono', text: item.cloudflare_zone_id || t('No zone ID') }), el('div', { className: 'cell-secondary', text: item.provider_account_id || t('No provider account ID') })]);
    body.append(el('tr', {}, [domainCell, textCell(subdomainId(item), 'mono', t('ID')), labeledCell(t('Status'), badge(item.status)), textCell(item.accountAlias, '', t('Account')), textCell(item.created_at, '', t('Created')), textCell(item.never_expires ? t('Never') : item.expires_at, '', t('Expires')), providerCell, actions]));
  }
}

function filterParams() {
  const values = new FormData(document.querySelector('#subdomain-filters'));
  const params = new URLSearchParams({ accountIndex: document.querySelector('#account-filter').value, page: String(pagination.state.page), per_page: document.querySelector('#per-page').value });
  for (const [key, value] of values) if (key !== 'accountIndex' && key !== 'per_page' && String(value).trim()) params.set(key, String(value).trim());
  return params;
}

async function loadSubdomains() {
  const status = document.querySelector('#subdomains-status');
  showStatus(status, t('Loading subdomains…'));
  try {
    const response = await apiFetch(`/api/subdomains?${filterParams()}`);
    state.response = response;
    state.subdomains = response.data.subdomains || [];
    renderSubdomains(state.subdomains);
    renderPartialErrors(response.partialErrors);
    const accountIndex = document.querySelector('#account-filter').value;
    const byAccount = response.pagination?.byAccount || {};
    const hasMore = accountIndex === 'all' ? Object.values(byAccount).some((item) => item.has_more) : byAccount[accountIndex]?.has_more;
    pagination.setHasMore(Boolean(hasMore)); pagination.render();
    renderMetrics(state.subdomains, response);
    const failed = response.partialErrors?.length;
    showStatus(status, failed ? t('Loaded {count} domains; {failed} account(s) returned errors below.', { count: state.subdomains.length, failed }) : t('Loaded {count} domain(s).', { count: state.subdomains.length }), failed ? 'warning' : 'success');
  } catch (error) { state.subdomains = []; renderSubdomains([]); renderPartialErrors([]); renderMetrics([], null); showStatus(status, errorMessage(error), 'error'); }
}

function showResult(title, summary, data, trigger) {
  document.querySelector('#result-title').textContent = title;
  document.querySelector('#result-summary').textContent = summary;
  document.querySelector('#result-value').textContent = JSON.stringify(data, null, 2);
  openDialog(document.querySelector('#result-dialog'), trigger);
}

function detailItem(label, value) { return el('div', { className: 'detail-item' }, [el('dt', { text: label }), el('dd', { className: typeof value === 'string' && value.length > 36 ? 'mono' : '', text: value ?? '—' })]); }
function renderDetails(data) {
  const item = data.subdomain || {};
  const grid = document.querySelector('#details-grid'); clear(grid);
  const fields = [[t('Full domain'), domainOf(item)], [t('ID'), subdomainId(item)], [t('Status'), item.status], [t('Account'), item.accountAlias], [t('Subdomain'), item.subdomain], [t('Root domain'), item.rootdomain], [t('Created'), item.created_at], [t('Updated'), item.updated_at], [t('Expires'), item.never_expires ? t('Never') : item.expires_at], [t('Never expires'), item.never_expires ? t('Yes') : t('No')], [t('Cloudflare zone'), item.cloudflare_zone_id], [t('Provider account'), item.provider_account_id]];
  for (const [label, value] of fields) grid.append(detailItem(label, value));
  document.querySelector('#details-dns-count').textContent = t('{count} record(s) reported by the detail endpoint.', { count: data.dns_count ?? data.dns_records?.length ?? 0 });
  const body = document.querySelector('#details-records-body'); clear(body);
  const records = data.dns_records || [];
  if (!records.length) body.append(el('tr', {}, [el('td', { colSpan: 6, className: 'empty-cell', text: t('No embedded DNS records.') })]));
  for (const record of records) body.append(el('tr', {}, [textCell(record.id || record.record_id, 'mono', t('ID')), textCell(record.type, '', t('Type')), textCell(record.name, 'mono', t('Name')), textCell(recordValue(record), 'mono', t('Value')), textCell(record.ttl, '', t('TTL')), textCell(record.status, '', t('Status'))]));
}

async function openDetails(item, trigger) {
  try {
    const params = new URLSearchParams({ accountIndex: item.accountIndex, subdomain_id: String(subdomainId(item)) });
    const response = await withLoading(trigger, () => apiFetch(`/api/subdomains?${params}`));
    document.querySelector('#details-title').textContent = t('Domain details · {domain}', { domain: domainOf(item) });
    renderDetails(response.data); openDialog(document.querySelector('#details-dialog'), trigger);
  } catch (error) { toast(errorMessage(error), 'error'); }
}

function setupSubdomainActions() {
  document.querySelector('#subdomains-body').addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) return;
    const item = findSubdomainByIdentity(state.subdomains, actionButton.dataset.accountIndex, actionButton.dataset.id);
    if (!item) return;
    const accountIndex = item.accountIndex;
    const subdomain_id = subdomainId(item);
    if (actionButton.dataset.action === 'details') return openDetails(item, actionButton);
    if (actionButton.dataset.action === 'records') return openRecords(item, actionButton);
    if (actionButton.dataset.action === 'renew') {
      if (!await confirmAction({ title: t('Renew subdomain'), message: t('Renew {domain}? DNSHE may charge account balance and returns the exact amount.', { domain: domainOf(item) }), confirmLabel: t('Renew') })) return;
      try { const response = await withLoading(actionButton, () => apiFetch('/api/subdomains', { method: 'PUT', body: JSON.stringify({ action: 'renew', accountIndex, subdomain_id }) })); showResult(t('Subdomain renewed'), t('{domain} was renewed. Review expiry and charge details.', { domain: domainOf(item) }), response.data, actionButton); await loadSubdomains(); }
      catch (error) { toast(errorMessage(error), 'error'); }
      return;
    }
    if (actionButton.dataset.action === 'delete') {
      if (!await confirmAction({ title: t('Delete subdomain'), message: t('Delete {domain} permanently? DNSHE will also report how many DNS records were deleted.', { domain: domainOf(item) }), confirmLabel: t('Delete subdomain') })) return;
      try { const response = await withLoading(actionButton, () => apiFetch('/api/subdomains', { method: 'DELETE', body: JSON.stringify({ accountIndex, subdomain_id }) })); showResult(t('Subdomain deleted'), t('{domain} was deleted.', { domain: domainOf(item) }), response.data, actionButton); await loadSubdomains(); }
      catch (error) { toast(errorMessage(error), 'error'); }
    }
  });
}

function setupRegistration() {
  const dialog = document.querySelector('#register-dialog');
  const form = document.querySelector('#register-form');
  bindDialogClose(dialog);
  document.querySelector('#register-button').addEventListener('click', (event) => {
    form.reset(); clearStatus(form.querySelector('.form-status'));
    const selector = form.elements.accountIndex; clear(selector);
    for (const account of state.accounts) selector.append(el('option', { value: account.accountIndex, text: account.alias }));
    openDialog(dialog, event.target);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form).entries());
    try { const response = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/subdomains', { method: 'POST', body: JSON.stringify({ action: 'register', ...values }) })); closeDialog(dialog); showResult(t('Subdomain registered'), response.data.message || t('Registration completed.'), response.data, document.querySelector('#register-button')); pagination.reset(); await loadSubdomains(); }
    catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); }
  });
}

async function initializeSafely() {
  try { await initialize(); }
  catch (error) { showStatus(document.querySelector('#subdomains-status'), t('Signed in, but the panel could not initialize: {message}', { message: errorMessage(error) }), 'error'); toast(errorMessage(error), 'error'); }
}

async function start() {
  initializeI18n();
  installDnsRecords();
  ['details-dialog', 'result-dialog'].forEach((id) => bindDialogClose(document.querySelector(`#${id}`)));
  const authenticate = installAuthentication({ onAuthenticated: initializeSafely });
  try { await refreshSession(); }
  catch (error) { if (error?.status === 401) authenticate.requireLogin(); else showStatus(document.querySelector('#subdomains-status'), t('Unable to check the current session: {message}', { message: errorMessage(error) }), 'error'); return; }
  await initializeSafely();
}

async function initialize() {
  state.accounts = await loadAccounts(document.querySelector('#account-filter'), { allowAll: true });
  if (!initialized) {
    initialized = true;
    pagination = createPagination({ previous: document.querySelector('#previous-page'), next: document.querySelector('#next-page'), label: document.querySelector('#page-label'), onChange: loadSubdomains, initialPerPage: Number(document.querySelector('#per-page').value) });
    pagination.render();
    document.querySelector('#subdomain-filters').addEventListener('submit', (event) => { event.preventDefault(); pagination.reset(); loadSubdomains(); });
    document.querySelector('#account-filter').addEventListener('change', () => { pagination.reset(); loadSubdomains(); });
    document.querySelector('#per-page').addEventListener('change', () => { pagination.state.perPage = Number(document.querySelector('#per-page').value); pagination.reset(); loadSubdomains(); });
    document.querySelector('#subdomain-query').addEventListener('search', () => { pagination.reset(); loadSubdomains(); });
    setupSubdomainActions(); setupRegistration();
  }
  document.querySelector('#metric-accounts').textContent = String(state.accounts.length);
  pagination.reset(); await loadSubdomains();
}

start();
