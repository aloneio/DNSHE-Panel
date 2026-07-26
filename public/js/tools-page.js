import { apiFetch, errorMessage, withLoading } from './api.js';
import { loadAccounts, selectedAccount } from './accounts.js';
import { refreshSession, installAuthentication } from './auth.js';
import { button, clear, el, textCell } from './dom.js';
import { bindDialogClose, closeDialog, confirmAction, openDialog } from './dialog.js';
import { showStatus, toast } from './status.js';

function renderKeys(keys) {
  const body = document.querySelector('#keys-body'); clear(body);
  if (!keys.length) return body.append(el('tr', {}, [el('td', { colSpan: 6, className: 'empty-cell', text: 'No API keys found.' })]));
  for (const key of keys) {
    const actions = el('td', { className: 'actions' });
    actions.append(button('Regenerate', { className: 'btn btn--quiet', 'data-action': 'regenerate', 'data-id': key.id || key.key_id }));
    actions.append(button('Delete', { className: 'btn btn--danger', 'data-action': 'delete', 'data-id': key.id || key.key_id }));
    body.append(el('tr', {}, [textCell(key.id || key.key_id), textCell(key.key_name), textCell(key.api_key), textCell(key.status), textCell(key.last_used_at || '—'), actions]));
  }
}

function clearSecret() {
  const value = document.querySelector('#secret-value');
  if (value) value.textContent = '';
}

function showSecret(response, trigger) {
  const secret = response.api_secret || response.data?.api_secret || response.data?.secret;
  if (!secret) return;
  const dialog = document.querySelector('#secret-dialog');
  clearSecret();
  dialog.querySelector('#secret-value').textContent = secret;
  openDialog(dialog, trigger);
}

async function loadKeys() {
  const accountIndex = selectedAccount(document.querySelector('#tools-account'));
  const status = document.querySelector('#tools-status');
  try { const response = await apiFetch(`/api/keys?accountIndex=${encodeURIComponent(accountIndex)}`); renderKeys(response.data.keys || []); showStatus(status, 'API keys loaded.', 'success'); }
  catch (error) { renderKeys([]); showStatus(status, errorMessage(error), 'error'); }
}

async function loadQuota() {
  const target = document.querySelector('#quota-value');
  try { const response = await apiFetch(`/api/quota?accountIndex=${encodeURIComponent(selectedAccount(document.querySelector('#tools-account')))}`); target.textContent = JSON.stringify(response.data.quota, null, 2); }
  catch (error) { target.textContent = errorMessage(error); }
}

async function loadUpgrades() {
  const body = document.querySelector('#upgrades-body'); clear(body);
  try {
    const accountIndex = selectedAccount(document.querySelector('#tools-account'));
    const response = await apiFetch(`/api/permanent_upgrade?accountIndex=${encodeURIComponent(accountIndex)}&page=1&per_page=50`);
    const upgrades = response.data.upgrades || [];
    if (!upgrades.length) return body.append(el('tr', {}, [el('td', { colSpan: 5, className: 'empty-cell', text: 'No permanent-upgrade requests.' })]));
    for (const item of upgrades) {
      const requestId = item.request_id || item.id;
      const actions = el('td', { className: 'actions' });
      actions.append(button('Assist', { className: 'btn btn--quiet', 'data-action': 'assist-upgrade', 'data-id': requestId }));
      actions.append(button('Cancel', { className: 'btn btn--danger', 'data-action': 'cancel-upgrade', 'data-id': requestId }));
      body.append(el('tr', {}, [textCell(requestId), textCell(item.subdomain_id || item.domain), textCell(item.status), textCell(item.created_at), actions]));
    }
  } catch (error) { body.append(el('tr', {}, [el('td', { colSpan: 5, className: 'empty-cell', text: errorMessage(error) })])); }
}

let toolsInstalled = false;

