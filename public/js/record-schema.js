const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'];

export const RECORD_SCHEMAS = {
  A: [{ name: 'content', label: 'IPv4 address', required: true }],
  AAAA: [{ name: 'content', label: 'IPv6 address', required: true }],
  CNAME: [{ name: 'content', label: 'Canonical hostname', required: true }],
  MX: [{ name: 'content', label: 'Mail hostname', required: true }, { name: 'priority', label: 'Priority', type: 'number', min: 0, max: 65535, required: false, placeholder: 'Default 10' }],
  TXT: [{ name: 'content', label: 'Text value', required: true }],
  NS: [{ name: 'content', label: 'Nameserver hostname', required: true }],
  SRV: [{ name: 'priority', label: 'Priority', type: 'number', min: 0, max: 65535, required: false, placeholder: 'Default 0' }, { name: 'weight', label: 'Weight', type: 'number', min: 0, max: 65535, required: true }, { name: 'port', label: 'Port', type: 'number', min: 1, max: 65535, required: true }, { name: 'target', label: 'Target hostname', required: true }],
  CAA: [{ name: 'caa_flag', label: 'Flag', type: 'number', min: 0, max: 255, required: false, placeholder: 'Default 0' }, { name: 'caa_tag', label: 'Tag', required: false, placeholder: 'Default issue' }, { name: 'caa_value', label: 'Value', required: true }]
};

export function recordTypes() { return [...TYPES]; }
export function fieldsFor(type) { return RECORD_SCHEMAS[type] || RECORD_SCHEMAS.A; }

export function serializeRecord(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const type = String(values.type || '').toUpperCase();
  const output = { type, name: String(values.name || '@').trim(), ttl: Number(values.ttl || 600) };
  const line = String(values.line || '').trim();
  if (line) output.line = line;
  for (const field of fieldsFor(type)) {
    const raw = values[field.name];
    const trimmed = String(raw ?? '').trim();
    if (field.required && !trimmed) throw new Error(`${field.label} is required`);
    if (!trimmed) continue;
    output[field.name] = field.type === 'number' ? Number(raw) : trimmed;
  }
  return output;
}

export function deserializeRecord(record) {
  const type = String(record.type || 'A').toUpperCase();
  const output = { type, name: record.name || '@', ttl: record.ttl || 600, line: record.line || '' };
  for (const field of fieldsFor(type)) output[field.name] = record[field.name] ?? record[`record_${field.name}`] ?? '';
  return output;
}

export function recordValue(record) {
  const type = String(record.type || '').toUpperCase();
  if (type === 'SRV') return `${record.priority ?? 0} ${record.weight ?? record.record_weight ?? 0} ${record.port ?? record.record_port ?? ''} ${record.target ?? record.record_target ?? ''}`.trim();
  if (type === 'CAA') return `${record.caa_flag ?? 0} ${record.caa_tag ?? 'issue'} “${record.caa_value ?? ''}”`;
  if (type === 'MX') return `${record.priority ?? 10} ${record.content ?? ''}`.trim();
  return record.content ?? record.target ?? record.caa_value ?? '—';
}
