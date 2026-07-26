import { qs } from './dom.js';

let activeTriggers = new WeakMap();
let pendingConfirmation = null;

function restoreFocus(dialog) {
  const trigger = activeTriggers.get(dialog);
  activeTriggers.delete(dialog);
  if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
}

export function openDialog(dialog, trigger) {
  if (!(dialog instanceof HTMLDialogElement)) throw new Error('Native dialog support is required');
  activeTriggers.set(dialog, trigger || document.activeElement);
  if (!dialog.open) dialog.showModal();
  const focusable = qs('input:not([type="hidden"]), select, textarea, button', dialog);
  focusable?.focus();
}

export function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
  restoreFocus(dialog);
}

export function bindDialogClose(dialog) {
  if (!dialog || dialog.dataset.closeBound) return;
  dialog.dataset.closeBound = 'true';
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener('close', () => restoreFocus(dialog));
  dialog.querySelectorAll('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => closeDialog(dialog)));
}

function ensureConfirmBindings(dialog) {
  if (dialog.dataset.confirmBound) return;
  dialog.dataset.confirmBound = 'true';
  qs('#confirm-cancel', dialog).addEventListener('click', () => dialog.close('cancel'));
  qs('#confirm-submit', dialog).addEventListener('click', () => dialog.close('confirm'));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close('cancel');
  });
  dialog.addEventListener('close', () => {
    if (pendingConfirmation) {
      const resolve = pendingConfirmation;
      pendingConfirmation = null;
      resolve(dialog.returnValue === 'confirm');
    }
  });
}

export function confirmAction({ title = 'Confirm action', message = 'This action cannot be undone.', confirmLabel = 'Confirm' } = {}) {
  const dialog = document.querySelector('#confirm-dialog');
  if (!(dialog instanceof HTMLDialogElement)) return Promise.resolve(window.confirm(message));
  if (pendingConfirmation) return Promise.resolve(false);
  ensureConfirmBindings(dialog);
  dialog.returnValue = '';
  qs('#confirm-title', dialog).textContent = title;
  qs('#confirm-message', dialog).textContent = message;
  qs('#confirm-submit', dialog).textContent = confirmLabel;
  return new Promise((resolve) => {
    pendingConfirmation = resolve;
    openDialog(dialog, document.activeElement);
  });
}
