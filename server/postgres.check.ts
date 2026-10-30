import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Store } from './store.ts';
import { createPilot } from './app.ts';
import { exportCloud, restoreCloud } from './cloud-data.ts';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databaseUrl=process.env.HOKSE_CHECK_DATABASE_URL;
if(!databaseUrl||new URL(databaseUrl).hostname!=='127.0.0.1'||!new URL(databaseUrl).pathname.startsWith('/hokse_check'))throw new Error('Postgres checks require an isolated localhost hokse_check database.');
const encryptionKey=process.env.HOKSE_CHECK_ENCRYPTION_KEY!;
const open=()=>new Store(':memory:',{databaseUrl,encryptionKey});
test('cloud key is mandatory; two connections preserve records, encrypted settings, sessions and attachment bytes',async()=>{
  assert.throws(()=>new Store(':memory:',{databaseUrl}),/HOKSE_ENCRYPTION_KEY/);
  let store=open();await store.ready;
  const owner=await store.createUser('cloud-owner','fixture-cloud-password','雲端測試','developer',true);
  const token=await store.session(owner);
  await store.putModel({id:'default',name:'fixture',baseUrl:'http://127.0.0.1',secret:'fixture-private-key',model:'fixture',protocol:'openai-chat',enabled:true});
  assert.ok(!(await store.db.prepare("SELECT body FROM settings WHERE id='model'").get())!.body.includes('fixture-private-key'));
  await store.db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run('file',owner.id,'fixture.png','image/png',Buffer.from([0,127,255]));
  await assert.rejects(()=>store.transaction(async()=>{
    const data=await store.state(owner.id);data.notes.push({id:'rollback',title:'不應保存',body:'rollback',date:data.profile.date});await store.save(owner.id,data);
    await new Promise(resolve=>setTimeout(resolve,20));throw new Error('fixture rollback');
  }),/fixture rollback/);
  assert.equal((await store.state(owner.id)).notes.length,0);
  // Concurrent requests must serialize each student's read/modify/write cycle.
  const other=open();await other.ready;
  await Promise.all(Array.from({length:12},(_,index)=>{
    const selected=index%2?store:other;
    return selected.transaction(async()=>{const data=await selected.state(owner.id);await new Promise(resolve=>setTimeout(resolve,2));data.notes.push({id:String(index),title:'並行保存',body:'fixture',date:data.profile.date});await selected.save(owner.id,data)});
  }));
  const stale=await store.state(owner.id),current=await other.state(owner.id);await other.save(owner.id,current);
  await assert.rejects(()=>store.save(owner.id,stale),/版本衝突/);
  await other.close();await store.close();store=open();await store.ready;
  assert.equal((await store.identity(token))?.id,owner.id);
  assert.equal((await store.state(owner.id)).notes.length,12);
  assert.equal((await store.model())?.secret,'fixture-private-key');
  assert.deepEqual((await store.db.prepare('SELECT data FROM files WHERE id=?').get('file'))!.data,Buffer.from([0,127,255]));
  const folder=mkdtempSync(join(tmpdir(),'hokse-cloud-backup-')),archive=join(folder,'backup.json.gz');
  const restoreUrl=new URL(databaseUrl!);restoreUrl.pathname='/hokse_check_restore';
  const restored=new Store(':memory:',{databaseUrl:restoreUrl.toString(),encryptionKey});await restored.ready;
  try{
    await exportCloud(store,archive);await restoreCloud(restored,archive);
    assert.equal((await restored.identity(token))?.id,owner.id);assert.equal((await restored.state(owner.id)).notes.length,12);
    assert.equal((await restored.model())?.secret,'fixture-private-key');
    assert.deepEqual((await restored.db.prepare('SELECT data FROM files WHERE id=?').get('file'))!.data,Buffer.from([0,127,255]));
    await assert.rejects(()=>restoreCloud(restored,archive),/已有帳戶/);
  }finally{await restored.close();unlinkSync(archive);rmdirSync(folder)}
  await assert.rejects(()=>store.createUser('replacement','fixture-cloud-password','不能覆寫','developer',true),/已有帳戶/);
  const wrong=new Store(':memory:',{databaseUrl,encryptionKey:randomBytes(32).toString('base64')});
  await assert.rejects(wrong.ready,/密鑰不匹配/);await wrong.close();
  await store.db.exec('CREATE ROLE hokse_anon_fixture');
  assert.equal((await store.db.prepare("SELECT has_schema_privilege('hokse_anon_fixture','hokse','USAGE') AS allowed").get())!.allowed,false);
  await store.logout(token);assert.equal(await store.identity(token),null);
  await store.close();
});

test('two empty-database owner initializations cannot create two first owners',async()=>{
  const url=new URL(databaseUrl!);url.pathname='/hokse_check_race';
  const first=new Store(':memory:',{databaseUrl:url.toString(),encryptionKey});await first.ready;
  const second=new Store(':memory:',{databaseUrl:url.toString(),encryptionKey});await second.ready;
  const results=await Promise.allSettled([first.createUser('race-a','fixture-cloud-password','a','developer',true),second.createUser('race-b','fixture-cloud-password','b','developer',true)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(await first.userCount(),1);
  await Promise.all([first.close(),second.close()]);
});

test('public setup remains disabled in cloud HTTP mode',async()=>{
  const app=createPilot({databaseUrl,encryptionKey,allowSetup:false,origin:'https://fixture.example',secureCookie:true});
  const port=await app.listen(0);
  try{
    const status=await fetch(`http://127.0.0.1:${port}/api/v1/auth/status`);assert.equal((await status.json()).setupRequired,false);
    const setup=await fetch(`http://127.0.0.1:${port}/api/v1/auth/setup`,{method:'POST',headers:{'Content-Type':'application/json','X-Hokse-Client':'1',Origin:'https://fixture.example'},body:JSON.stringify({username:'public-owner',password:'fixture-cloud-password'})});assert.equal(setup.status,403);
    const login=await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Hokse-Client':'1',Origin:'https://fixture.example'},body:JSON.stringify({username:'cloud-owner',password:'fixture-cloud-password'})});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie')!,/Secure/);
  }finally{await app.close()}
});
