import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.ts';
import { Billing, defaults } from './billing.ts';
import { generate } from './models.ts';
import { exportCloud, restoreCloud } from './cloud-data.ts';
const databaseUrl=process.env.HOKSE_CHECK_DATABASE_URL!;
if(!databaseUrl||new URL(databaseUrl).hostname!=='127.0.0.1'||!new URL(databaseUrl).pathname.startsWith('/hokse_check'))throw new Error('Use isolated localhost hokse_check database only.');
const encryptionKey=process.env.HOKSE_CHECK_ENCRYPTION_KEY!;
test('PostgreSQL serializes cross-instance credits, atomically saves learning/charge, and restores all new tables plus legacy archives',async()=>{
  const first=new Store(':memory:',{databaseUrl,encryptionKey});await first.ready;const second=new Store(':memory:',{databaseUrl,encryptionKey});await second.ready;
  const owner=await first.createUser('billing-owner','fixture-password','Fixture owner','developer');const a=new Billing(first),b=new Billing(second);const p=await a.policy();p.plans.Free.credits=2;await a.updatePolicy(owner.id,p);
  let calls=0;const provider=createServer(async(req,res)=>{for await(const _ of req){}calls++;await new Promise(r=>setTimeout(r,70));res.end(JSON.stringify({choices:[{message:{content:'A saved fixture result'}}],usage:{prompt_tokens:7,completion_tokens:3,total_tokens:10}}))});await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  const config={id:'default',name:'Fixture',baseUrl:`http://127.0.0.1:${(provider.address() as {port:number}).port}`,secret:'fixture',model:defaults[0],protocol:'openai-chat' as const,enabled:true};
  const run=(billing:Billing,key:string)=>billing.run(owner,'/fixture',{},key,new AbortController().signal,async send=>{const text=await generate(config,[{role:'user',content:'hello'}]);await billing.store.transaction(async()=>{const s=await billing.store.state(owner.id);s.notes.push({id:key,title:key,body:text,date:s.profile.date});await billing.store.save(owner.id,s)});send({text})},()=>{});
  const folder=mkdtempSync(join(tmpdir(),'hokse-billing-check-')),archive=join(folder,'v2.gz'),legacy=join(folder,'v1.gz');const stores:Store[]=[];
  try{
    const results=await Promise.allSettled([run(a,'instance-a'),run(b,'instance-b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal((await a.view(owner.id)).available,0);assert.equal((await first.state(owner.id)).notes.length,1);
    const charged=(await first.db.prepare('SELECT body FROM credit_operations WHERE status=?').get('charged'))!;assert.equal(JSON.parse(charged.body).cost,2);
    // Simulate loss of the response cache after an atomic learning/charge commit.
    const op=JSON.parse(charged.body);delete op.result;await first.db.prepare('UPDATE credit_operations SET body=? WHERE id=?').run(JSON.stringify(op),op.id);assert.equal((await b.view(owner.id)).spent,2);
    await a.adminAccount(owner.id,owner.id,'Plus');const order=await a.order(owner.id,'Pro',crypto.randomUUID());await a.pay(owner.id,order.id,'mock-card');await first.putModel(config);
    const counts=await exportCloud(first,archive);for(const table of ['billing_accounts','billing_orders','credit_operations','billing_audit','ai_usage_logs'])assert.ok(counts[table]>0,table);
    const url=new URL(databaseUrl);url.pathname='/hokse_check_billing_restore';const restored=new Store(':memory:',{databaseUrl:url.toString(),encryptionKey});await restored.ready;stores.push(restored);await restoreCloud(restored,archive);const view=await new Billing(restored).view(owner.id);assert.equal(view.account.plan,'Pro');assert.equal(view.spent,2);assert.equal(view.orders.length,1);assert.equal((await new Billing(restored).logDetail((await a.logs(new URLSearchParams())).rows[0].id,true)).response,'A saved [REDACTED] result');
    const old=JSON.parse(gunzipSync(readFileSync(archive)).toString());old.format='hokse-cloud-v1';for(const key of ['billing_accounts','billing_orders','credit_operations','billing_audit','ai_usage_logs'])delete old.tables[key];old.tables.migrations=[[1]];delete old.tables.settings[old.tables.settings.findIndex((r:any)=>r[0]==='billing-policy')];old.tables.settings=old.tables.settings.filter(Boolean);writeFileSync(legacy,gzipSync(JSON.stringify(old)));
    url.pathname='/hokse_check_billing_legacy';const legacyStore=new Store(':memory:',{databaseUrl:url.toString(),encryptionKey});await legacyStore.ready;stores.push(legacyStore);await restoreCloud(legacyStore,legacy);assert.equal((await new Billing(legacyStore).view(owner.id)).available,500);assert.equal((await legacyStore.state(owner.id)).notes.length,1);
    const rls=await first.db.prepare("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hokse' AND c.relname IN ('billing_accounts','credit_operations','billing_orders','billing_audit','ai_usage_logs')").all();assert.equal(rls.length,5);assert.ok(rls.every(r=>r.relrowsecurity));
  }finally{for(const s of stores)await s.close();await first.close();await second.close();await new Promise<void>(r=>provider.close(()=>r()));for(const file of [archive,legacy])try{unlinkSync(file)}catch{}rmdirSync(folder)}
});
