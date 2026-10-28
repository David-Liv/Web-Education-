# 把學序上線並分享給學生

更新：2026-10-28。已建立Git倉庫並推送至[David-Liv/Web-Education-](https://github.com/David-Liv/Web-Education-)，本機Docker鏡像已構建並啟動驗證。尚未建立或支付雲服務、取得公開網站地址；本機成功不等同Render已上線。

## 目前已具備甚麼

真實試用版已有登入、登出及三種角色：學生、內容復核者、開發者。開發者可在「內容與開發設定 → 邀請帳戶」建立不同使用者；學生目標、作答、聊天、錯題與日程由服務端按帳戶保存，附件也有擁有者檢查。

目前沒有公開註冊或忘記密碼流程。建立帳戶後，由維護者把網站地址與個別登入資料交給指定學生；「邀請」不會自動寄出郵件。學生在各自設備登入，同一個帳戶可以取得自己的服務端記錄。若在一部電腦測試兩個帳戶，使用兩個獨立瀏覽器或隔離瀏覽器設定檔，避免共用同一登入Cookie。

`start-local.cmd`／一般示範版主要保存本機瀏覽器資料，不能用來驗證多帳戶。`start-pilot.cmd`／`pnpm dev:pilot`才啟動真實後端。當前`127.0.0.1`地址只指向瀏覽者自己的電腦，直接發給同學無法連到你的服務。

## 建議的第一條上線路徑

用**單個Render Docker Web Service＋Persistent Disk**托管現有應用。React正式產物與Node API由同一服務提供，保留目前SQLite實作，先做邀請制小規模試用。

這是根據現有Node 24、`node:sqlite`及本機資料檔架構作出的工程建議。Render官方支援按倉庫Dockerfile構建，Web Service提供公開網址；Persistent Disk需要付費服務，只有掛載目錄內的改動會跨重啟與部署保留。方案與金額以下單時平台所示為準，本文沒有替使用者選購。

- [Docker部署](https://render.com/docs/docker)
- [Web Service與公開地址](https://render.com/docs/web-services)
- [持久磁盤及限制](https://render.com/docs/disks)

現有應用需要Node進程及可寫持久磁盤；單純把`dist/`上傳靜態空間只能展示前端。其他平台也可部署，但必須提供等效後端運行、HTTPS與持久儲存。Sites目前的服務端使用Cloudflare Workers及D1／R2；若使用它托管整套應用，需要改造現有Node／SQLite後端，不能把現有Dockerfile直接當Worker部署。

## 上線步驟

1. **準備乾淨的試用資料。** 本機以`start-pilot.cmd`啟動，建立自己的開發者帳戶，再按需要建立學生和復核者。使用真正的獨立帳戶，不使用自動化檢查庫或虛構已通過復核的內容。
2. **產生一致備份。** 使用Node 24.12以上，在項目根目錄執行`pnpm backup:pilot`，取得新的備份目錄。部署需要其中的`pilot.sqlite`和`secret.key`；兩者一起保管，不能把密鑰放進Git倉庫。需要可用的正式測驗時，先完成相應內容復核與發布。
3. **準備代碼倉庫。** 目前已連接並推送至`David-Liv/Web-Education-`的`main`。此倉庫是公開的；忽略規則已排除`.data`、`.env.*`、SQLite、密鑰、`node_modules`、`.agents`及下載的第三方`skills`。後續提交仍需檢查沒有真實憑證或學生資料；資料備份另行傳到私有磁盤。
4. **建立Render Web Service。** 連接該倉庫，選Docker及根目錄`Dockerfile`；讓容器使用現有CMD。選擇可附加持久磁盤的服務，掛載點設`/app/.data`，先維持單實例。確認掛載目錄可由容器的`node`使用者寫入。
5. **設定環境。** 使用下面的設定。Render會自動提供`RENDER_EXTERNAL_URL`，服務以它作預設公開來源；如用自訂域名，以`HOKSE_ORIGIN`指定實際HTTPS來源，不加路徑或結尾斜線。保持`HOKSE_ALLOW_SETUP=false`，不在公開網站開放首次管理員設定。
6. **私下初始化或導入帳戶。** 初次服務會有空資料庫，不能直接從公網建立第一個管理員。若不需要舊記錄，可在Render服務的Shell／SSH執行`node server/bootstrap-admin.ts`，按提示輸入帳戶名稱、顯示名字及兩次密碼；密碼輸入不顯示，僅空庫可建立首位開發者。若要保留本機帳戶，按SSH／SCP說明把步驟2的兩個檔案傳到磁盤內全新目錄，例如`/app/.data/live/`；不要覆寫正在使用的資料庫。再把`HOKSE_DATABASE`改為`/app/.data/live/pilot.sqlite`並重啟。保留原備份，不公開下載連結。
7. **實際驗證後分享。** 用自己的開發者帳戶登入，建立兩個學生帳戶；分別填不同目標和作答，確認互相看不到記錄。重啟／重新部署後，再確認帳戶、記錄、附件與模型設定仍在。完成後分享公開網站地址，給學生各自的登入資料。

### 服務環境

```dotenv
HOST=0.0.0.0
PORT=3001
HOKSE_STATIC_DIR=/app/dist-pilot
HOKSE_DATABASE=/app/.data/pilot.sqlite
HOKSE_ALLOW_SETUP=false
HOKSE_SECURE_COOKIE=true
# 使用Render自帶網址時不用手填；自訂域名時才設：
# HOKSE_ORIGIN=https://你的實際域名
```

Dockerfile已帶有部分預設值。Render可配置`PORT`；服務會讀取該變數，設定與實際監聽埠需一致。平台在容器前處理HTTPS，對外使用HTTPS來源及Secure Cookie。

### Render創建頁面逐項選擇

倉庫亦提供`render.yaml` Blueprint，已填Docker、新加坡、單實例、US$7/月對應規格、1 GB持久盤、健康檢查及環境變數。可在Render的Blueprint建立流程選此倉庫，先審閱資源與總價再套用。若繼續使用當前手動創建頁，照下表填即可；兩種入口只用一種，不要重複建立服務。此檔是準備好的部署方案，未自動產生付費資源。

| 字段 | 設定 |
|---|---|
| Source / Branch | `David-Liv/Web-Education-` / `main` |
| Language | **Docker** |
| Region | **Singapore** |
| Root Directory | 留空 |
| Dockerfile Path | `./Dockerfile` |
| Build / Start / Docker Command | 留空，使用Dockerfile |
| Compute | 首輪小規模試用可從頁面所列`0.5c-512mb`（US$7/月）開始；未驗證大量併發容量 |
| Persistent Disk | 先1 GB，Mount Path `/app/.data`，磁盤另計費 |
| Health Check Path | `/api/v1/auth/status`；本項目沒有`/healthz`接口 |
| Pre-Deploy Command | 留空；持久盤不可在此階段使用 |
| Auto-Deploy | On Commit |
| Secret Files / Build Filters | 留空 |

免費方案不支援持久磁盤，重啟／重新部署可能丟失SQLite帳戶與學習記錄，不能用作正式學生數據保存。費用與方案以你按Deploy前的平台總價為準；本輪沒有替你確認購買。工作區使用目前唯一可用的`My Workspace`，不要額外創建一個相同服務。

`Dockerfile`構建的是`dist-pilot`真實模式，學生API使用同源`/api/v1`。不要改成一般`pnpm build`的示範產物，也不要在`VITE_`前端變數填提供方密鑰。模型服務在雲端開發者工作台配置並實際測試；本機能調用不代表雲端網絡及權限已通過。

Render持久磁盤只在運行時可用，不能用構建階段把帳密或學生庫烘焙到鏡像。資料導入與切換需由可存取該私有磁盤的維護者執行。若平台未開通相應私有存取，先落實存取方式，不啟用公網首次設定作替代。

## 備份、更新與擴大使用

日常備份使用服務實際的`HOKSE_DATABASE`路徑，生成SQLite一致快照並連同同目錄`secret.key`保存；另下載到受控的獨立位置。存在同一塊雲盤的備份不能防止整塊磁盤丟失。恢復時先寫到新目錄，驗證後再切換資料庫路徑，避免覆寫在線資料。

更新代碼時重新構建及部署，保留持久磁盤。學生資料不在鏡像裡，不能因為換鏡像就重新建立空庫。每次變更功能、資料範圍或操作方式，同步修改[學生使用指南](user-guide.md)。

現有SQLite＋單服務設計先按邀請制試用使用；沒有大規模同時在線的負載驗證。Render磁盤只能給單個服務實例使用，不能直接增加多個副本而假設各副本共用同一SQLite。擴大前評估資料庫遷移、檔案儲存、模型請求併發與錯誤監測。

如果目標是「任何人取得網址都能自行加入」，還要實作公開註冊、帳戶驗證／重設密碼、每人模型調用頻率與用量記錄、服務負載驗證等流程。這些是後續範圍，沒有在本輪宣布已可用，也不引入固定HK$100測試上限。

詳細內容復核、模型與本機備份操作見[試用操作說明](pilot-runbook.md)。本文件補充分享與部署方式，並不代表遠程部署已完成。

## 在本機Docker Desktop啟動

啟動Docker Desktop後，在項目目錄執行：

```powershell
docker compose up -d --build
docker compose exec app node server/bootstrap-admin.ts
```

第一次按提示建立開發者；已有帳戶時命令會拒絕重新初始化。再開啟`http://127.0.0.1:3001`登入，建立學生與復核者。此Compose使用獨立命名卷，不會自動導入原本`.data/pilot.sqlite`，也不需要學生安裝Docker。若3001已被原開發服務佔用，先停止自己原先的服務或在Compose調整本機映射。

`docker compose stop`停止服務，`docker compose start`繼續。記錄存在命名卷中；不要使用`docker compose down -v`，該選項會刪除資料卷。一般更新使用`docker compose up -d --build`，保留同一卷。
