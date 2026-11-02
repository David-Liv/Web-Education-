import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Pattern checks are an additional guard, not a guarantee that every secret format is recognised.
const rules = [
  ['provider-key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['supabase-secret', /\bsb_secret_[A-Za-z0-9_-]{15,}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['render-token', /\brnd_[A-Za-z0-9_-]{20,}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['database-password', /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/gi],
  ['encryption-key', /HOKSE_ENCRYPTION_KEY\s*[=:]\s*["']?[A-Za-z0-9+/]{43}=/g],
];
export function privatePath(path) {
  path = path.replaceAll('\\', '/'); const parts = path.split('/'), name = parts.at(-1);
  return parts.some(p => ['.data', '.agents', '.codex'].includes(p)) || name === 'secret.key' || /\.sqlite(?:-.*)?$/.test(name) || /\.private\.(?:json|env)$/.test(name) || name === '.env' || name.startsWith('.env.') && name !== '.env.example';
}
const safePath = path => {
  let value = path.replace(/[\r\n\x00-\x1f]/g, '_');
  for (const [, rule] of rules) value = value.replace(new RegExp(rule.source, rule.flags), '[redacted]');
  return value.slice(0, 240);
};
export function inspectText(text, path = 'input') {
  const findings = [];
  for (const [rule, expression] of rules) for (const match of text.matchAll(new RegExp(expression.source, expression.flags))) {
    // Checked-in examples and isolated tests use explicit templates, not real passwords.
    if (rule === 'database-password' && /\$\{|<[^>]*>|\[YOUR-[^\]]*\]|:\/\/\.\.\./i.test(match[0])) continue;
    if (rule === 'database-password' && path.replaceAll('\\', '/').startsWith('docs/') && match[0].includes(':已編碼密碼@')) continue;
    findings.push({ file: safePath(path), line: text.slice(0, match.index).split('\n').length, rule });
  }
  return findings;
}
function git(args, input) {
  const result = spawnSync('git', args, { input, maxBuffer: 128 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error('Git inspection failed; no file contents printed.');
  return result.stdout;
}
export function checkRepository(history = false) {
  const index = git(['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean);
  const objects = new Map(), findings = [];
  for (const entry of index) { const tab = entry.indexOf('\t'), path = entry.slice(tab + 1), [mode, hash] = entry.slice(0, tab).split(' '); if (privatePath(path)) findings.push({ file: safePath(path), rule: 'private-file-tracked' }); else if (mode !== '160000') objects.set(hash, path); }
  if (history) {
    const paths = git(['log', '--all', '--format=', '--name-only', '-z']).toString().split('\0').map(p => p.trim()).filter(Boolean);
    for (const path of new Set(paths)) if (privatePath(path)) findings.push({ file: safePath(path), rule: 'private-file-in-history' });
    const refs = git(['rev-list', '--objects', '--all']).toString().trim().split('\n');
    const names = new Map(refs.map(row => { const i = row.indexOf(' '); return i < 0 ? [row, 'history'] : [row.slice(0, i), row.slice(i + 1)]; }));
    const types = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], [...names.keys()].join('\n') + '\n').toString().trim().split('\n');
    for (const row of types) { const [hash, type] = row.split(' '); if (type === 'blob' && !privatePath(names.get(hash))) objects.set(hash, names.get(hash)); }
  }
  if (objects.size) {
    const data = git(['cat-file', '--batch'], [...objects.keys()].join('\n') + '\n'); let offset = 0;
    for (const [hash, path] of objects) { const end = data.indexOf(10, offset), header = data.subarray(offset, end).toString().split(' '), size = Number(header[2]); if (header[0] !== hash || header[1] !== 'blob' || !Number.isSafeInteger(size)) throw new Error('Unexpected Git object response.'); findings.push(...inspectText(data.subarray(end + 1, end + 1 + size).toString('utf8'), path)); offset = end + size + 2; }
  }
  return { objects: objects.size, findings };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = checkRepository(process.argv.includes('--history')); if (result.findings.length) { console.error('Secret guard blocked this operation. Only locations and rule names follow:'); for (const finding of result.findings) console.error(JSON.stringify(finding)); process.exitCode = 1; } else console.log(`Secret guard passed: ${result.objects} Git objects checked; no secret values printed.`); }
  catch { console.error('Secret guard could not complete. Operation blocked; no secret values printed.'); process.exitCode = 1; }
}
