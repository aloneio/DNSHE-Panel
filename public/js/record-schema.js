const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'];

export const RECORD_SCHEMAS = {
  A: [{ name: 'content', label: 'IPv4 address', required: true }],
  AAAA: [{ name: 'content', label: 'IPv6 address', required: true }],
  CNAME: [{ name: 'content', label: 'Canonical hostname', required: true }],
  MX: [{ name: 'content', label: 'Mail hostname', required: true }, { name: 'priority', label: 'Priority', type: 'number', min: 0, max: 65535, required: true }],
  TXT: [{ name: 'content', label: 'Text value', required: true }],
  NS: [{ name: 'content', label: 'Nameserver hostname', required: true }],
  SRV: [{ name: 'priority', label: 'Priority', type: 'number', min: 0, max: 65535, required: true }, { name: 'weight', label: 'Weight', type: 'number', min: 0, max: 65535, required: true }, { name: 'port', label: 'Port', type: 'number', min: 1, max: 65535, required: true }, { name: 'target', label: 'Target hostname', required: true }],
  CAA: [{ name: 'caa_flag', label: 'Flag', type: 'number', min: 0, max: 255, required: true }, { name: 'caa_tag', label: 'Tag', required: true, placeholder: 'issue, issuewild, or iodef' }, { name: 'caa_value', label: 'Value', required: true }]
};

export function recordTypes() { return [...TYPES]; }
export function fieldsFor(type) { return RECORD_SCHEMAS[type] || RECORD_SCHEMAS.A; }

export function serializeRecord(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const type = String(values.type || '').toUpperCase();
  const output = { type, name: String(values.name || '@').trim(), ttl: Number(values.ttl || 300) };
  for (const field of fieldsFor(type)) {
    const raw = values[field.name];
    if (field.required && (raw === undefined || String(raw).trim() === '')) throw new Error(`${field.label} is required`);
    output[field.name] = field.type === 'number' ? Number(raw) : String(raw || '').trim();
  }
  return output;
}

export function deserializeRecord(record) {
  const type = String(record.type || 'A').toUpperCase();
  const output = { type, name: record.name || '@', ttl: record.ttl || 300 };
  for (const field of fieldsFor(type)) output[field.name] = record[field.name] ?? '';
  return output;
}
