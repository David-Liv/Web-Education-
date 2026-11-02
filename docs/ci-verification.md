# CI 與自動發布

日期：2026-11-02。用戶確認首批自動檢查、main 直接發布、不要求 PR，穩定版與測試版之後再分。套餐、credit、模擬帳單及使用日誌已於先前的 `7a18c84` 版本上線；此次接入持續檢查與發布。

## 範圍

- `HOKSE checks`：密鑰檢查、安全檢查測試、前端及服務端測試、正式構建與 OpenAPI 同步、臨時 PostgreSQL、JavaScript／TypeScript CodeQL，以及必須全部成功的 Release readiness。
- 只用標準 Ubuntu runner，Action 固定為官方倉庫核對過的 commit。無部署 token、AI Key、生產資料庫或學生備份進入 Actions；資料庫及提供方使用隔離 fixture。無付費鏡像或新部署環境。
- CodeQL SARIF 中高／嚴重（security-severity ≥7）及 error 級未接受抑制的結果阻擋發布；中等 warning 留在 GitHub Security 供後續處理。解析失敗也阻擋，不能把掃描執行成功當成沒有漏洞。
- `.githooks` 在提交及推送前阻擋常見秘密及被強制加入的私有檔案；CI 另掃歷史。日誌只報檔案位置、規則，不打印匹配值。這是格式檢查，不保證涵蓋所有第三方格式或編碼。Git 忽略規則與 Docker context 排除保留。
- Render 目標為 `After CI Checks Pass`，Free／Starter、原資料庫與費用控制保留。只修改驗證文件可用 `[skip render]`，站內指南改動仍要部署。

## 驗證狀態

本地新增四項安全檢查測試通過。GitHub Actions 首次執行及 Render 設定／新部署回執待完成後記錄；不提前聲稱線上檢查成功。