function installTools() {
  if (toolsInstalled) return;
  toolsInstalled = true;
  const selector = document.querySelector('#tools-account');
  selector.addEventListener('change', async () => { await Promise.all([loadKeys(), loadQuota(), loadUpgrades()]); });
  document.querySelector('#refresh-keys').addEventListener('click', (event) => withLoading(event.currentTarget, () => Promise.all([loadKeys(), loadQuota(), loadUpgrades()])));
  document.querySelector('#key-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    try {
      const values = Object.fromEntries(new FormData(form).entries()); values.action = 'create'; values.accountIndex = selectedAccount(selector);
      const result = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/keys', { method: 'POST', body: JSON.stringify(values) }));
      closeDialog(document.querySelector('#key-dialog')); showSecret(result.data, document.querySelector('#new-key')); toast('API key created. Store its secret now.', 'success'); await loadKeys();
    } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); }
  });
  document.querySelector('#new-key').addEventListener('click', (event) => openDialog(document.querySelector('#key-dialog'), event.target));
  document.querySelector('#keys-body').addEventListener('click', async (event) => {
    const action = event.target.closest('button')?.dataset.action; if (!action) return;
    const keyId = event.target.closest('button').dataset.id; const accountIndex = selectedAccount(selector);
    if (action === 'delete') {
      if (!await confirmAction({ title: 'Delete API key', message: 'Delete this API key permanently?', confirmLabel: 'Delete key' })) return;
      try { await withLoading(event.target.closest('button'), () => apiFetch('/api/keys', { method: 'POST', body: JSON.stringify({ action: 'delete', accountIndex, key_id: Number(keyId) }) })); toast('API key deleted.', 'success'); await loadKeys(); } catch (error) { toast(errorMessage(error), 'error'); }
    } else if (action === 'regenerate') {
      if (!await confirmAction({ title: 'Regenerate API key', message: 'The existing API secret will stop working. Continue?', confirmLabel: 'Regenerate' })) return;
      try { const result = await withLoading(event.target.closest('button'), () => apiFetch('/api/keys', { method: 'POST', body: JSON.stringify({ action: 'regenerate', accountIndex, key_id: Number(keyId) }) })); showSecret(result.data, event.target); toast('API key regenerated. Store its new secret now.', 'success'); await loadKeys(); } catch (error) { toast(errorMessage(error), 'error'); }
    }
  });
  document.querySelector('#whois-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const domain = new FormData(form).get('domain');
    try { const response = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch(`/api/whois?accountIndex=${encodeURIComponent(selectedAccount(selector))}&domain=${encodeURIComponent(domain)}`)); document.querySelector('#whois-result').textContent = JSON.stringify(response.data.whois, null, 2); }
    catch (error) { document.querySelector('#whois-result').textContent = errorMessage(error); }
  });
  document.querySelector('#upgrade-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    if (!await confirmAction({ title: 'Request permanent upgrade', message: 'This request can affect quota and may be irreversible.', confirmLabel: 'Request upgrade' })) return;
    try { await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/permanent_upgrade', { method: 'POST', body: JSON.stringify({ action: 'create', accountIndex: selectedAccount(selector), subdomain_id: Number(new FormData(form).get('subdomain_id')) }) })); toast('Permanent-upgrade request submitted.', 'success'); form.reset(); await loadUpgrades(); }
    catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); }
  });
  document.querySelector('#upgrades-body').addEventListener('click', async (event) => {
    const buttonTarget = event.target.closest('button'); const action = buttonTarget?.dataset.action; if (!action) return;
    const request_id = buttonTarget.dataset.id;
    if (action === 'cancel-upgrade') {
      if (!await confirmAction({ title: 'Cancel permanent upgrade', message: 'Cancel this permanent-upgrade request?', confirmLabel: 'Cancel request' })) return;
      try { await withLoading(buttonTarget, () => apiFetch('/api/permanent_upgrade', { method: 'POST', body: JSON.stringify({ action: 'cancel', accountIndex: selectedAccount(selector), request_id }) })); toast('Upgrade request cancelled.', 'success'); await loadUpgrades(); } catch (error) { toast(errorMessage(error), 'error'); }
    } else {
      const form = document.querySelector('#assist-form');
      form.reset();
      openDialog(document.querySelector('#assist-dialog'), buttonTarget);
    }
  });
  document.querySelector('#open-assist').addEventListener('click', (event) => {
    const form = document.querySelector('#assist-form');
    form.reset();
    openDialog(document.querySelector('#assist-dialog'), event.currentTarget);
  });
  document.querySelector('#assist-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    if (!await confirmAction({ title: 'Submit assist code', message: 'Submit this assist code for the selected request?', confirmLabel: 'Submit code' })) return;
    try {
      await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/permanent_upgrade', { method: 'POST', body: JSON.stringify({ action: 'assist', accountIndex: selectedAccount(selector), assist_code: values.assist_code }) }));
      closeDialog(document.querySelector('#assist-dialog')); toast('Assist code submitted.', 'success'); await loadUpgrades();
    } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); }
  });
  document.querySelector('#copy-secret').addEventListener('click', async () => { try { await navigator.clipboard.writeText(document.querySelector('#secret-value').textContent); toast('Secret copied.', 'success'); } catch { toast('Copy is unavailable. Select and copy the displayed value.', 'warning'); } });
  const secretDialog = document.querySelector('#secret-dialog');
  secretDialog.addEventListener('close', clearSecret);
  ['key-dialog', 'secret-dialog', 'assist-dialog'].forEach((id) => bindDialogClose(document.querySelector(`#${id}`)));
}

async function initialize() {
  await loadAccounts(document.querySelector('#tools-account'));
  installTools(); await Promise.all([loadKeys(), loadQuota(), loadUpgrades()]);
}

async function initializeSafely() {
  try { await initialize(); }
  catch (error) {
    showStatus(document.querySelector('#tools-status'), `Signed in, but the tools page could not initialize: ${errorMessage(error)}`, 'error');
    toast(errorMessage(error), 'error');
  }
}

const auth = installAuthentication({ onAuthenticated: initializeSafely });
refreshSession()
  .then(initializeSafely)
  .catch((error) => {
    if (error?.status === 401) auth.requireLogin();
    else showStatus(document.querySelector('#tools-status'), `Unable to check the current session: ${errorMessage(error)}`, 'error');
  });
