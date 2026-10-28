import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';

const folder=mkdtempSync(join(tmpdir(),'hokse-bootstrap-')),database=join(folder,'pilot.sqlite');
const password='fixture-bootstrap-'+crypto.randomUUID();
const run=input=>spawnSync(process.execPath,['server/bootstrap-admin.ts','--stdin'],{encoding:'utf8',input,env:{...process.env,HOKSE_DATABASE:database},windowsHide:true});
try {
  const bad=run(JSON.stringify({username:'owner',name:'Test owner',password:'short'}));assert.equal(bad.status,1);
  let db=new DatabaseSync(database);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);db.close();
  const first=run(JSON.stringify({username:'Owner',name:'Test owner',password}));assert.equal(first.status,0,first.stderr);assert.ok(!first.stdout.includes(password));assert.ok(!first.stderr.includes(password));
  db=new DatabaseSync(database);const user=db.prepare('SELECT username,role,password FROM users').get();assert.equal(user.username,'owner');assert.equal(user.role,'developer');assert.notEqual(user.password,password);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n,1);db.close();
  const duplicate=run(JSON.stringify({username:'second',name:'Second',password}));assert.equal(duplicate.status,1);assert.ok(duplicate.stderr.includes('已有帳戶'));assert.ok(!duplicate.stderr.includes(password));
  db=new DatabaseSync(database);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);db.close();
  const store=new Store(database);
  try { assert.throws(()=>store.createUser('another',password,'Another','developer',true),/已有帳戶/);assert.equal(store.userCount(),1); } finally { store.close(); }
  console.log('Bootstrap checks passed: invalid input rejected, first owner created with hashed password, repeat refused, no password in output.');
} finally {
  const checked=realpathSync(folder);
  assert.equal(dirname(checked),realpathSync(tmpdir()));
  assert.ok(basename(checked).startsWith('hokse-bootstrap-'));
  rmSync(checked,{recursive:true,force:true});
}
