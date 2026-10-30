import { createPilot } from './app.ts';
import { existsSync } from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
if(existsSync('/etc/secrets/hokse.env'))process.loadEnvFile('/etc/secrets/hokse.env');
if(process.env.RENDER&&!process.env.DATABASE_URL)throw new Error('Render 必須設定 DATABASE_URL；拒絕將學生資料寫入臨時 SQLite。');
const app=createPilot({databaseUrl:process.env.DATABASE_URL,encryptionKey:process.env.HOKSE_ENCRYPTION_KEY,database:process.env.HOKSE_DATABASE,staticDir:process.env.HOKSE_STATIC_DIR,allowSetup:process.env.HOKSE_ALLOW_SETUP!=='false',secureCookie:process.env.HOKSE_SECURE_COOKIE==='true',origin:process.env.HOKSE_ORIGIN||process.env.RENDER_EXTERNAL_URL});
const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3001);
try{await app.listen(port,host)}catch{console.error('資料庫初始化失敗；請檢查連線、TLS 憑證與固定密鑰。未開放網站。');await app.store.close();process.exit(1)}
console.log(`HOKSE API: http://${host}:${port} (${app.store.db.kind}; Node ${process.versions.node})`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close().then(()=>process.exit(0)));
