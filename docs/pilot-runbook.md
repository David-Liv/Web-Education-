# 真實模式啟動、復核與試用準備

學生操作見 [使用指南](user-guide.md)，站內入口為側欄／頁尾「使用指南」。指南直接由同一 Markdown 檔渲染；每次功能或資料範圍更新，須同步更新操作步驟、可用／規劃狀態及日期紀錄，見 [維護約定](../AGENTS.md)。

數學外部索引已加入「學習資源 → 數學 By Topic 題目索引」。這是來源分類、程度和文件入口，不是已發布評核內容；不得以匯入索引替代內容復核。覆蓋、提取與離線校驗命令見 [資料提取紀錄](research/maths-index-extraction.md)。

本地版本已實現；真實模型、正式內容審校及遠程學生試用各有獨立驗收。實際結果見 [本次驗證](pilot-verification.md)。

## 本機啟動

需要 Node.js 24.12 或以上及已安裝的項目依賴。Windows 可雙擊根目錄 `start-pilot.cmd`；它會優先使用已存在的 Codex Node runtime，避免系統舊版 Node 20 的問題。也可在本目錄執行：

```powershell
pnpm dev:pilot
```

前端從 5173、API 從 3001 選取空閒端口，命令會打印實際網址；保留已在運行的服務。也可明確指定空閒端口：

```powershell
$env:HOKSE_FRONTEND_PORT='5180'
pnpm dev:pilot
```

初次在本機頁面建立開發者帳戶，再到「內容與開發設定 → 邀請帳戶」建立內容復核者和學生。沒有公開註冊、預設管理員密碼或自動分配的學生帳戶。不要用開發者帳戶當作正式學生的獨立作答證據。

開發命令同時啟動 API 和前端；API 源碼修改後會重啟，資料保留。Ctrl+C 關閉該命令所啟動的服務。示範模式仍用原本的 `pnpm dev`／`start-local.cmd`，兩個模式分開啟動，選擇空閒端口。

## 先完成正式內容復核

初始兩個內容包共 **48 道原創候選題、8 個教學短塊**。預設都是草稿，不是教師認證或已校準題庫。

1. 在工作台選內容包，下載 CSV 審核包；教材短塊可在同頁展開。
2. 每位復核者獨立核對題目、答案、評分點、來源與技能；教材也要逐段核對示例和解釋。記錄實際方法及已處理的疑問。
3. 每個題目和教學段落都需兩個不同帳戶的復核回執。另一位復核者用自己的帳戶登入，完成相同流程。
4. 通過結構校驗和雙人復核後發布。學生正式測驗只讀已發布版本。
5. 修改內容時匯入下一版本：JSON 可包含整個內容包；CSV 沿用所選包的技能及教材模板。先預覽校驗，再確認匯入草稿；新版本重新復核。舊測驗保留原題面、評分點和技能藍圖。

發布要求是內容復核，不等於專業核驗或難度校準。工作台沒有「自動全部審核通過」捷徑。隔離自動化測試資料的回執不能用作正式內容審校。

關鍵建模／滴定題要求核對步驟，提交後先進待批改隊列。復核者檢查原作答和評分點，保存分數、關鍵條件與回饋後，才產生相應正式證據。重複批改不會追加第二份結果。

## 接自己的模型服務

到開發者「模型服務」填服務名稱、實際 Base URL、密鑰和協議。支援 OpenAI 相容 Chat Completions 或 Responses；其他協議需另加適配器，不能只改服務名稱當作已相容。

保存後可取得 `/models` 列表，或手填 model ID，再測試所選模型。列表成功不代表每個模型可用。測試只驗證已選模型的文字能力；圖片、原生串流、結構化輸出沒有據此宣稱通過。

密鑰加密保存於服務端資料庫，解密密鑰在同目錄 `secret.key`；不寫入前端環境變數或學生接口。更換服務地址且不填新密鑰會清除舊密鑰，避免沿用到另一個服務。

AI 用於講解、候選錯因及解釋規則生成的日曆方案。錯因結構校驗失敗時不更新記錄。正式摸底／限時測驗尚未提交時，同單元 AI 教學暫停；自由練習中使用聊天會記錄輔助使用。模型不直接修改成績、掌握狀態或已採納日程。

當前適配器向提供方請求完整文字，再用網站 SSE 協議回傳；不是已驗證提供方的原生 token 串流。停止會取消正在進行的請求並保留中斷狀態。API 尚未配置時，教材、客觀測驗、復習和規則排程仍可使用。

## 記錄與時間

