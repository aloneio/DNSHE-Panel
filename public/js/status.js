import { clear, el } from './dom.js';

export function showStatus(target, message, kind = 'info') {
  if (!target) return;
  target.className = `status status--${kind}`;
  target.textContent = message || '';
  target.hidden = !message;
}

export function clearStatus(target) { if (target) { clear(target); target.hidden = true; } }

export function toast(message, kind = 'info') {
  const region = document.querySelector('#toast-region');
  if (!region) return;
  const item = el('div', { className: `toast toast--${kind}`, role: 'status', text: message });
  region.append(item);
  window.setTimeout(() => item.remove(), 5000);
}
