# 真實模式啟動、復核與試用準備

2026-11-01界面語言：登入頁及全站右上角可選繁體中文／English，選擇只保存在本瀏覽器，不需資料庫遷移。`?lang=en`也可直接設定英文，指南跟隨界面但保留`/help?lang=en`入口。開發時以`ui(...)`接入`src/i18n/en.json`，系統資料只做顯示投影；不要翻譯／覆寫學生輸入或更改教學內容語言。執行`src/i18n.test.ts`、完整前後端測試及production build，另做中英文切換、草稿保留、管理員權限和窄屏檢查。詳見 [界面翻譯驗證](interface-language-verification.md)。

學生操作見 [中文使用指南](user-guide.md)／[English User Guide](user-guide.en.md)，站內入口為側欄／頁尾「使用指南」。`/help`及`/help?lang=en`直接渲染對應Markdown；每次功能或資料範圍更新，須同步更新兩版操作步驟、可用／規劃狀態及日期紀錄，見 [維護約定](../AGENTS.md)。

數學外部索引已加入「學習資源 → 數學 By Topic 題目索引」。這是來源分類、程度和文件入口，不是已發布評核內容；不得以匯入索引替代內容復核。覆蓋、提取與離線校驗命令見 [資料提取紀錄](research/maths-index-extraction.md)。

本地版本已實現；真實模型、正式內容審校及遠程學生試用各有獨立驗收。實際結果見 [本次驗證](pilot-verification.md)。

2026-10-31 P1本地入口為 `/studio`，原有已審校題庫保留於 `/pilot`。數學／中文／英文自主練習毋須逐題雙人發布；AI題目與回饋明確標為參考／暫定，不變成已審校證據。開發者沿用原模型設定即可使用；沒有模型時可做固定練習，主觀題不造分。只有AI獨立小測生成允許最多三次生成，聊天、導讀後練習與評價不循環返工。機器契約為 `server/quiz-contract.ts`，規範見 [AI輸出規範](ai-output-contract.md)，檢查證據見 [P1驗證](p1-verification.md)。

P1最初完成於本地；公網版本以 [部署驗證](deployment-verification.md) 的實際版本紀錄為準。變更推送 main 後由 Actions 檢查，全部通過才由 Render 自動部署，保留既有 Free 設定。`pnpm test:server` 已包含P1整合檢查，覆蓋模型替身的Chat／Responses、返工次數、快速請求、隔離、糾正、休息與預覽版本；這些不代表真實提供方教學品質通過。

## 本機啟動

2026-11-01：既有試用帳戶登入支援至少3字元，以便負責人私下重設指定帳戶為3–5字元；首次設定和一般邀請API仍至少10字元，開發者邀請表單不變。指定帳戶重設時須只改密碼雜湊並撤銷該帳戶舊會話，不更動學習資料；憑據和逐人邀請只更新於私有忽略目錄。這不是公開忘記密碼或短密碼註冊功能。

需要 Node.js 24.12 或以上及已安裝的項目依賴。Windows 可雙擊根目錄 `start-pilot.cmd`；它會優先使用已存在的 Codex Node runtime，避免系統舊版 Node 20 的問題。也可在本目錄執行：

```powershell
pnpm dev:pilot
```

前端從 5173、API 從 3001 選取空閒端口，命令會打印實際網址；保留已在運行的服務。也可明確指定空閒端口：

```powershell
$env:HOKSE_FRONTEND_PORT='5180'
pnpm dev:pilot
```

初次在本機頁面建立開發者帳戶，再到「內容與開發設定 → 邀請帳戶」建立內容復核者和學生。帳戶名稱支援2–40個英文字母、數字、句點、底線或連字號，登入不分大小寫；密碼仍須符合原有強度規則。沒有公開註冊、預設管理員密碼或自動分配的學生帳戶。逐人私下傳送邀請，不要分享管理員或整份帳戶清單。不要用開發者帳戶當作正式學生的獨立作答證據。

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

在 `/developer?tab=model` 設共用 URL／協議／Key，獲取清單，再用管理測試模型驗證連線。模型測試實際消耗提供方 API，但屬 Platform 日誌，不扣學生 credit。啟用／保存共用連線後，實際學生型號由 `/developer?tab=billing` 的套餐權限與學生 `/billing` 選擇決定；全站停用仍會阻擋所有生成。新模型不自動定價或開放。密鑰同 URL 留空保留，換 URL 必須另填。

Free/Plus/Pro 初始 500/2000/5000 credit，香港月初惰性重置。學生舊帳戶不補扣歷史。只有模型生成操作才預留；一次操作含最多三次題目返工只收一次，失敗／無效／取消釋放。學習結果與扣點在同一短交易保存，提供方等待期間不持有交易；無結果孤立預留五分鐘後回收。模型／價格快照和請求 ID 持久化在 `credit_operations`，不能靠刪日誌修復餘額。

模擬訂單是獨立 provider 路徑，不處理卡號或真實金流，不能當作真實付費憑證。實際金流、webhook 驗簽、退款、年付、充值、優惠券及供應方成本對帳列為後續工作。修改規則會留下 `billing_audit`，升級不重新派發月度額度，學生降級／取消月底生效。舊待付款單在規則改動後須重新建立。

`/developer?tab=usage` 僅 developer 可讀。記錄真實上游 HTTP、請求摘要、token（缺失為 null）、耗時及操作結算；詳情 API 不包含返回正文。單筆 JSON／篩選 JSONL 匯出才解密正文，清理金鑰／Authorization／Cookie。日誌 30 天／1,000 條上限，查詢和新增時清理；credit／訂單不隨日誌刪除。學生指南已告知管理員可匯出返回文字。保持匯出檔案私有。

