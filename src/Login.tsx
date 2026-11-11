import { LanguageSwitch, ui, useInterfaceLanguage } from './i18n';
import { useEffect, useState } from 'react';
import { api } from './api/client';

type Mode = 'login' | 'register' | 'reset';

export function Login({
  setup,
  registrationMode = 'closed',
  passwordResetEnabled = false,
  onDone,
}: {
  setup: boolean;
  registrationMode?: 'closed' | 'passcode' | 'open';
  passwordResetEnabled?: boolean;
  onDone: () => void;
}) {
  useInterfaceLanguage();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canRegister = !setup && registrationMode !== 'closed';
  const canReset = !setup && passwordResetEnabled;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
    setCode('');
  }

  function clearDrafts() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('hokse.quiz-draft.') || key === 'hokse.onboard-step') {
        localStorage.removeItem(key);
      }
    }
  }

  async function requestCode(purpose: 'register' | 'reset') {
    if (!email.trim()) {
      setError('請填寫有效的電郵地址');
      return;
    }
    if (purpose === 'register' && registrationMode === 'passcode' && !passcode.trim()) {
      setError('請先填寫班級註冊通行碼');
      return;
    }
    setSendingCode(true);
    setError('');
    setNotice('');
    try {
      const endpoint = purpose === 'register' ? '/auth/register/code' : '/auth/reset/code';
      const result = await api<{ cooldownSeconds?: number }>(endpoint, 'POST', {
        email: email.trim(),
        ...(purpose === 'register' && registrationMode === 'passcode' ? { passcode: passcode.trim() } : {}),
      });
      setCooldown(result.cooldownSeconds ?? 60);
      setNotice('6 位數字驗證碼已發送至你的電郵（10 分鐘內有效）');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingCode(false);
    }
  }

  return (
    <main className="login-space">
      <section className="card login-card">
        <LanguageSwitch />
        <img src="/favicon.svg" width="48" alt={ui("學序")} />
        <div className="eyebrow">A LITTLE PROGRESS, EVERY DAY</div>
        <h1>
          {setup
            ? ui("建立你的學習工作室")
            : mode === 'register'
              ? ui("以電郵驗證建立帳戶")
              : mode === 'reset'
                ? ui("憑電郵驗證碼重設密碼")
                : ui("歡迎回到學序")}
        </h1>
        <p className="muted">
          {setup
            ? ui("本機首次設定：建立開發者帳戶，再邀請復核者與試用學生。")
            : mode === 'register'
              ? registrationMode === 'passcode'
                ? ui("輸入班級通行碼與電郵獲取 6 位驗證碼，即可自助建立學習帳戶。")
                : ui("輸入電郵獲取 6 位驗證碼，即可自助建立學習帳戶。")
              : mode === 'reset'
                ? ui("輸入帳戶已綁定的電郵地址，驗證 6 位驗證碼後設定新密碼。")
                : canRegister
                  ? ui("使用帳戶名稱或已驗證電郵登入，亦可憑電郵驗證碼註冊新帳戶。")
                  : ui("使用獲邀請的帳戶登入，繼續自己的學習與復習。")}
        </p>

        {!setup && (canRegister || canReset) && (
          <div className="pilot-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`btn ${mode === 'login' ? 'primary' : 'secondary'}`}
              onClick={() => switchMode('login')}
            >
              {ui("登入帳戶")}
            </button>
            {canRegister && (
              <button
                type="button"
                className={`btn ${mode === 'register' ? 'primary' : 'secondary'}`}
                onClick={() => switchMode('register')}
              >
                {ui("註冊新帳戶")}
              </button>
            )}
            {canReset && (
              <button
                type="button"
                className={`btn ${mode === 'reset' ? 'primary' : 'secondary'}`}
                onClick={() => switchMode('reset')}
              >
                {ui("忘記密碼")}
              </button>
            )}
          </div>
        )}

        {(setup || mode === 'login') && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setNotice('');
              try {
                await api(setup ? '/auth/setup' : '/auth/login', 'POST', { username, password, name });
                clearDrafts();
                onDone();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {setup && (
              <label className="field">
                <span>{ui("顯示名字")}</span>
                <input
                  required
                  maxLength={30}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}
            <label className="field">
              <span>{setup ? ui("帳戶名稱") : ui("帳戶名稱或已驗證電郵")}</span>
              <input
                required
                pattern={setup ? '[a-zA-Z0-9_.-]{2,40}' : undefined}
                maxLength={setup ? 40 : 120}
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                placeholder={setup ? ui("2–40 個英數字元") : ui("帳戶名稱或電郵地址")}
              />
            </label>
            <label className="field">
              <span>{ui("密碼")}</span>
              <input
                required
                type="password"
                minLength={setup ? 10 : 3}
                maxLength={200}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={setup ? 'new-password' : 'current-password'}
              />
            </label>
            {error && <p role="alert" className="form-error">{ui(error)}</p>}
            {notice && <p role="status" className="model-explanation">{ui(notice)}</p>}
            <button className="btn primary" disabled={busy}>
              {busy ? ui("正在確認…") : setup ? ui("建立開發者帳戶") : ui("登入學習空間")}
            </button>
          </form>
        )}

        {!setup && mode === 'register' && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setNotice('');
              try {
                await api('/auth/register', 'POST', {
                  email: email.trim(),
                  passcode: passcode.trim(),
                  code: code.trim(),
                  username: username.trim(),
                  name: name.trim(),
                  password,
                });
                clearDrafts();
                onDone();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {registrationMode === 'passcode' && (
              <label className="field">
                <span>{ui("班級註冊通行碼")}</span>
                <input
                  required
                  maxLength={80}
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  placeholder={ui("請輸入負責人提供的通行碼")}
                  autoComplete="off"
                />
              </label>
            )}
            <label className="field">
              <span>{ui("電郵地址")}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  required
                  type="email"
                  maxLength={120}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  autoComplete="email"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={sendingCode || cooldown > 0 || !email.trim()}
                  onClick={() => void requestCode('register')}
                >
                  {sendingCode
                    ? ui("發送中…")
                    : cooldown > 0
                      ? ui("{0} 秒後重發", [cooldown])
                      : ui("獲取驗證碼")}
                </button>
              </div>
            </label>
            <label className="field">
              <span>{ui("6 位電郵驗證碼")}</span>
              <input
                required
                pattern="\d{6}"
                maxLength={6}
                inputMode="numeric"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </label>
            <label className="field">
              <span>{ui("帳戶名稱")}</span>
              <input
                required
                pattern="[a-zA-Z0-9_.-]{2,40}"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                placeholder={ui("2–40 個英數字元")}
              />
            </label>
            <label className="field">
              <span>{ui("顯示名字")}</span>
              <input
                required
                maxLength={30}
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span>{ui("密碼（至少 10 字元）")}</span>
              <input
                required
                type="password"
                minLength={10}
                maxLength={200}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            {error && <p role="alert" className="form-error">{ui(error)}</p>}
            {notice && <p role="status" className="model-explanation">{ui(notice)}</p>}
            <button className="btn primary" disabled={busy}>
              {busy ? ui("正在建立帳戶…") : ui("完成驗證並建立帳戶")}
            </button>
          </form>
        )}

        {!setup && mode === 'reset' && (
          <form
            onSubmit={async e => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const res = await api<{ ok: boolean; username: string }>('/auth/reset', 'POST', {
                  email: email.trim(),
                  code: code.trim(),
                  password,
                });
                setUsername(res.username || email.trim());
                setPassword('');
                setCode('');
                setMode('login');
                setNotice('密碼已重設，舊登入會話已撤銷；請使用新密碼登入。');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>{ui("已綁定的電郵地址")}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  required
                  type="email"
                  maxLength={120}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  autoComplete="email"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  disabled={sendingCode || cooldown > 0 || !email.trim()}
                  onClick={() => void requestCode('reset')}
                >
                  {sendingCode
                    ? ui("發送中…")
                    : cooldown > 0
                      ? ui("{0} 秒後重發", [cooldown])
                      : ui("獲取驗證碼")}
                </button>
              </div>
            </label>
            <label className="field">
              <span>{ui("6 位電郵驗證碼")}</span>
              <input
                required
                pattern="\d{6}"
                maxLength={6}
                inputMode="numeric"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </label>
            <label className="field">
              <span>{ui("新密碼（至少 10 字元）")}</span>
              <input
                required
                type="password"
                minLength={10}
                maxLength={200}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            {error && <p role="alert" className="form-error">{ui(error)}</p>}
            {notice && <p role="status" className="model-explanation">{ui(notice)}</p>}
            <button className="btn primary" disabled={busy}>
              {busy ? ui("正在重設…") : ui("重設密碼")}
            </button>
          </form>
        )}

        <small className="muted">
          {setup
            ? ui("請妥善保存帳戶資料。正式內容需由兩個不同復核帳戶確認後發布。")
            : canRegister
              ? ui("每個電郵地址限綁定一個學習帳戶；驗證碼於 10 分鐘內有效。")
              : ui("尚未有帳戶？請向試用負責人索取邀請。")}
        </small>
      </section>
    </main>
  );
}
