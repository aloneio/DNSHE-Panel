import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.js') ? [join(directory, entry.name)] : []); }
const modules = files('public/js');
for (const file of modules) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status || 1); }
}

const domSource = readFileSync('public/js/dom.js', 'utf8');
if (/node\.dataset\[name\.slice\(5\)\]/.test(domSource)) {
  console.error('public/js/dom.js: multi-segment data-* attributes must use setAttribute, not raw dataset keys');
  process.exit(1);
}
if (!/node\.setAttribute\(name, String\(value\)\)/.test(domSource)) {
  console.error('public/js/dom.js: data-* setAttribute path is missing');
  process.exit(1);
}

console.log(`JavaScript syntax and DOM helper checks passed for ${modules.length} modules.`);
