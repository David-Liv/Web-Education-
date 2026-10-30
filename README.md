# 學序 HOKSE · DSE 學習工作室

學生操作見 [使用指南](docs/user-guide.md)，網站側欄與頁尾亦可開啟 `/help`。此檔是站內指南的唯一內容來源；每次影響使用者的更新須同時修訂相關段落與更新紀錄，見 [專案維護約定](AGENTS.md)。

分享給其他學生及不同帳戶的使用方式，見 [上線與帳戶分享指南](docs/deployment-guide.md)。現採 Render Free＋Supabase Free，資料庫已連線並私下初始化管理員，公開網站仍待部署驗證；沒有公開自行註冊。

數學外部資料見 [By Topic 提取說明](docs/research/maths-index-extraction.md)。已整理 585 道歷屆卷二題與 23 道牛津樣本練習的元資料，另有 73 個課題文件連結；可從「學習資源 → 數學 By Topic 題目索引」篩選與下載 CSV。外部索引未匯入正式測驗題庫。

已有兩種運行模式：原有瀏覽器演示，以及新增的邀請制真實模式。**真實模式可雙擊 `start-pilot.cmd` 或執行 `pnpm dev:pilot`**；首次在本機建立開發者帳戶，再分配復核者及學生。Node 需 24.12+。內容預設為待復核草稿；模型服務在開發者頁設定。

Docker Desktop可用`docker compose up -d --build`啟動，再以`docker compose exec app node server/bootstrap-admin.ts`私下建立空庫首位開發者，開啟`http://127.0.0.1:3001`。本機 SQLite 保留；雲端使用 PostgreSQL、固定密鑰及 Supabase 官方 CA。私有配置在被忽略的`.data/cloud.env`，可用`node --env-file=.data/cloud.env server/bootstrap-admin.ts`直接私下初始化雲端空庫，不需要開公網設定入口。`render.yaml`已改為免費服務、法蘭克福及無持久磁盤。

真實模式包含 SQLite／PostgreSQL、帳戶隔離、兩個單元、獨立／隔時證據、內容審校、版本日曆與模型接入。`pnpm check:postgres`會以獨立臨時 Docker PostgreSQL 驗證相同 API 流程、交易回滾、並行寫入及備份恢復，不連到真實學生庫。詳見 [操作說明](docs/pilot-runbook.md)、[部署驗證](docs/deployment-verification.md) 及 [58 個真實 API 操作](public/openapi-pilot.json)。實際人工審校、使用者 AI API、遠程部署驗收和學生試用尚待完成。下列原有說明適用於**演示模式**。

面向香港中學生的可操作前端示範，預設使用繁體中文、2028 備試人物及 2028-02-14 示範時鐘。React + TypeScript + Vite，MSW 提供瀏覽器內 mock API；不用 AI key 或後端服務。

## 開啟

目前專案工具鏈需要 Node.js 24.12+ 及 pnpm。工作目錄：`D:\CUHK\Web Education`。

```powershell
pnpm install
pnpm dev
```

開啟終端顯示的 `http://127.0.0.1:5173/`。已安裝依賴時亦可直接執行：

