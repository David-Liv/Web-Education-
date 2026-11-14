# HOKSE 更新日誌 / Release notes

## v1.10.0 · 2026-11-14

- 零門檻直入式課題學習（`src/TopicGuidedCourse.tsx`、`src/pages/Subjects.tsx`、`src/pages/Studio.tsx`）：點選課題直接開啟全頁直入式教學與練習頁，移除練習前的「目標等級」與「每天可用時間」表單阻隔，將相關設定統一歸入升學目標與溫習日曆排程。
- 新增香港 DSE 數學必修「因式分解」7 部分直入式導學與引導練習（`src/data/factorisation-guide.ts`、`src/factorisation-check.ts`）：頂部顯示整體與 Part 1–7 各部分獨立掌握 `%` 進度，向下捲動逐步學習精簡步驟、例題與常犯陷阱，配搭 49 道原創同型變體題、零 AI credit 安全多項式解析與分解完整性即時診斷，以及「換同型新題獨立再試」無輔助驗證機制。
- 長篇因式分解原理解析拆分為 8 個分段 AI 講解知識切片（`server/tutors.ts`、`src/api/mock.ts`），支援每部分與每道題一鍵帶入 AI 學習室進行短段落互動拆解。
- Zero-barrier direct topic learning (`src/TopicGuidedCourse.tsx`, `src/pages/Subjects.tsx`, `src/pages/Studio.tsx`): clicking a topic opens a full-page Direct Topic View immediately, decoupling target-grade and daily-time inputs into schedule building (`/goals` and `/calendar`).
- Added a 7-part HKDSE Factorisation guided course (`src/data/factorisation-guide.ts`, `src/factorisation-check.ts`) with top-level and per-part `%` progress, scroll-down 3-step methods, worked examples, trap callouts, 49 original isomorphic variants, instant zero-credit polynomial equivalence & complete-factorisation diagnostics, and unassisted fresh-variant retesting.
- Chunked detailed Factorisation explanations into 8 topic slices (`server/tutors.ts`, `src/api/mock.ts`) with one-click “Ask AI to explain this part / question” handoffs.

## v1.9.0 · 2026-11-14

- 學習總覽改為以「今天的學習清單」為中心的書桌式版面：下一項任務可直接開始任務專注，頂部亦常駐「自由專注」入口；合併「我的學習報告」視窗（真實版整合雙周學習回顧），待辦進行時摺疊次要建議，簡化「我的升學方向」卡片，並按香港星期與「已記錄學習分鐘」呈現每週統計。
- 新增雙模式瀏覽器專注計時（`src/focus.tsx`）：任務專注保留在頂欄並支援沉浸書桌切換、提前結束 5 秒撤銷及完成後一鍵標記任務完成；自由專注支援 15／25／45／75 分鐘預設、瀏覽器原生全屏與全畫面書桌鎖定（須按「取消自由專注」並再次確認才可中途離開）、分頁標題即時倒數、卡點暫存便條（完成後一鍵帶去 AI 學習室或討論區提問）及獨立保存在瀏覽器的今日自由專注統計，絕不混入學習紀錄或掌握證據。
- 側邊欄按用途分組（每組不多於四項），手機版新增底部快捷導覽列及 44px 觸控目標，修復 1024px 及 390px 頂欄在專注與英文狀態下的斷行／溢出，提高討論區版塊標籤對比度並消除溫習工具卡的重複堆疊圖標；中英雙語搜尋互通（支援無結果一鍵問 AI）並支援鍵盤選取；通知改為按回覆或「全部標為已讀」才清除。
- Study Overview is now a study desk centred on Today's learning checklist, with task focus for the next scheduled item, an always-available Open Focus launcher, a unified My learning report modal, calmer secondary cards, and Hong Kong weekday bars for recorded study minutes.
- Added a dual-mode browser focus system (`src/focus.tsx`): Task focus stays in the top bar with immersive desk toggling, 5-second Undo and one-tap task completion; Open focus provides 15 / 25 / 45 / 75-minute presets, native browser full screen plus an app-level locked focus desk (requiring explicit two-step cancel confirmation to exit early), live tab-title countdowns, a Stuck-point scratchpad with one-click handoff to AI Study Room or Student Forum, and a separate browser-local daily open-focus tally without touching study records or mastery evidence.
- Regrouped the sidebar by task (at most four items per group), added a mobile bottom shortcut bar with 44 px touch targets, fixed 1024 px and 390 px topbar wrapping/overflow across active focus and English states, raised forum board pill contrast above WCAG AA, streamlined review tool headers, and added cross-language search with zero-result AI handoff.

## v1.8.0 · 2026-11-13

