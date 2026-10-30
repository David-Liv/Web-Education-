# 免費部署的收費條件與控制

核對日期：2026-10-30。目標是小規模邀請制試用，固定配置為 Render Hobby＋一個 Free Web Service＋Supabase Free。沒有付費磁盤、Render 資料庫、背景工作者、Cron、預覽環境或自訂域名。價格與額度以平台帳單頁為準。

## 甚麼情況會付款

| 項目 | 免費範圍／收費觸發 | 本項目的處理 |
|---|---|---|
| 工作區與伺服器 | Hobby 和 Free 伺服器固定月費為零；主動升級工作區或伺服器會收費 | 只用 Hobby／Free，不自動升級 |
| Render 流量 | 新 Hobby 工作區每月共用 5 GB；綁卡後超額公開網絡流量 US$0.15／GB，包括送到瀏覽器、外部資料庫及 API 的流量 | gzip、快取、ETag／304、邀請制及附件上限；不聲稱已硬性封頂 |
| Render 構建 | Hobby 每月共用 500 Starter 構建分鐘；超額補充 US$5／1,000 分鐘，除非達到支出上限 | 關閉自動部署，維護者將 Build Pipeline spend limit 設 US$0／月 |
| 其他 Render 資源 | 付費磁盤、資料庫、背景服務、擴容及付費預覽等各自計費 | 本次均不建立 |
| 自訂域名 | Hobby 含兩個，超過部分 US$0.25／域名／月；另購域名還有註冊商費用 | 使用免費 onrender.com 地址 |
| Supabase | Free 超額會通知及限制服務；保持 Free 不收用量費，主動升級組織或買附加項目會改變費用 | 不升級、不買 IPv4，使用 Session pooler 及本機私人備份 |
| AI API | 與托管分開，依提供方、模型及用量計費 | 預設未配置真實提供方；開發者配置後才可調用 |
| 綁卡驗證 | Render 可能做 US$1 卡片安全檢查，完成後退回 | 與購買付費伺服器不同，查看實際帳單 |

Free 每月 750 運行小時耗盡會暫停，不會自動升級成付費伺服器。同工作區其他服務也共用流量及構建額度。

來源：[Render 價格](https://render.com/pricing)、[流量](https://render.com/docs/outbound-bandwidth)、[構建上限](https://render.com/docs/build-pipeline)、[Free 限制](https://render.com/docs/free)、[Supabase 費用控制](https://supabase.com/docs/guides/platform/cost-control)。

## 減費措施與限制

- `render.yaml` 固定 `plan: free`、`autoDeployTrigger: off`，不定義磁盤或其他付費服務；CLI 同樣指定 Free 並關閉自動部署。
- 文字資源 gzip；Vite 指紋資源一年 immutable 快取，HTML 重新驗證，ETag 相符回傳 304。私人 API 保持 `no-store`。
- 保留邀請制；附件單檔 20 MiB、雲端全站 100 MiB，不托管整卷 PDF、大影片或整個第三方題庫。
- 不買 Supabase IPv4 或自動備份；備份命令只產生本機私有檔案。

在 Render Workspace Settings → Build Pipeline → Set spend limit 設 US$0／月，維持 Starter pipeline。這只停止新的超額構建，不會停止網站流量。目前連接工具／CLI 不支援修改這項工作區設定，未取得確認前不聲稱已完成。

本次使用者已在正確帳號的 My Workspace 貼出設定：Starter、Includes 500 free minutes、`$0 monthly spend limit`。據此確認構建上限已設零；不是透過連接工具讀取的結果。頁面的 `$5 / 1,000 min` 為補充分鐘標價，不代表已購買；零支出上限會在免費額度耗盡後阻止繼續購買。

官方資料沒有提供同等的流量硬性支出上限，不能保證綁卡後任何用量都絕不扣款。通知不是停止計費的開關。在 [Billing](https://dashboard.render.com/billing) 查看共用額度；接近 5 GB 時先暫停分享或停止服務。

沒有建立自動監控或定期喚醒；不要持續 ping 避免休眠。先邀請 3–5 位學生，按實際用量再擴大。
