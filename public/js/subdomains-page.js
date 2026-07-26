import { apiFetch, errorMessage, withLoading } from './api.js';
import { loadAccounts } from './accounts.js';
import { refreshSession, installAuthentication } from './auth.js';
import { button, clear, el, textCell } from './dom.js';
import { bindDialogClose, closeDialog, confirmAction, openDialog } from './dialog.js';
import { createPagination } from './pagination.js';
import { openRecords, installDnsRecords } from './dns-records.js';
import { showStatus, toast } from './status.js';
import { findSubdomainByIdentity, subdomainId } from './subdomain-identity.js';

const state = { accounts: [], subdomains: [] };
let pagination;
let initialized = false;

function domainOf(subdomain) { return subdomain.full_domain || subdomain.domain || subdomain.subdomain; }

function renderSubdomains(subdomains) {
  const body = document.querySelector('#subdomains-body');
  clear(body);
  if (!subdomains.length) {
    body.append(el('tr', {}, [el('td', { colSpan: 6, className: 'empty-cell', text: 'No subdomains on this page.' })]));
    return;
  }
  for (const item of subdomains) {
    const actions = el('td', { className: 'actions' });
    const identity = { 'data-account-index': item.accountIndex, 'data-id': subdomainId(item) };
    actions.append(button('DNS records', { className: 'btn btn--quiet', 'data-action': 'records', ...identity }));
    actions.append(button('Renew', { className: 'btn btn--quiet', 'data-action': 'renew', ...identity }));
    actions.append(button('Delete', { className: 'btn btn--danger', 'data-action': 'delete', ...identity }));
    body.append(el('tr', {}, [textCell(domainOf(item)), textCell(item.rootdomain), textCell(item.status), textCell(item.accountAlias), textCell('Open to view'), actions]));
  }
}

async function loadSubdomains() {
  const status = document.querySelector('#subdomains-status');
  const accountIndex = document.querySelector('#account-filter').value;
  const perPage = document.querySelector('#per-page').value;
  const search = document.querySelector('#subdomain-query').value.trim();
  showStatus(status, 'Loading subdomains…');
  const params = new URLSearchParams({ accountIndex, page: String(pagination.state.page), per_page: perPage, include_total: 'false' });
  if (search) params.set('search', search);
  try {
    const response = await apiFetch(`/api/subdomains?${params}`);
    state.subdomains = response.data.subdomains || [];
    renderSubdomains(state.subdomains);
    const byAccount = response.pagination?.byAccount || {};
    const selectedPage = accountIndex === 'all' ? Object.values(byAccount).some((item) => item.has_more) : byAccount[accountIndex]?.has_more;
    pagination.setHasMore(Boolean(selectedPage)); pagination.render();
    const failed = response.partialErrors?.length;
    showStatus(status, failed ? `Loaded available accounts; ${failed} account(s) could not be loaded.` : `Loaded ${state.subdomains.length} subdomain(s).`, failed ? 'warning' : 'success');
  } catch (error) { renderSubdomains([]); showStatus(status, errorMessage(error), 'error'); }
}

function setupSubdomainActions() {
  document.querySelector('#subdomains-body').addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) return;
    const item = findSubdomainByIdentity(state.subdomains, actionButton.dataset.accountIndex, actionButton.dataset.id);
    if (!item) return;
    const accountIndex = item.accountIndex;
    const subdomain_id = subdomainId(item);
    if (actionButton.dataset.action === 'records') return openRecords(item, actionButton);
    if (actionButton.dataset.action === 'renew') {
      if (!await confirmAction({ title: 'Renew subdomain', message: `Renew ${domainOf(item)}? This may consume account quota.`, confirmLabel: 'Renew' })) return;
      try { await withLoading(actionButton, () => apiFetch('/api/subdomains', { method: 'POST', body: JSON.stringify({ action: 'renew', accountIndex, subdomain_id }) })); toast('Renewal request submitted.', 'success'); await loadSubdomains(); }
      catch (error) { toast(errorMessage(error), 'error'); }
      return;
    }
    if (actionButton.dataset.action === 'delete') {
      if (!await confirmAction({ title: 'Delete subdomain', message: `Delete ${domainOf(item)} permanently? DNS records will be unavailable.`, confirmLabel: 'Delete subdomain' })) return;
      try { await withLoading(actionButton, () => apiFetch('/api/subdomains', { method: 'DELETE', body: JSON.stringify({ accountIndex, subdomain_id }) })); toast('Subdomain deleted.', 'success'); await loadSubdomains(); }
      catch (error) { toast(errorMessage(error), 'error'); }
    }
  });
}

function setupRegistration() {
  const dialog = document.querySelector('#register-dialog');
  const form = document.querySelector('#register-form');
  bindDialogClose(dialog);
  document.querySelector('#register-button').addEventListener('click', (event) => {
    const selector = form.elements.accountIndex;
    clear(selector);
    for (const account of state.accounts) selector.append(el('option', { value: account.accountIndex, text: account.alias }));
    openDialog(dialog, event.target);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/subdomains', { method: 'POST', body: JSON.stringify({ action: 'register', ...values }) }));
      closeDialog(dialog); toast('Subdomain registration submitted.', 'success'); pagination.reset(); await loadSubdomains();
    } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); }
  });
}

async function initializeSafely() {
  try { await initialize(); }
  catch (error) {
    showStatus(document.querySelector('#subdomains-status'), `Signed in, but the panel could not initialize: ${errorMessage(error)}`, 'error');
    toast(errorMessage(error), 'error');
  }
}

async function start() {
  installDnsRecords();
  const authenticate = installAuthentication({ onAuthenticated: initializeSafely });
  try { await refreshSession(); }
  catch (error) {
    if (error?.status === 401) authenticate.requireLogin();
    else showStatus(document.querySelector('#subdomains-status'), `Unable to check the current session: ${errorMessage(error)}`, 'error');
    return;
  }
  await initializeSafely();
}

async function initialize() {
  state.accounts = await loadAccounts(document.querySelector('#account-filter'), { allowAll: true });
  if (!initialized) {
    initialized = true;
    pagination = createPagination({ previous: document.querySelector('#previous-page'), next: document.querySelector('#next-page'), label: document.querySelector('#page-label'), onChange: loadSubdomains, initialPerPage: Number(document.querySelector('#per-page').value) });
    pagination.render();
    document.querySelector('#refresh-button').addEventListener('click', () => loadSubdomains());
    document.querySelector('#account-filter').addEventListener('change', () => { pagination.reset(); loadSubdomains(); });
    document.querySelector('#per-page').addEventListener('change', () => { pagination.state.perPage = Number(document.querySelector('#per-page').value); pagination.reset(); loadSubdomains(); });
    document.querySelector('#subdomain-query').addEventListener('search', () => { pagination.reset(); loadSubdomains(); });
    setupSubdomainActions(); setupRegistration();
  }
  pagination.reset();
  await loadSubdomains();
}

start();
