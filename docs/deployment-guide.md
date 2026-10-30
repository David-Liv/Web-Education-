# 把學序上線並分享給學生

更新：2026-10-30。當前採用 **Render Free Web Service＋Supabase Free PostgreSQL**。Supabase 連線、私有資料表及首位管理員已建立；Render 公開網址須完成部署與驗證後才分享。沒有購買付費服務。

## 架構與免費限制

React 正式產物和 Node 24 API 由同一個 Render Docker 服務提供。Render 不保存學生資料；帳戶、登入憑證雜湊、學習記錄、日程、內容版本、附件及加密模型設定保存於 Supabase 的私有 `hokse` schema。前端只呼叫自己的 `/api/v1`，不取得資料庫連線串、資料庫密碼或模型密鑰。

這一版附件仍保存為資料庫二進位，計入 Supabase 的 **500 MB 免費資料庫額度**，沒有使用或聲稱已接通另計的 1 GB Storage。單檔仍最多 20 MiB；雲端版本對全站附件另設 100 MiB 上限，超過會拒絕上傳並說明原因。大量整卷上傳前需再接私有物件儲存及容量監控；PDF／OCR 與減免摸底仍未實作。

- Render 免費服務閒置 15 分鐘休眠，下一次訪問約需一分鐘啟動；重新部署及休眠不會清空外部 PostgreSQL。
- Supabase Free 有容量、流量及不活躍暫停限制；目前公開額度為 500 MB 資料庫，連續一周不活躍可能暫停。免費方案不提供無限容量或可用性保證。
- 不使用 30 天後到期的 Render Free Postgres，也不附加付費持久磁盤。AI 提供方用量與網站托管分開計費。
- 當前 Supabase 位於歐洲北部，因此 Render 使用法蘭克福，減少服務端跨洲查詢。未做大規模併發測試。

官方限制：[Render Free](https://render.com/docs/free)、[Supabase Free](https://supabase.com/pricing)。

## 私有配置

實際配置放在被 Git 和 Docker 忽略的 `.data/cloud.env`，不要提交或貼到聊天：

```dotenv
DATABASE_URL="postgresql://使用者:已編碼密碼@實際Session-pooler地址:5432/postgres"
HOKSE_ENCRYPTION_KEY="固定的32-byte Base64密鑰"
```

從 Supabase 的 Connect → Session pooler → URI 複製地址；密碼中的 `@` 等特殊字元必須 URL 編碼。不要將 Project URL 或 Publishable key 當資料庫連線串。共享 pooler 使用隨代碼附帶的 Supabase 官方公開 CA，保留證書及主機名驗證；其他 CA 可用 `HOKSE_DATABASE_CA` 指定。

`HOKSE_ENCRYPTION_KEY` 必須持續保留，不能隨部署更換，否則無法解密模型設定，啟動會拒絕密鑰不匹配。Render 缺少 `DATABASE_URL` 時拒絕啟動，不能悄悄退回臨時 SQLite。

## 首位管理員與帳戶

本機使用 Node 24.12+，直接連到雲端資料庫執行私有初始化，不需要 Render Free 不提供的 SSH／Shell：

```powershell
node --env-file=.data/cloud.env server/bootstrap-admin.ts
```

密碼輸入不顯示，僅空庫可建立首位開發者；兩個同時初始化的連線也只能成功一個。網站保持 `HOKSE_ALLOW_SETUP=false`，不開放公網首次初始化。

雲端與本機資料庫互相獨立，不會自動複製原本 Docker 的帳戶或進度。雲端管理員的私人登入資料由維護者保存於 `.data/cloud-login.md`。登入後，到「內容與開發設定 → 邀請帳戶」建立學生及復核者；沒有公開自行註冊、忘記密碼或自動寄信流程。

## Render 免費部署

已準備的 `render.yaml` 使用 `plan: free`，沒有磁盤及其他付費資源。Blueprint 的兩個私有變數需透過安全介面提供；不要上傳本機資料庫或密鑰到 GitHub。

| 欄位 | 設定 |
|---|---|
| 倉庫／分支 | `David-Liv/Web-Education-`／`main` |
| Language | Docker |
| Region | Frankfurt |
| Compute | Free |
| Root Directory | 留空 |
| Dockerfile | `./Dockerfile` |
| Health Check Path | `/api/v1/auth/status` |
| Pre-deploy／額外 Start Command | 留空 |
| Persistent Disk | 不建立 |
| Auto-deploy | On Commit（需 GitHub 連接） |
| 一般環境變數 | `HOST=0.0.0.0`、`PORT=3001`、`HOKSE_STATIC_DIR=/app/dist-pilot`、`HOKSE_ALLOW_SETUP=false`、`HOKSE_SECURE_COOKIE=true` |

私有配置可作為名為 `hokse.env` 的 Render Secret File 提供。程式從 `/etc/secrets/hokse.env` 載入；不要把密鑰放進 `VITE_` 變數或 Docker build arguments。Render 自帶網址透過 `RENDER_EXTERNAL_URL` 作同源驗證；自訂域名另設 `HOKSE_ORIGIN`。

也可使用官方 Render CLI 的 `--secret-file hokse.env:.data/cloud.env`，讓 CLI 直接讀取私有檔案，避免在命令參數中展開資料庫密碼。CLI 需另行瀏覽器授權；插件 OAuth 不等於 CLI 已登入。CLI 驗證、部署接受、狀態 live、公網功能驗證是不同階段。

## 上線驗收與分享

先確認部署到已推送的代碼版本，等待 Render 回報 `live`。再以公開 HTTPS 地址驗證：無登入不見學習資料、公網初始化關閉、管理員可登入、Secure Cookie、兩個學生資料及附件互相隔離、日程與筆記可保存。重新部署後再次登入及讀取，確認資料仍在，再分享網址。

不要在真實資料庫匯入自動化測試的已復核內容、測試帳戶或假掌握證據。預設教材仍為待人工復核草稿；真實模型要由開發者配置並實際測試。網站可登入不代表所有教學內容與模型已驗收。

## 備份與恢復

```powershell
node --env-file=.data/cloud.env scripts/backup-pilot.mjs
```

雲端命令產生 `.data/backups/cloud-時間.json.gz`，在一致的唯讀交易中匯出帳戶、學習狀態、內容版本、附件及加密設定。檔案包含私人資料，不能公開；將原有加密密鑰另行保管。免費方案不等於已有自動備份，維護者需主動備份並保留獨立副本。

恢復只允許指定全新空資料庫與同一加密密鑰；已有帳戶會拒絕覆寫：

```powershell
node --env-file=.data/新的空庫配置.env scripts/backup-pilot.mjs --restore .data/backups/實際備份.json.gz --empty-target
```

先驗證恢復結果，再切換服務連線。資料庫或模型密碼需要變更時，私下更新對應配置並重新部署，不要把憑證貼到公開日誌。

## 本機仍可繼續開發

未設定 `DATABASE_URL` 的本機模式繼續使用 SQLite。原有 `start-pilot.cmd`、`pnpm dev:pilot` 及 Docker Compose 保留：

```powershell
docker compose up -d --build
docker compose exec app node server/bootstrap-admin.ts
```

本機入口 `http://127.0.0.1:3001` 不能直接發給其他同學。`docker compose stop` 停止、`docker compose start` 繼續；不要執行 `docker compose down -v`，它會刪除本機資料卷。雲端部署完成後，學生只需瀏覽器，你的電腦不必持續開機。

學生流程見 [使用指南](user-guide.md)，內容復核與模型配置見 [試用操作說明](pilot-runbook.md)，當次驗證範圍見 [部署驗證](deployment-verification.md)。
