import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
for(const args of [['scripts/check-maths-index.mjs'],['scripts/generate-pilot-openapi.mjs'],['node_modules/typescript/bin/tsc','-b'],['node_modules/typescript/bin/tsc','-p','server/tsconfig.json'],['node_modules/vite/bin/vite.js','build','--outDir','dist-pilot']]){
 const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,VITE_API_MODE:'real'},windowsHide:true});if(r.status)process.exit(r.status)
}
function check(dir){for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())check(path);else if(name.endsWith('.js')){const text=readFileSync(path,'utf8');for(const marker of ['q-factor-1','c-titration-1','seed-evidence-','這是本地示範回覆','DB_KEY="hokse.study.v1"'])if(text.includes(marker))throw new Error(`Private/mock data found in pilot bundle: ${name}`)}}}
check('dist-pilot');console.log('Pilot bundle check passed: no server question bank or mock seed.');