`pnpm test:server` 包括 `server/billing.check.ts`；所有生成／付款案例以隔離 fixture 驗證，不冒用學生帳戶改方案或呼叫真實 AI。雲備份升為 `hokse-cloud-v2`，涵蓋五張新表；還原接受舊 v1（新表初始化為空），只允許還原到空資料庫。持續使用固定加密密鑰，遺失會連返回文字和重播快取一同失效。詳見 [驗證](billing-verification.md)。

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

費用與免費額度見 [托管費用說明](hosting-costs.md)。保持 Render Free／Hobby 和 Supabase Free；自動部署設 After CI Checks Pass；檢查通過才構建，額外構建支出維持 US$0／月，達限不升級。此上限不控制流量費。

按步驟分享給學生，見 [上線與帳戶分享指南](deployment-guide.md)：現採 Render Free Docker＋Supabase Free PostgreSQL，無付費磁盤。雲端連線、私有資料表與首位管理員已建立；公開 HTTPS、資料隔離與重啟保存已有獨立驗收，見部署驗證。

Render依保留的Dockerfile構建單個Node服務，提供`dist-pilot/`和同源API。2026-11-01已移除本機Compose及臨時隧道分享腳本；日常分享雲端網址即可，本機開發用Node。先前Docker驗證保留為歷史證據，見部署驗證。

空庫可在私有Shell執行`node server/bootstrap-admin.ts`建立首位開發者，密碼不回顯；已有帳戶時拒絕初始化，且在資料庫交易內再次檢查空庫。此命令沒有新增公網初始化接口。Node本機開發用法見部署指南。

雲端使用 `.data/cloud.env` 保存 `DATABASE_URL` 與固定 `HOKSE_ENCRYPTION_KEY`，以 `node --env-file=.data/cloud.env server/bootstrap-admin.ts` 從本機直接初始化遠程空庫。Render 以私有變數或 `hokse.env` Secret File 注入，不將密鑰烘焙到鏡像，也不寫入 `VITE_` 前端變數。使用 `HOKSE_ALLOW_SETUP=false` 與 `HOKSE_SECURE_COOKIE=true`；Render 缺少雲端連線時拒絕啟動。既有本機SQLite及舊Docker資料卷僅保留資料，與雲端不自動同步；不要把清理部署工具當作刪除學習資料。

雲端備份使用 `node --env-file=.data/cloud.env scripts/backup-pilot.mjs`，產生私有壓縮快照；加密密鑰另行保管。恢復需指定另一個全新空庫、同一密鑰與 `--restore 備份檔 --empty-target`，拒絕覆寫已有帳戶。完整命令及免費休眠／容量限制見部署指南；不要把免費方案當作已有自動備份。

本機不使用 Docker 也能驗證正式產物：

一般`pnpm test:server`使用本機隔離測試，不需Docker；`pnpm check:postgres`只供已有Docker的維護者／CI選擇執行PostgreSQL整合測試。

```powershell
pnpm build:pilot
$env:HOKSE_STATIC_DIR='dist-pilot'
$env:PORT='3001'
$env:HOKSE_ORIGIN='http://127.0.0.1:3001'
pnpm server
```

遠程試用地址為 `https://web-education.onrender.com`，已通過 HTTPS、帳戶隔離與重啟保存驗收。維護者使用 `.data/cloud-login.md` 的私有網站管理員登入，到邀請帳戶建立學生。完成實際內容復核與模型配置後，再邀請 3–5 名學生試用兩周；目前沒有實際招募、訊息發送或學生試用結果。

## GitHub Actions 與密鑰保護（2026-11-02）

單人 main 工作流，不要求 PR；未來另分環境時再調整。CI 包括密鑰掃描及四項安全檢查、既有前端／後端測試與 production build、獨立 Docker PostgreSQL 測試，以及 JavaScript／TypeScript CodeQL。`Release readiness` 要求每項工作成功，失敗或取消不算通過；高／嚴重或 error 級 SARIF 結果阻擋發布。這些檢查不驗收教學品質或真實模型表現。

不向 CI 提供 `.data/cloud.env`、學生備份、AI Key、資料庫連線或 Render token；提供方及支付案例用替身，PostgreSQL 每次生成臨時憑據並清理容器。保留標準 Linux runner，無付費 Action、鏡像發布、學生資料 artifact 或自架 runner。Action 固定 commit。只有 CodeQL 工作有 security-events 寫權限，其他為 contents read；不使用 pull_request_target。

本機設定 `git config core.hooksPath .githooks`；新增 clone 後需要各自設定。`pnpm check:secrets` 掃描本地可見歷史，提交鉤子檢查 index；僅報位置，不把匹配值放進 log。GitHub 的 Secret scanning／Push protection 是另一層，格式支援有限，不能取代忽略私有檔案及本機檢查。備份和 Key 永不進 Git 或 Docker context。

Render 現有服務設 `checksPass`，保持 Free／Starter 和原費用上限；不建立新資源。請不要另開 On Commit 或呼叫另一個部署 hook，避免跳過檢查或重複發布。管理員可在 GitHub Actions 看失敗步驟；修好再推 main。只改驗證文件可用 `[skip render]`；使用指南內容改動不能跳過其發布。若 GitHub／Render 本身故障，先查對應執行回執，不以反覆重跑代替診斷。
