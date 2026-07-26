import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.js') ? [join(directory, entry.name)] : []); }
const modules = files('public/js');
for (const file of modules) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status || 1); }
}
console.log(`JavaScript syntax checks passed for ${modules.length} modules.`);
