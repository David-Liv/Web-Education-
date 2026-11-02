# 管理員 API、套餐模型與使用日誌

更新：2026-11-02。共用 API 連線和各套餐模型權限分開管理。部署版本以 [部署驗證](deployment-verification.md) 為準。

1. 在 `/developer?tab=model` 填 URL、協議和 Key，獲取清單。只讀取 `/models`，不自動測試或開放所有模型。
2. 選管理測試模型，執行一次文字測試。草稿測試不更改已保存連線；會消耗提供方實際 API，但列為 Platform 日誌，不扣學生 credit。
3. 啟用並保存共用連線。全體使用者共用 URL／Key／協議；全站停用會阻擋生成。同 URL Key 留空保留，改 URL 必須另填。Key 僅服務端加密保存，不進入瀏覽器。
4. 在 `/developer?tab=billing` 設定各套餐額度、月費（模擬）、允許模型與預設模型，以及逐個完整 Model ID 的單價。Free/Plus/Pro 初始 500/2000/5000；Lite/Flash/Argon 初始 2/5/20。預設為 PGGO 抗截斷 3.5 Flash Lite／3.8 Flash／4 Argon。
5. 學生在 `/billing` 選套餐允許的模型；服務端驗證權限，不接受聊天 payload 任意覆寫。保留仍然允許的個人選擇；套餐預設適用未選擇、換套餐或已失效的選擇。新模型預設停用，需定價及授權後使用。規則改價不追溯已開始的操作。
6. `/developer?tab=usage` 查看每次上游呼叫。眼睛詳情含真實請求摘要、HTTP 狀態、耗時和提供方 token。沒有 token 就顯示未提供；不由字數估算。網頁 API 不含返回正文，單筆 JSON／篩選 JSONL 匯出才解密正文並清理憑據。

同一測驗內部重試共用一項 credit 操作，最多三條上游生成日誌；聊天和普通回饋維持快速路徑。管理員一般學習同樣依自己的套餐計量。日誌保留 30 天、最多 1,000 次；帳本、訂單與設定審計獨立，不因清理日誌消失。復核者無管理計費／日誌權限。

支援 OpenAI 相容 Chat Completions 及 Responses。現在提供方請求為非串流、無 tools、無指定 temperature，token 上限 2400；前端 SSE 是收到完整回覆後的呈現方式。列表可讀、文字可回、結構化輸出可用、教學品質可信是不同證據，不能相互代替。

未執行全型號真實生成或教學品質驗證；測試使用本機模型替身。真實金流、token 成本對帳與多提供方路由列為後續工作。操作／驗證詳見 [已批准方案](billing-credits-ai-logs-plan.md)、[驗證](billing-verification.md)、[運行說明](pilot-runbook.md)。
