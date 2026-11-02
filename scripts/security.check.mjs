import test from 'node:test';
import assert from 'node:assert/strict';
import { privatePath, inspectText } from './check-secrets.mjs';
import { blockingFindings } from './check-codeql-results.mjs';

test('private files stay blocked even if force-added; examples remain inspectable', () => {
  for (const file of ['.env', 'server/.env.production', '.data/cloud.env', '.data/backups/db.gz', 'secret.key', 'provider.private.json', 'x.sqlite-wal']) assert.equal(privatePath(file), true, file);
  for (const file of ['.env.example', '.github/workflows/ci.yml', 'server/models.ts']) assert.equal(privatePath(file), false, file);
});
test('provider keys and database passwords are detected without being included in reports', () => {
  const key = 'sk-' + 'a'.repeat(40), db = 'postgresql://user:' + 'actual-password' + '@host.example/db';
  const findings = inspectText('example\n' + key + '\n' + db, 'src/config.ts'); assert.deepEqual(findings.map(f => f.rule), ['provider-key', 'database-password']); assert.deepEqual(findings.map(f => f.line), [2, 3]); assert.ok(!JSON.stringify(findings).includes(key)); assert.ok(!JSON.stringify(findings).includes('actual-password'));
  assert.ok(!JSON.stringify(inspectText(key, key + '.ts')).includes(key));
});
test('runtime fixture URLs and explicit documentation templates are not real credentials', () => {
  for (const text of ['postgresql://postgres:${password}@127.0.0.1:${port}/test', 'postgresql://postgres:<password>@host/db', 'postgresql://...']) assert.equal(inspectText(text).length, 0);
  const documented = 'postgresql://postgres.project:' + '已編碼密碼' + '@host/db';
  assert.equal(inspectText(documented, 'docs/deployment-guide.md').length, 0); assert.equal(inspectText(documented, 'src/config.ts').length, 1);
  assert.equal(inspectText('HOKSE_ENCRYPTION_KEY=' + 'a'.repeat(43) + '=').length, 1);
});
test('CodeQL blocks high/error results, accepts medium warnings and rejects malformed output', () => {
  const sarif = { version: '2.1.0', runs: [{ tool: { driver: { rules: [{ id: 'high', properties: { 'security-severity': '8.0' } }, { id: 'medium', properties: { 'security-severity': '5.0' } }] } }, results: [{ ruleId: 'high' }, { ruleId: 'medium', level: 'warning' }, { ruleId: 'error', level: 'error' }, { ruleId: 'high', suppressions: [{ status: 'accepted' }] }] }] };
  assert.deepEqual(blockingFindings(sarif).map(f => f.rule), ['high', 'error']); assert.throws(() => blockingFindings({}));
});