Windows 也可雙擊 `start-local.cmd`；保留終端視窗即可持續預覽，Ctrl+C 停止。檢查用服務會在交付時關閉，重新查看時執行此腳本即可。

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1
```

若 pnpm 首次安裝提示要批准 esbuild / msw，專案已在 `pnpm-workspace.yaml` 明確列出允許的建置腳本。`public/mockServiceWorker.js` 已生成；需要更新時執行 `node node_modules/msw/cli/index.js init public --save`。

## 展示路線

1. **學習總覽**：示範學生、練習證據、科目和今日任務。
2. **我的學科 → 數學 → 一元二次方程**：看教材、公式、切換英文、完成學習。
3. **專題測驗**：選五題；試用提示、填數值答案、重新整理恢復草稿、提交看解析。錯題同步到錯題簿，獨立客觀題同步掌握度。
4. **每日溫習**：今日／昨天／到期內容、摘要、回憶卡、小測、筆記、講解、專注計時及晚間反思。預設只挑每日預算內的一批內容。
5. **升學目標**：比較課程，設定主目標和最多兩個備選；查看實際 Best N 加權計算及升一級的 what-if。
6. **目標與時間**：填入學校預測／模擬等級、目標等級、每日分鐘及開始時間。
7. **溫習日曆**：預覽、套用兩週計劃；修改、拖動、鎖定、完成或跳過任務。超時／重疊會顯示原因。
8. **AI 學習室**：建立不同模式的持續對話，試用串流、停止、重新命名、保存重點及圖片／聲音附件。
9. **個人設定**：可在有內容的示範人物與空白新同學間切換；提供資料匯出、模擬慢速／錯誤網絡及來源入口。

## 真實互動與示範邊界

| 功能 | 實作狀態 |
|---|---|
| 科目、分卷和知識地圖 | 甲乙丙類目錄；中英數化詳細結構，代表性原創教材及題目，其餘標示籌備中 |
| 選擇／數值題 | 實際判分、草稿、計時、重交防重複、提示排除證據 |
| 掌握度 | 最近五道不同獨立題目的得分比；未評估和零分分開，少於三題提示證據不足 |
| 主觀題、AI、OCR、語音分析 | 保存真實輸入與附件，回覆／評語為預製示例，不給假 DSE 等級 |
| 聽力／錄音 | 原創合成 WAV、HTML 音訊播放器、MediaRecorder 真實錄音；沒有真實轉寫或口語評分 |
| 大學計分 | 可計算已結構化的 Best N 規則；未核對完整換算的結果標示示範，缺失權重不計算 |
| 策略與日曆 | 確定性的示範排序／排程，加權增益、最低要求和弱項參與排序；容量、衝突和保留任務是實際檢查，沒有聲稱全局最優 |
| 考試日期 | 2028 示例日期，絕非官方公布的考期 |
| 資源與合作 | 真實資源連結、瀏覽器收藏、當地點擊計數；虛構合作卡清楚標示，未接支付或商戶後台 |

每日複習預設佔時間預算 20%，最多 20 分鐘，已包括在日曆總時長中。自評熟悉度不會增加客觀掌握分數。短診斷只反映示例知識點，不由小測推斷整科 DSE 等級；升學計算採學生另行輸入的學校預測／模擬等級。

## 接口和後端替換

- [OpenAPI 3.1 合約](public/openapi.json)：32 個操作，含請求、回應與結構化錯誤。
- `src/api/client.ts`：唯一前端 API / SSE 客戶端。
- `src/api/mock.ts`：MSW handlers、狀態轉移及本地持久化。
- `src/types.ts`：共同領域型別。修改型別後執行 `node scripts/generate-openapi.mjs`。
- `.env.example`：接真實後端時設 `VITE_API_MODE=real` 及 `VITE_API_BASE_URL`；此模式不啟動 MSW，真實服務仍須另行實作。

記錄保存在 localStorage `hokse.study.v1`，未提交草稿另存 `hokse.quiz-draft.*`。附件 Blob 保存於 IndexedDB `hokse-media/files`，無遠端上傳。JSON 匯出不包含 Blob。重設會替換這個示範 app 的記錄，並清除本機附件及測驗草稿；不同瀏覽器或清除網站資料後無法共享／恢復。資料庫版本目前為 1，未實作跨版本遷移。

正式上線前須由後端實作帳戶／學生隔離、權限、資料保留與刪除、附件儲存、安全掃描、限流、AI 批改校準及題庫權限。mock 題目答案位於前端 bundle，不能用作正式保密測驗。`bootstrap` 是展示用整包資料接口，生產服務應改為認證及按學生範圍查詢。

## 檢查

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

若本機 pnpm 執行器受限，可直接使用：

```powershell
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
```

來源、年份及數據缺口見 [docs/data-sources.md](docs/data-sources.md)。實際檢查範圍見 [docs/verification.md](docs/verification.md)。

下一階段的已確認決策、待決問題和後續功能備註見 [產品規劃](docs/product-plan.md)，學習 prompt 的採用與調整見 [導師邏輯](docs/tutor-logic.md)。這些文件是規劃紀錄，不代表功能已實現。

首期範圍、後端接口遷移、初始規則及試用驗收，見 [已批准的實施方案](docs/pilot-implementation-plan.md)。本地代碼及檢查見本次驗證；3–5 人兩周試用須待實際內容、模型及部署條件完成後安排。