- 新增 Reddit 式「同學討論區」（`/forum`），涵蓋吹水／樹洞、升學／JUPAS 及全科 DSE 官方版塊，支援摺疊蓋樓留言、Markdown 與數學公式、單選投票及前端自動壓縮附圖（最多 3 張、每張 200 KB 內）。
- 提供獨立論壇暱稱與逐篇／逐則匿名機制（同貼編號、跨貼重置），並支援公開 WhatsApp OpenGraph 分享與「僅登入同學可見」雙重私隱設定。
- 維持 100% 純真人、零 AI credit 交流邊界，只設正向共鳴不設倒讚；支援從錯題簿、已交卷測驗與數學 By Topic 一鍵帶題發問，以及從貼文一鍵帶去 AI 學習室私下問導師。
- Added a Reddit-style Student Forum (`/forum`) across Lounge / Treehole, Admissions / JUPAS and official DSE subject boards, with collapsible nested threads, Markdown/KaTeX formulas, single-choice polls and browser-compressed images (up to 3 images, 200 KB max each).
- Introduced an independent forum nickname, per-post / per-comment anonymity (numbered within each thread and reset across posts), public WhatsApp OpenGraph previews and Signed-in students only visibility.
- Preserved a 100% human-only, zero-credit boundary with positive empathy reactions, sanitized one-click question references from mistakes, submitted quizzes and Maths By Topic, moderation tools and 24-hour youth crisis helpline support.

## v1.7.0 · 2026-11-11

- 整理並簡化 AI 生成的重複與雜亂代碼（清理「屎山代碼」），收斂模組邊界與接口數量。
- 統一練習作答紀錄、回饋復核、聊天檢查與個人設定的資料契約，並加入自動化架構護欄測試。
- Cleaned up tangled and duplicated AI-generated legacy code, balancing module boundaries and interface count.
- Unified data contracts across practice attempts, feedback reviews, chat checks and profile settings, backed by automated structural architecture checks.

## v1.6.0 · 2026-11-06

- 二次方程加入針對練習、新題復測及可下載練習。
- 連接導師、聊天與課件的學習歷程，改善下一步與每日回顧。
- 作答回饋加入一次免費復核。
- Targeted quadratic practice, new-question retests and downloadable practice sheets.
- Connected learning histories across tutors, chats and lessons, with clearer next steps and daily review.
- One free review of each answer judgement.

## v1.5.0 · 2026-11-06

- Choose a teaching approach and keep it with your conversation.
- Download short lessons, revisit versions and discuss exercises by number.
- Continue learning with saved goals, preferences and notes.

## v1.4.0 · 2026-11-05

- 日曆加入直接拖動、觸屏長按、落點預覽及三秒撤銷提醒。
- 側邊欄可收起為圖標，支援名稱提示並記住偏好。
- 精簡聊天輸入區，改善短任務顯示及安排衝突提示。
- Direct calendar dragging, touch-and-hold, destination previews and a three-second Undo reminder.
- Collapsible navigation with icon labels and a remembered layout.
- A cleaner chat composer, clearer short-task labels and scheduling feedback.

## v1.3.0 · 2026-11-05

- 聊天練習與題解加入檢查，並在原回覆展示完整內容。
- 改善離開後的對話接續，提供一次失敗重試。
- 管理員可統一設定練習復核模型；學生自動檢查不另扣點。
- 改善公式與隨堂練習的顯示穩定性。
- Chat practice and worked-answer checks, delivered within the original reply.
- Better continuity across navigation and one retry after failure.
- A site-wide reviewer setting with no additional student charge for automatic checks.
- More reliable formatting for formulas and chat exercises.

## v1.2.0 · 2026-11-04

### 中文

- 學習對話加入表格、公式及多種圖形，支援簡單數據圖、函數圖、幾何、思維導圖與電路示意。
- 每次回覆提供三個相關的下一步建議，可先編輯再傳送，並可還原上一份草稿。
- 隨堂練習的提示與答案可展開查看；圖形支援放大及 SVG／PNG 下載。
- 改善中文圖形標籤排版，更新中英文使用指南及管理員說明。

使用範圍：電路圖為基礎示意；滑桿及即時計算紀錄表尚未提供。AI 隨堂練習供陪練，發現答案與解析不一致時可要求重新核算。

### English

- Richer study conversations with tables, formulas, data charts, function plots, basic geometry, concept maps and circuit schematics.
- Three contextual next-step suggestions per reply, editable before sending, with one-step draft restoration.
- Expandable practice hints and answers, diagram enlargement, and SVG/PNG downloads.
- Clearer Chinese diagram labels and updated student and administrator guides in both languages.

Scope: circuits are basic schematics. Slider forms and records with live calculations are not available. AI practice is for coaching; ask for recalculation if an answer disagrees with its explanation.

## v1.1.0 · 2026-11-04

### 中文

- 改善課程探索、歷年收分展示及目前／目標成績對照。
- 加入升學目標相關的溫習優先次序與計劃預覽。
- 分開學生與管理員指南，以版本摘要呈現產品更新。

### English

- Improved programme discovery, historical admission-score views, and comparisons with current and target grades.
- Goal-related revision priorities and plan previews.
- Separate student and administrator guides, with version-based product updates.

版本記錄描述產品改動；實際上線版本以部署紀錄為準。
Release notes describe product changes; deployment records identify the version currently live.
