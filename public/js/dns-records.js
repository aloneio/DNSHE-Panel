import { apiFetch, errorMessage, withLoading } from './api.js';
import { button, clear, el, textCell } from './dom.js';
import { bindDialogClose, closeDialog, confirmAction, openDialog } from './dialog.js';
import { deserializeRecord, fieldsFor, recordTypes, recordValue, serializeRecord } from './record-schema.js';
import { clearStatus, showStatus, toast } from './status.js';

let controller = null;
let selected = null;
const paging = { page: 1, perPage: 100, hasMore: false };

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
    body.append(el('tr', {}, [el('td', { colSpan: 8, className: 'empty-cell', text: 'No DNS records found.' })]));
    return;
  }
  for (const record of records) {
    const actions = el('td', { className: 'actions', 'data-label': 'Actions' });
    actions.append(button('Edit', { className: 'btn btn--quiet', 'data-action': 'edit-record', 'data-record': JSON.stringify(record) }));
    actions.append(button('Delete', { className: 'btn btn--danger', 'data-action': 'delete-record', ...(record.id != null ? { 'data-internal-id': record.id } : {}), ...(record.record_id != null ? { 'data-provider-id': record.record_id } : {}) }));
    const identity = el('td', { 'data-label': 'IDs' }, [el('div', { className: 'cell-primary mono', text: record.id ?? '—' }), el('div', { className: 'cell-secondary mono', text: record.record_id || 'No provider ID' })]);
    const line = `${record.line || 'default'} / ${record.proxied === true ? 'proxied' : record.proxied === false ? 'DNS only' : '—'}`;
    const lifecycle = `${record.status || '—'} / ${record.updated_at || record.created_at || '—'}`;
    body.append(el('tr', {}, [identity, textCell(record.type, '', 'Type'), textCell(record.name, 'mono', 'Name'), textCell(recordValue(record), 'mono', 'Value'), textCell(record.ttl, '', 'TTL'), textCell(line, '', 'Line / Proxy'), textCell(lifecycle, '', 'Status / Updated'), actions]));
  }
}

function renderPagination() {
  document.querySelector('#records-page-label').textContent = `Page ${paging.page}`;
  document.querySelector('#records-previous').disabled = paging.page <= 1;
  document.querySelector('#records-next').disabled = !paging.hasMore;
}

async function loadRecords() {
  if (!selected) return;
  controller?.abort();
  controller = new AbortController();
  const body = document.querySelector('#records-body');
  clear(body).append(el('tr', {}, [el('td', { colSpan: 8, className: 'empty-cell', text: 'Loading DNS records…' })]));
  try {
    const params = new URLSearchParams({ accountIndex: selected.accountIndex, subdomain_id: String(selected.id), page: String(paging.page), per_page: String(paging.perPage), include_total: '1' });
    const result = await apiFetch(`/api/dns_records?${params}`, { signal: controller.signal });
    renderRecords(result.data.records || []);
    paging.hasMore = Boolean(result.pagination?.has_more ?? (result.data.records || []).length === paging.perPage);
    renderPagination();
  } catch (error) {
    if (error.name !== 'AbortError') clear(body).append(el('tr', {}, [el('td', { colSpan: 8, className: 'empty-cell', text: errorMessage(error) })]));
  }
}

export function installDnsRecords() {
  const dialog = document.querySelector('#records-dialog');
  const editor = document.querySelector('#record-dialog');
  const form = document.querySelector('#record-form');
  bindDialogClose(dialog); bindDialogClose(editor);
  form.elements.type.replaceChildren(...recordTypes().map((type) => el('option', { value: type, text: type })));
  form.elements.type.addEventListener('change', () => renderFields(form));
  document.querySelector('#records-body').addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    const action = target?.dataset.action;
    if (!action || !selected) return;
    if (action === 'edit-record') {
      const record = JSON.parse(target.dataset.record);
      const values = deserializeRecord(record);
      form.reset(); clearStatus(form.querySelector('.form-status'));
      form.elements.record_id.value = record.record_id || '';
      form.elements.id.value = record.id || '';
      form.elements.type.value = values.type;
      form.elements.name.value = values.name;
      form.elements.ttl.value = values.ttl;
      form.elements.line.value = values.line;
      renderFields(form, values); openDialog(editor, target); return;
    }
    if (action === 'delete-record' && await confirmAction({ title: 'Delete DNS record', message: `Delete ${target.dataset.internalId ? `internal record ${target.dataset.internalId}` : `provider record ${target.dataset.providerId}`} permanently?`, confirmLabel: 'Delete record' })) {
      const identity = target.dataset.internalId ? { id: Number(target.dataset.internalId) } : { record_id: target.dataset.providerId };
      try { await withLoading(target, () => apiFetch('/api/dns_records', { method: 'DELETE', body: JSON.stringify({ accountIndex: selected.accountIndex, ...identity }) })); toast('DNS record deleted.', 'success'); await loadRecords(); }
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
      const result = await withLoading(form.querySelector('[type="submit"]'), () => apiFetch('/api/dns_records', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(data) }));
      closeDialog(editor); toast(`DNS record ${editing ? 'updated' : 'created'} (${result.data.id || result.data.record_id || 'confirmed'}).`, 'success'); await loadRecords();
    } catch (error) { showStatus(form.querySelector('.form-status'), errorMessage(error), 'error'); }
  });
  document.querySelector('#open-record-editor').addEventListener('click', (event) => { form.reset(); clearStatus(form.querySelector('.form-status')); form.elements.id.value = ''; form.elements.record_id.value = ''; form.elements.type.value = 'A'; form.elements.ttl.value = 600; renderFields(form); openDialog(editor, event.target); });
  document.querySelector('#records-previous').addEventListener('click', () => { if (paging.page > 1) { paging.page -= 1; loadRecords(); } });
  document.querySelector('#records-next').addEventListener('click', () => { if (paging.hasMore) { paging.page += 1; loadRecords(); } });
}

export async function openRecords(subdomain, trigger) {
  selected = { accountIndex: subdomain.accountIndex, id: subdomain.subdomain_id || subdomain.id, domain: subdomain.full_domain || subdomain.domain || subdomain.subdomain };
  paging.page = 1;
  document.querySelector('#records-title').textContent = `DNS records · ${selected.domain}`;
  openDialog(document.querySelector('#records-dialog'), trigger);
  renderPagination();
  await loadRecords();
}
