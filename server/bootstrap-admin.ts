import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Store } from './store.ts';

// First-owner creation is a private operator command, never a public HTTP route.
if(existsSync('.env'))process.loadEnvFile('.env');
const store = new Store(process.env.HOKSE_DATABASE ?? resolve('.data/pilot.sqlite'),{databaseUrl:process.env.DATABASE_URL,encryptionKey:process.env.HOKSE_ENCRYPTION_KEY});
let terminal: ReturnType<typeof createInterface> | undefined;
try {
  await store.ready;
  if (await store.userCount() !== 0) throw new Error('已有帳戶，拒絕重新初始化或覆寫管理員。請使用現有帳戶登入。');
  let input: { username?: unknown; name?: unknown; password?: unknown };
  if (process.argv.includes('--stdin')) {
    let text = '';
    for await (const chunk of process.stdin) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 4096) throw new Error('輸入過長。');
    }
    try { input = JSON.parse(text); } catch { throw new Error('請經標準輸入提供有效的帳戶JSON；不要將密碼放入命令參數。'); }
    if (!input || typeof input !== 'object') throw new Error('帳戶資料格式無效。');
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('請在互動終端執行；自動化請使用 --stdin，並經標準輸入傳入JSON。');
    let hidden = false;
    const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding as BufferEncoding); callback(); } });
    terminal = createInterface({ input: process.stdin, output, terminal: true });
    const username = await terminal.question('開發者帳戶名稱（2–40個英數字元）: ');
    const name = await terminal.question('顯示名字: ');
    process.stdout.write('密碼（至少10字元，輸入不顯示）: '); hidden = true;
    const password = await terminal.question(''); hidden = false; process.stdout.write('\n');
    process.stdout.write('再次輸入密碼: '); hidden = true;
    const confirmation = await terminal.question(''); hidden = false; process.stdout.write('\n');
    if (password !== confirmation) throw new Error('兩次密碼不一致，沒有建立帳戶。');
    input = { username, name, password };
  }
  const username = String(input.username ?? '').trim().toLowerCase(), name = String(input.name ?? '').trim();
  if (!/^[a-z0-9_.-]{2,40}$/.test(username) || !name || name.length > 30 || typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 200) throw new Error('帳戶需2–40個英數字元；名字需1–30字元；密碼需10–200字元。');
  const user = await store.createUser(username, input.password, name, 'developer', true);
  console.log(`已建立首位開發者：${user.username}。請到網站登入；之後可在「邀請帳戶」建立學生。`);
} catch (error) {
  console.error(error instanceof Error && !process.env.DATABASE_URL ? error.message : '雲端初始化未完成；請檢查連線／密鑰，或確認是否已有帳戶。');
  process.exitCode = 1;
} finally { terminal?.close(); await store.close(); }
