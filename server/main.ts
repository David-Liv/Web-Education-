import { createPilot } from './app.ts';
import { existsSync } from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const app=createPilot({database:process.env.HOKSE_DATABASE,staticDir:process.env.HOKSE_STATIC_DIR,allowSetup:process.env.HOKSE_ALLOW_SETUP!=='false',secureCookie:process.env.HOKSE_SECURE_COOKIE==='true',origin:process.env.HOKSE_ORIGIN});
const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3001);
await app.listen(port,host);console.log(`HOKSE API: http://${host}:${port} (persistent SQLite; Node ${process.versions.node})`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close().then(()=>process.exit(0)));
