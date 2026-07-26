import { apiFetch, setCsrfToken } from './api.js';
import { closeDialog, openDialog } from './dialog.js';
import { showStatus } from './status.js';

let session = null;

export async function refreshSession() {
  const response = await apiFetch('/api/auth');
  session = response.data;
  setCsrfToken(session.csrfToken);
  return session;
}

export function currentSession() { return session; }

export function installAuthentication({ dialogId = 'login-dialog', formId = 'login-form', statusId = 'login-status', logoutId = 'logout-button', onAuthenticated } = {}) {
  const dialog = document.querySelector(`#${dialogId}`);
  const form = document.querySelector(`#${formId}`);
  const status = document.querySelector(`#${statusId}`);
  const logout = document.querySelector(`#${logoutId}`);
  const requireLogin = () => { if (dialog instanceof HTMLDialogElement) openDialog(dialog); };
  dialog?.addEventListener('cancel', (event) => event.preventDefault());
  window.addEventListener('dnshe:unauthorized', () => { session = null; setCsrfToken(null); requireLogin(); });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const password = new FormData(form).get('password');
    showStatus(status, 'Signing in…');
    try {
      const response = await apiFetch('/api/auth', { method: 'POST', body: JSON.stringify({ password }) });
      session = response.data;
      setCsrfToken(session.csrfToken);
      form.reset();
      closeDialog(dialog);
      showStatus(status, 'Signed in.', 'success');
      await onAuthenticated?.(session);
    } catch (error) { showStatus(status, error.message, 'error'); }
    finally { if (submit) submit.disabled = false; }
  });
  logout?.addEventListener('click', async () => {
    try { await apiFetch('/api/auth', { method: 'DELETE' }); }
    catch { /* Session may already be expired. */ }
    session = null;
    setCsrfToken(null);
    requireLogin();
  });
  return { requireLogin };
}
