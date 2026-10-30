import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {createPilot} from './app.ts';

test('static assets compress and cache; HTML revalidates and private API is never cached',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hokse-static-'));mkdirSync(join(root,'assets'));
 const source='const greeting="學序";\n'.repeat(400);
 writeFileSync(join(root,'assets','index-12345678.js'),source);writeFileSync(join(root,'index.html'),'<html>fixture</html>');
 const app=createPilot({database:':memory:',staticDir:root,allowSetup:false});const base=`http://127.0.0.1:${await app.listen(0)}`;
 try{
  const response=await fetch(base+'/assets/index-12345678.js',{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(response.headers.get('content-encoding'),'gzip');assert.match(response.headers.get('cache-control')!,/immutable/);
  assert.ok(Number(response.headers.get('content-length'))<Buffer.byteLength(source));assert.equal(await response.text(),source);
  const cached=await fetch(base+'/assets/index-12345678.js',{headers:{'If-None-Match':response.headers.get('etag')!}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
  const html=await fetch(base+'/help');assert.equal(html.headers.get('cache-control'),'no-cache');assert.equal(await html.text(),'<html>fixture</html>');
  const api=await fetch(base+'/api/v1/bootstrap');assert.equal(api.status,401);assert.equal(api.headers.get('cache-control'),'no-store');
 }finally{await app.close();const checked=realpathSync(root);assert.equal(dirname(checked),realpathSync(tmpdir()));assert.ok(basename(checked).startsWith('hokse-static-'));rmSync(checked,{recursive:true})}
});
