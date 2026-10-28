import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<24||major===24&&minor<12){console.error('真實後端需要 Node.js 24.12 或以上。');process.exit(1)}
const children=[];let stopping=false;
async function availablePort(start,strict=false){for(let port=start;port<start+(strict?1:20);port++){const ok=await new Promise(resolve=>{const probe=createServer();probe.once('error',()=>resolve(false));probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)))});if(ok)return port}throw new Error(`No available local port from ${start}`)}
const frontendPort=await availablePort(Number(process.env.HOKSE_FRONTEND_PORT??5173),!!process.env.HOKSE_FRONTEND_PORT);
const apiPort=await availablePort(Number(process.env.PORT??3001),!!process.env.PORT);
console.log(`Pilot website: http://127.0.0.1:${frontendPort}/`);
function stop(code=0){if(stopping)return;stopping=true;process.exitCode=code;for(const child of children)child.kill();setTimeout(()=>process.exit(code),250).unref()}
for(const [script,args,env] of [['server/main.ts',[],{PORT:String(apiPort),HOKSE_ORIGIN:process.env.HOKSE_ORIGIN??`http://127.0.0.1:${frontendPort}`}],['node_modules/vite/bin/vite.js',['--host','127.0.0.1','--port',String(frontendPort)],{VITE_API_MODE:'real',HOKSE_API_PORT:String(apiPort)}]]){
  const child=spawn(process.execPath,[...(script==='server/main.ts'?['--watch']:[]),script,...args],{stdio:'inherit',env:{...process.env,...env},windowsHide:true});children.push(child);child.on('exit',code=>stop(code??0));child.on('error',error=>{console.error(error.message);stop(1)})
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
