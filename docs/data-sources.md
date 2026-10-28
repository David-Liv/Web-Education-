# 資料來源及年份

2026-10-28補充：已建立 [數學 By Topic 外部索引](research/maths-index-extraction.md)，585道歷屆卷二題與23道出版社練習元資料、73個分類文件連結。來源難度、出版者目標與官方DSE等級分開，未知保持空白；原創評核題庫不受此次索引更新影響。

核對日期：2026-10-27。目標考試年 2028，不代表當天已是 2028。示範人物時鐘固定在 2028-02-14，可於設定更改。

## 考期與課程

- [HKEAA HKDSE 科目資料](https://www.hkeaa.edu.hk/en/hkdse/assessment/subject_information/)：科目及評核資料入口。
- [HKEAA 考試時間表入口](https://www.hkeaa.edu.hk/en/hkdse/assessment/exam_timetable/)：本專案未取得完整 2028 官方考試時間表。四個四月事件一律為 `sourceStatus: demo`，不可稱作官方考期。
- [教育局數學課程](https://www.edb.gov.hk/en/curriculum-development/kla/ma/curr/index2.html)：必修／M1／M2 結構參考。
- 中英數化的分卷、評核及課程來源附在 `src/data/catalog.ts` 各項資料內。中文按現行兩卷架構展示，指定文言經典以 12 組篇章呈現；古詩組另分單篇，不將其誤算為新的指定組數。
- 甲類 23 科；丙類保留不同語言評核及適用年資訊；乙類是應用學習的參考目錄，開課批次、名稱及適用 2028 的狀態仍須逐年核對。未開放的科目不提供假的完整學習內容。

知識圖譜是產品用教學節點，並非官方逐字考綱。代表性教學和題目為本專案原創，不複製歷屆試卷。數學及化學的例題集中於可展示核心流程的單元；未完成節點顯示「內容籌備中」。

後續真實內容的候選來源另見 [DSE 數學既有分類與難度標籤調研](research/dse-maths-tagging-sources.md)。本次找到出版社目標程度、歷屆分類題入口及課題統計，已記錄來源、適用層級與訪問限制；尚未導入現有原創示範題庫。

## 升學資料

主要資料來源為用戶指定的 [BigExam JUPAS 課程目錄](https://dse.bigexam.hk/en/pathway/progs?p=1&order=cmpRatio&asc=0) 及 [iPASS 入口](https://dse.bigexam.hk/en/pathway/ipass)。本次閱讀九所大學各三項課程詳情，共 27 項；另收錄四個副學位例子。這是已核對快照，不是全港課程排行或完整課程庫。

BigExam 詳情所示計分學年多為 **2026/27**，指數統計多為 **2025/26**，頁面當時另有 2027 JUPAS 標示。資料各自保存 `formulaYear`、`statisticsYear` 和 `checkedAt`，不統稱為「2028 最新收分」。

- `scoreIndex` 是 BigExam 錄取指數，不當作原始加權總分或 DSE 等級。
- `median`、`mean`、`lowerQuartile` 和 `lowerQuartileIndex` 分開保存。未取得的數值為 `null`。
- PolyU 的部分頁面只列「較高／最高加權」，沒有倍率；CityU 部分課程有選修位置規則。這些課程 `formula: null`，保留來源文字，不產生假精確分數。
- 其餘 BigExam 權重以可展示的簡化結構保存；因完整換算表、加分及特定條件未全部核實，標示 `verified: false`。最低要求檢查只是已收錄條件，不能判斷正式錄取資格。
- JS6755 HKU BBA 是額外的完整計分示例，依 [HKU Business School JUPAS FAQ](https://ug.hkubs.hku.hk/admission/faq/jupas-applicants) 已公布的 **2027** Best 5 規則：英文、數學必計且各 ×1.5；增強換算 5/5*/5** 為 5.5/7/8.5。示範人物計分 22 → 30 是實際 what-if 計算，不是錄取概率。2028 規則尚未核實。
- [PolyU HKCC 2026/27 admission score](https://www.hkcc-polyu.edu.hk/en/admission/key-information-for-application/admission-score-for-2026-27-cohort/index.html)：工程副學士 mean 16.28、社工高級文憑 mean 16.31、所收錄 lower quartile 15；來源是平均分而非中位數。以中英及最佳其餘三科、7 分制展示。
- [HKU SPACE CC 入學要求](https://www2.hkuspace.hku.hk/cc/admission/general-entrance-requirements/)：保存一般門檻及工程／資訊科技的數學要求，未取得課程原始 median，保留空值。

策略排序採已收錄最低要求、假設升一級的加權增益及近期題目證據。沒有模擬錄取概率，亦未實作全局最優、學習成本估計或真實成績預測模型。

## 媒體和資源

`public/audio/listening-demo.wav` 的短文由本專案原創，使用本機 Windows SAPI / Microsoft Zira 合成。可透過 `scripts/generate-demo-audio.ps1` 重建，不依賴付費語音服務。播放器及 WAV 格式已檢查；尚未完成真人聆聽評審，不能聲稱為標準 DSE 聽力錄音。

資源卡指向官方／教學網站並附供應者、語言及費用分類。外部內容及費用可能改變，卡片不能作為其即時價格或品質保證。合作展示卡的品牌與合作關係為虛構並在 UI 標記；未收款、未追蹤跨站學生行為。
