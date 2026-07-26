import { apiFetch, errorMessage, withLoading } from './api.js';
import { button, clear, el, textCell } from './dom.js';
import { bindDialogClose, closeDialog, confirmAction, openDialog } from './dialog.js';
import { deserializeRecord, fieldsFor, recordTypes, serializeRecord } from './record-schema.js';
import { showStatus, toast } from './status.js';

let controller = null;
let selected = null;

function renderFields(form, values = {}) {
  const type = form.elements.type.value;
  const container = form.querySelector('#record-type-fields');
  clear(container);
  for (const field of fieldsFor(type)) {
    const id = `record-${field.name}`;
    const input = el('input', { id, name: field.name, type: field.type || 'text', required: field.required || false, ...(field.min !== undefined ? { min: field.min } : {}), ...(field.max !== undefined ? { max: field.max } : {}), ...(field.placeholder ? { placeholder: field.placeholder } : {}), value: values[field.name] ?? '' });
    container.append(el('div', { className: 'field' }, [el('label', { htmlFor: id, text: field.label }), input]));
  }
}

function renderRecords(records) {
  const body = document.querySelector('#records-body');
  clear(body);
  if (!records.length) {
    body.append(el('tr', {}, [el('td', { colSpan: 7, className: 'empty-cell', text: 'No DNS records found.' })]));
    return;
  }
  for (const record of records) {
    const actions = el('td', { className: 'actions' });
    actions.append(button('Edit', { className: 'btn btn--quiet', 'data-action': 'edit-record', 'data-record': JSON.stringify(record) }));
    actions.append(button('Delete', { className: 'btn btn--danger', 'data-action': 'delete-record', ...(record.id != null ? { 'data-internal-id': record.id } : {}), ...(record.record_id != null ? { 'data-provider-id': record.record_id } : {}) }));
    body.append(el('tr', {}, [textCell(record.id || record.record_id), textCell(record.type), textCell(record.name), textCell(record.content || record.target || record.caa_value), textCell(record.ttl), textCell(record.priority), actions]));
  }
}

async function loadRecords() {
  if (!selected) return;
  controller?.abort();
  controller = new AbortController();
  const body = document.querySelector('#records-body');
  clear(body).append(el('tr', {}, [el('td', { colSpan: 7, className: 'empty-cell', text: 'Loading DNS records…' })]));
  try {
    const result = await apiFetch(`/api/dns_records?accountIndex=${encodeURIComponent(selected.accountIndex)}&subdomain_id=${encodeURIComponent(selected.id)}&page=1&per_page=100`, { signal: controller.signal });
    renderRecords(result.data.records || []);
  } catch (error) { if (error.name !== 'AbortError') { clear(body).append(el('tr', {}, [el('td', { colSpan: 7, className: 'empty-cell', text: errorMessage(error) })])); } }
}

export function installDnsRecords() {
  const dialog = document.querySelector('#records-dialog');
  const editor = document.querySelector('#record-dialog');
  const form = document.querySelector('#record-form');
  bindDialogClose(dialog); bindDialogClose(editor);
  form.elements.type.replaceChildren(...recordTypes().map((type) => el('option', { value: type, text: type })));
  form.elements.type.addEventListener('change', () => renderFields(form));
  document.querySelector('#records-body').addEventListener('click', async (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (!action || !selected) return;
    if (action === 'edit-record') {
      const record = JSON.parse(event.target.closest('button').dataset.record);
      const values = deserializeRecord(record);
      form.reset();
      form.elements.record_id.value = record.record_id || '';
      form.elements.id.value = record.id || '';
      form.elements.type.value = values.type;
      form.elements.name.value = values.name;
      form.elements.ttl.value = values.ttl;
      renderFields(form, values); openDialog(editor, event.target); return;
    }
    if (action === 'delete-record' && await confirmAction({ title: 'Delete DNS record', message: 'Delete this DNS record permanently?', confirmLabel: 'Delete record' })) {
      const identity = event.target.closest('button').dataset.internalId ? { id: Number(event.target.closest('button').dataset.internalId) } : { record_id: event.target.closest('button').dataset.providerId };
      try { await withLoading(event.target.closest('button'), () => apiFetch('/api/dns_records', { method: 'DELETE', body: JSON.stringify({ accountIndex: selected.accountIndex, ...identity }) })); toast('DNS record deleted.', 'success'); await loadRecords(); }
      catch (error) { toast(errorMessage(error), 'error'); }
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = serializeRecord(form);
      data.accountIndex = selected.accountIndex;
      const internalId = form.elements.id.value;
      const providerId = form.elements.record_id.value;
      const editing = Boolean(internalId || providerId);
      if (internalId) data.id = Number(internalId); else if (providerId) data.record_id = providerId; else data.subdomain_id = selected.id;
      await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/dns_records', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(data) }));
      closeDialog(editor); toast(`DNS record ${editing ? 'updated' : 'created'}.`, 'success'); await loadRecords();
    } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); }
  });
  document.querySelector('#open-record-editor').addEventListener('click', (event) => { form.reset(); form.elements.id.value = ''; form.elements.record_id.value = ''; form.elements.type.value = 'A'; renderFields(form); openDialog(editor, event.target); });
}

export async function openRecords(subdomain, trigger) {
  selected = { accountIndex: subdomain.accountIndex, id: subdomain.subdomain_id || subdomain.id, domain: subdomain.full_domain || subdomain.domain };
  document.querySelector('#records-title').textContent = `DNS records · ${selected.domain}`;
  openDialog(document.querySelector('#records-dialog'), trigger);
  await loadRecords();
}
