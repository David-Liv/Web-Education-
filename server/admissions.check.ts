import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot } from './app.ts';
import { programmes } from '../src/data/programmes.ts';
import { programmeComparison } from '../src/admissions.ts';

test('administrator help is protected for both display and download; student comparisons are account-scoped and free',async()=>{
 const app=createPilot({database:':memory:',allowSetup:false});const base=`http://127.0.0.1:${await app.listen(0)}`;
 const cookies:Record<string,string>={},users:Record<string,{id:string}>={};
 for(const [name,role]of [['owner','developer'],['reviewer','reviewer'],['student','student'],['other','student']] as const){const u=await app.store.createUser(name,'fixture-password',name,role);users[name]=u;cookies[name]='hokse_session='+await app.store.session(u)}
 const call=async(path:string,who='',method='GET',body?:unknown)=>{
  const r=await fetch(base+'/api/v1'+path,{method,headers:{Cookie:cookies[who]??'','X-Hokse-Client':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text)}catch{}return {r,text,data};
 };
 try{
  for(const suffix of ['?lang=en','?lang=zh-HK&download=1']){
   assert.equal((await call('/admin/guide'+suffix)).r.status,401);
   for(const who of ['student','other','reviewer']){const denied=await call('/admin/guide'+suffix,who);assert.equal(denied.r.status,403);assert.ok(!denied.text.includes('HOKSE_ADMIN_OPERATIONS_1_1'))}
  }
  const shown=await call('/admin/guide?lang=en','owner');assert.equal(shown.r.status,200);assert.match(shown.data.markdown,/HOKSE_ADMIN_OPERATIONS_1_1/);assert.equal(shown.data.language,'en');assert.match(shown.r.headers.get('cache-control')!,/no-store/);
  const download=await call('/admin/guide?lang=zh-HK&download=1','owner');assert.equal(download.r.status,200);assert.match(download.r.headers.get('content-disposition')!,/attachment/);assert.match(download.r.headers.get('cache-control')!,/private, no-store/);assert.match(download.text,/管理員手冊/);
  const grades={chi:'4',eng:'4',maths:'4',chem:'4',phy:'3',csd:'A'},targetGrades={chi:'5',eng:'5',maths:'5',chem:'5',phy:'4',csd:'A'};
  const update=await call('/profile','student','PATCH',{subjects:Object.keys(grades),grades,targetGrades,primaryProgramme:'JS1000',backupProgrammes:['JS1001']});assert.equal(update.r.status,200,update.text);
  const comparison=await call('/programmes/compare?userId='+users.other.id,'student');assert.equal(comparison.r.status,200);assert.equal(comparison.data.length,2);assert.equal(comparison.data[0].programmeId,'JS1000');assert.ok(comparison.data[0].currentValue!==null);
  const profile=(await app.store.state(users.student.id)).profile;assert.deepEqual(comparison.data[0],programmeComparison(programmes.find(p=>p.id==='JS1000')!,profile,programmes));
  assert.deepEqual((await call('/programmes/compare','other')).data,[]);
  assert.equal(Number((await app.store.db.prepare('SELECT COUNT(*) AS n FROM credit_operations').get())!.n),0);
  const preview=await call('/plans/preview','student','POST',{});assert.equal(preview.r.status,200,preview.text);assert.equal(preview.data.programmeId,'JS1000');
  await call('/profile','student','PATCH',{primaryProgramme:'JS1001'});
  const stale=await call('/plans/apply','student','POST',{previewId:preview.data.previewId});assert.equal(stale.r.status,409);
  const dedup=await call('/profile','student','PATCH',{backupProgrammes:['JS1001','JS1001']});assert.deepEqual(dedup.data.backupProgrammes,[]);
 } finally {await app.close()}
});
