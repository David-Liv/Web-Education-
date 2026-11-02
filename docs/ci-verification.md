# CI 與自動發布

日期：2026-11-02。用戶確認首批自動檢查、main 直接發布、不要求 PR，穩定版與測試版之後再分。套餐、credit、模擬帳單及使用日誌已於先前的 `7a18c84` 版本上線；此次接入持續檢查與發布。

## 範圍

- `HOKSE checks`：密鑰檢查、安全檢查測試、前端及服務端測試、正式構建與 OpenAPI 同步、臨時 PostgreSQL、JavaScript／TypeScript CodeQL，以及必須全部成功的 Release readiness。
- 只用標準 Ubuntu runner，Action 固定為官方倉庫核對過的 commit。無部署 token、AI Key、生產資料庫或學生備份進入 Actions；資料庫及提供方使用隔離 fixture。無付費鏡像或新部署環境。
- CodeQL SARIF 中高／嚴重（security-severity ≥7）及 error 級未接受抑制的結果阻擋發布；中等 warning 留在 GitHub Security 供後續處理。解析失敗也阻擋，不能把掃描執行成功當成沒有漏洞。
- `.githooks` 在提交及推送前阻擋常見秘密及被強制加入的私有檔案；CI 另掃歷史。日誌只報檔案位置、規則，不打印匹配值。這是格式檢查，不保證涵蓋所有第三方格式或編碼。Git 忽略規則與 Docker context 排除保留。
- Render 目標為 `After CI Checks Pass`，Free／Starter、原資料庫與費用控制保留。只修改驗證文件可用 `[skip render]`，站內指南改動仍要部署。

## 驗證狀態

本地新增四項安全檢查測試、Git 歷史掃描、workflow 結構／Action commit 核對、正式構建及官方 Render Blueprint 校驗通過。本倉庫已設定 `.githooks`，實際提交與推送時均成功執行檢查；未更改全局 Git 或設定強制 PR。

- 首次業務／CI 提交 `795ec5e50b796adb23b95dd3f1779e9f2049c658` 的 [GitHub 執行 41408314947](https://github.com/David-Liv/Web-Education-/actions/runs/41408314947) 於 2026-11-02 15:46:30 HKT 全部成功，耗時 1m21s。五項工作為 Secret guard、Tests and production build、Isolated PostgreSQL、CodeQL、Release readiness；包括原有 69 項前端、53 項後端、20 項 PostgreSQL 和新增 4 項安全檢查測試。
- Render 實際設定為 `autoDeployTrigger: checksPass`。檢查完成後於 15:46:32 HKT 自動觸發 `new_commit` 部署 `dep-dbk3vm15efls73eke4h0`，15:47:27 HKT 完成並回報 `live`。未呼叫手動部署補救，也未增加新的環境或付費資源；服務仍為 Free／Starter。
- 首次執行的 pnpm v4 Action 出現 Node 20 棄用警告，已換成官方 Node 24 pnpm v5 Action 並固定 commit。CI 配置提交 `bd5ee21673f694c74f5d532afc0c184d0d95314c` 的 [第二次執行 41408954679](https://github.com/David-Liv/Web-Education-/actions/runs/41408954679) 全部成功，耗時 1m42s，頁面無先前的棄用警告。該提交只有 CI 配置改動，以 `[skip render]` 避免重建網站；線上業務仍是 `795ec5e`。
- 公開 HTTPS 重新檢查 `/billing`，既有帳戶顯示 Free 500、Lite 2 credit、Plus／Pro 方案和模擬帳單；英文 `/help` 已呈現新的自動檢查及發布說明。未呼叫真實 AI、修改學生套餐或產生模擬付款。截圖在忽略的 `.data/reviews/ci-passed-2026-11-02.png` 和 `.data/reviews/ci-live-billing-2026-11-02.png`。
- 真實 API Key、生產資料庫與備份未進 Git、Actions 或 artifact。兩份學生指南已隨首個業務提交同步並核對；此後只有 CI 運行時及驗證記錄改動，無學生功能差異。後續純驗證回執使用 `[skip ci] [skip render]`，不再重複構建。