- 本機預設 SQLite：`.data/pilot.sqlite`；設定 `DATABASE_URL` 的雲端模式使用 PostgreSQL 私有 `hokse` schema。附件二進位存於對應資料庫，雲端全站附件上限為 100 MiB；`.data/` 已加入忽略清單。
- 服務端香港日期是正式記錄時間。2028 是目標考試年；不導入演示考期。官方時間表仍待核實。
- 初步／較穩定掌握有不同證據條件；提示、答案曝光、同題重做及待批改不作新的獨立證據。初始參數見 `src/pilot-types.ts`；內容包的 `skills[].policy` 可保存各技能經復核的門檻覆寫，變更需新內容版本及驗收。
- 14 天計劃避開今天已過時段，保留鎖定／完成任務和總預算；不把空閒時間強行填滿未有證據支持的教學。
- 小幅自動重排限定同日、同學科、同目的及相同時長，保留活動順序。跨天／跨科方案及目標變更先預覽；確認採納相同版本，資料或內容改變時重新預覽。
- 科目提分情景可填整科成本範圍，再重新計算 Best N 等組合。這些是使用者提供的假設，不是由單元測驗推算的實際提分時間或錄取概率。

## 建置與備份

```powershell
pnpm typecheck
pnpm typecheck:server
pnpm test
pnpm test:server
pnpm build:pilot
pnpm backup:pilot
```

`build:pilot` 產出 `dist-pilot/` 並檢查沒有打包服務端題庫或演示種子。原 `build` 仍產出演示版 `dist/`。

備份會在 `.data/backups/` 新建目錄，包含一致的 SQLite 快照及 `secret.key`。亦可指定全新備份資料夾。不要只備份密文資料庫卻遺失解密密鑰。

```powershell
node scripts/backup-pilot.mjs .data/backups/my-pilot-backup
```

恢復時先停止服務，將備份兩個檔案放進新的恢復目錄，以 `HOKSE_DATABASE` 指向該目錄的 `pilot.sqlite`；先驗證帳戶、學習記錄及附件，再切換正式使用。不要直接覆寫仍在運行中的資料庫。

## 部署準備

費用與免費額度見 [托管費用說明](hosting-costs.md)。保持 Render Free／Hobby 和 Supabase Free；自動部署關閉，手動發布前核對剩餘構建分鐘，額外構建支出設 US$0／月。此上限不控制流量費。

按步驟分享給學生，見 [上線與帳戶分享指南](deployment-guide.md)：現採 Render Free Docker＋Supabase Free PostgreSQL，無付費磁盤。雲端連線、私有資料表與首位管理員已建立；Render 公開 HTTPS 部署仍待驗證，不把本機結果當作已上線。

已提供 Dockerfile及Compose，使用單個 Node 服務提供 `dist-pilot/` 和同源 API。2026-10-28已在本機完成Docker構建與隔離容器啟動；遠程Render環境仍待部署，不能將本機結果當作已上線。

空庫可在私有Shell執行`node server/bootstrap-admin.ts`建立首位開發者，密碼不回顯；已有帳戶時拒絕初始化，且在資料庫交易內再次檢查空庫。此命令沒有新增公網初始化接口。Docker本機用法見部署指南。

雲端使用 `.data/cloud.env` 保存 `DATABASE_URL` 與固定 `HOKSE_ENCRYPTION_KEY`，以 `node --env-file=.data/cloud.env server/bootstrap-admin.ts` 從本機直接初始化遠程空庫。Render 以私有變數或 `hokse.env` Secret File 注入，不將密鑰烘焙到鏡像，也不寫入 `VITE_` 前端變數。使用 `HOKSE_ALLOW_SETUP=false` 與 `HOKSE_SECURE_COOKIE=true`；Render 缺少雲端連線時拒絕啟動。本機 Compose 的 SQLite 持久卷繼續保留，與雲端不自動同步。

雲端備份使用 `node --env-file=.data/cloud.env scripts/backup-pilot.mjs`，產生私有壓縮快照；加密密鑰另行保管。恢復需指定另一個全新空庫、同一密鑰與 `--restore 備份檔 --empty-target`，拒絕覆寫已有帳戶。完整命令及免費休眠／容量限制見部署指南；不要把免費方案當作已有自動備份。

本機不使用 Docker 也能驗證正式產物：

```powershell
pnpm build:pilot
$env:HOKSE_STATIC_DIR='dist-pilot'
$env:PORT='3001'
$env:HOKSE_ORIGIN='http://127.0.0.1:3001'
pnpm server
```

遠程試用地址為 `https://web-education.onrender.com`，已通過 HTTPS、帳戶隔離與重啟保存驗收。維護者使用 `.data/cloud-login.md` 的私有網站管理員登入，到邀請帳戶建立學生。完成實際內容復核與模型配置後，再邀請 3–5 名學生試用兩周；目前沒有實際招募、訊息發送或學生試用結果。
