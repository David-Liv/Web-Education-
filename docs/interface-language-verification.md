# 全站界面語言驗證

日期：2026-11-01至2026-11-02。此紀錄針對繁體中文／英文界面，不代表新增英文題庫、真實模型教學品質或學生試用通過。

## 實作與維護

- `src/i18n.tsx`提供React語言狀態、登入／全站選擇器、香港時區日期及星期顯示。偏好保存於本瀏覽器的`hokse.interface-language`；`?lang=en`／`?lang=zh-HK`可指定入口語言，手動切換會同步已有語言參數，避免重新整理回到舊語言。
- `src/i18n/en.json`集中維護英文詞庫，以原中文作key；參數使用`{0}`等佔位符。完整句子優先，避免中英語序不同造成拼接錯誤。服務端系統標籤可按特定模板顯示英文；未知提供方文字保留原文。
- `src/i18n-catalog.ts`只產生顯示副本。科目ID、學歷／收費／題型等原始篩選值、課程公式、網址、原始試題和教材內容不改寫；沒有資料庫遷移。
- `profile.teachingLanguage`仍為獨立教學內容設定。個人名稱、答案、步驟、筆記、聊天歷史、管理員輸入及模型ID不作界面翻譯。原題與中文教學材料可能繼續顯示中文。
- `/help`跟隨界面語言，`/help?lang=en`直接顯示英文；兩份Markdown仍是唯一指南來源。README、runbook及中英文指南已同步。

## 本地自動驗證

- `node node_modules/vitest/vitest.mjs run`：69項通過，其中9項新增語言契約檢查。
- `node --test server/pilot.check.ts server/static.check.ts server/studio.check.ts server/model-settings.check.ts`：41項通過。
- 語言檢查覆蓋：所有顯式`ui`字串有英文、佔位符完整、英文值無殘留漢字、網址／保存偏好優先次序、未知字串回退、學生原文參數保留、DSE術語、目錄不變性、學歷／資源原始值及計分結果一致。
- `node scripts/build-pilot.mjs`：前後端TypeScript、外部數學元資料檢查、67操作OpenAPI及production build通過；bundle仍不包含服務端私有題庫或mock seed。

## 瀏覽器檢查

以本地隔離記憶體帳戶檢查，沒有呼叫真實AI或寫入雲端學生學習資料。

- 英文登入、全站側欄、總覽、日曆、每日溫習、學科／試卷、學習對話、測驗、錯題、資源、升學、設定及管理員頁逐頁檢查。動態卡片、星期、院校、來源難度與常見錯誤提示補齊。
- 在升學表單輸入`My draft 原文 preserved`，中→英切換前後原文一致，未提交表單。
- 隔離學生帳戶保存`Original note 原始筆記`與`Keep my English and 中文 exactly as written.`，切回中文後標題及內文仍逐字一致。
- `?lang=en`進入後跨頁／重新整理保留英文；指南切為中文時URL更新為`lang=zh-HK`，重新整理仍為中文，再切英文同步指南與全站。
- 數學固定獨立練習建立、填答、提交、暫定技能與下一步預覽已操作；原問題和作答保持原文，不將界面語言當作判分條件。
- production bundle以隔離學生帳戶完成一道已發布題庫的作答、提交、錯因選擇與每日複習入口；英文「Concept confusion」仍保存原有錯因值，原題及`My reasoning 原文 is preserved.`步驟保持原文。隔離題庫的發布狀態僅為UI fixture，不是人工審校或雲端發布。
- 390×844窄屏檢查日曆、學習流程、升學、資源、模型服務及指南；頁面無橫向溢出。修正語言選擇器擠壓頂欄、長英文按鈕逐字換行等問題，檢查後恢復預設視窗。

## 發布狀態

2026-11-02已發布至既有Render Free服務`Web-Education-`（`srv-dbi62sqjnfac73cu251g`）。業務commit為`f6de9dac1942ae377bb6d33bf4d8ba8d11196afa`，deploy為`dep-dbjvdcrbc2fs73dvi80g`，Render確認於2026-11-02 10:35 HKT進入`live`。使用者資料、模型選擇及服務方案未因本次界面更新修改；沒有建立新服務或資料庫遷移。

已在公開HTTPS完成既有管理員登入，等待帳戶資料及各頁非同步載入後，檢查總覽、日曆、每日複習、數學科目、學習對話、測驗、數學外部索引、升學、模型設定及英文指南的英文顯示。已實際切回中文、重新整理後確認保留中文，再切回英文；沒有以試驗題寫入雲端學生紀錄，沒有呼叫真實AI。UI草稿、作答、錯因及筆記完整流程使用前述本地隔離fixture驗證。

線上英文入口：[web-education.onrender.com/?lang=en](https://web-education.onrender.com/?lang=en)。線上日曆截圖另存於被忽略的`.data/reviews/english-live-calendar-2026-11-02.png`；報告中的公開commit與deploy ID均不含憑據。後續僅更新驗證文件的提交不重複觸發構建，保留自動部署關閉及Free方案。
