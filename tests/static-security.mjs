import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function files(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name), extension) : entry.name.endsWith(extension) ? [join(directory, entry.name)] : []);
}
const failures = [];
for (const file of files('public', '.html')) {
  const source = readFileSync(file, 'utf8');
  if (!/<meta\s+name=["']viewport["']/i.test(source)) failures.push(`${file}: missing viewport`);
  if (/\son\w+\s*=/i.test(source)) failures.push(`${file}: inline event attribute`);
  const scripts = [...source.matchAll(/<script\b([^>]*)>/gi)];
  for (const script of scripts) if (!/\btype=["']module["']\s+src=|\bsrc=\S+/i.test(script[1])) failures.push(`${file}: inline script`);
  if (/tools\.js/.test(source)) failures.push(`${file}: legacy tools.js reference`);
}
for (const file of files('public/js', '.js')) {
  const source = readFileSync(file, 'utf8');
  if (/\binnerHTML\b|\binsertAdjacentHTML\b|\bdocument\.write\b/.test(source)) failures.push(`${file}: unsafe HTML sink`);
  if (/localStorage|sessionStorage/.test(source)) failures.push(`${file}: browser storage is prohibited for auth/secrets`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Static security checks passed for ${files('public', '.html').length} HTML files and ${files('public/js', '.js').length} modules.`);
