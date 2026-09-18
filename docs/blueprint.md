# 個人訓練紀錄：Android 第一版工作藍圖

日期：2026-09-15。狀態：使用者已選定架構並授權開發；實作與驗證狀態見 `verification.md`。

## 目標與範圍

Android Chrome 上依器材記錄、修改訓練並檢視趨勢；離線可保存，連線且 Google 授權有效時同步至私人 Google Sheet。換機可從同一份 Sheet 還原。GitHub Pages 僅部署靜態程式，不發布私人紀錄。

第一版包含訓練與 InBody 手動輸入、六段概覽、時間範圍、動作展開、備份與還原、明確的同步與衝突狀態。沒有現存真實紀錄：初始為空白，範例僅放測試。

第一版不包含照片 OCR、自然語言 AI parser、AI 教練、醫療判讀、月報 PNG、自動背景常駐同步。這些仍屬原提案後續階段，不能以假功能代替。使用手機鍵盤語音輸入備註不需自建語音服務。

## 架構與不變條件

- HTML、CSS、原生 JavaScript ES modules、SVG；部署不需 npm、Node 或建置伺服器。
- Android Chrome 為主要目標；PWA manifest、service worker 提供安裝與離線殼層。
- Google Sheet 是已同步資料的長期主檔；IndexedDB 是本機副本與待同步版本佇列。
- OAuth 使用 Google Identity Services 的 `drive.file`，權杖只留記憶體；不嵌入 client secret、服務帳號或個人存取權杖。
- 每個本機資料集固定綁定一份 Sheet，已有紀錄時不得靜默切換到另一份，避免跨帳號混寫。
- 儲存成功以 IndexedDB transaction commit 為準。只有讀回遠端版本後才消除待同步狀態。
- 未知、缺漏、不確定資料不補零、不推測；不能把沒有疼痛記錄解釋成無痛。
- 日誌只新增版本，修改和刪除也新增版本；不使用「最後同步者勝出」。

## 模組邊界

| 模組 | 擁有的責任 | 不得依賴 |
|---|---|---|
| `src/domain/catalog.js` | 動作、功能類型、量測欄位定義 | DOM、Google、儲存 |
| `src/domain/records.js` | 日期、各組數值、InBody、列格式驗證 | DOM、Google、儲存 |
| `src/domain/journal.js` | 版本合併、去重、衝突與目前紀錄投影 | DOM、網路、儲存 |
| `src/domain/analytics.js` | 可比條件、趨勢、覆蓋、旗標 | DOM、Google、儲存 |
| `src/storage/repository.js` | 原子本機狀態讀寫 | UI、Google、分析 |
| `src/google/auth.js` | 載入 GIS、授權、到期、登出 | 紀錄模型、UI |
| `src/google/sheets.js` | Google REST、試算表初始化、查找、讀取與附加 | UI、IndexedDB、趨勢 |
| `src/sync/engine.js` | 拉取、合併、推送、讀回確認、保留未送修改 | DOM、授權視窗 |
| `src/app/service.js` | 記錄命令、備份、資料集綁定 | DOM、Google REST 細節 |
| `src/ui/*` | 表單、概覽、設定與衝突呈現 | 直接呼叫 REST 或 IndexedDB |
| `src/main.js` | 組裝模組、事件與狀態通知 | 不放分析或同步演算法 |

以直接 ES module imports 和小型依賴注入維持界線，不建立通用框架。自動檢查 domain/storage/sync 的依賴方向；核心行為測試不啟動網頁也能執行。

## 資料保存與同步契約

Sheet 具有 `_meta`、`training_log`、`inbody`、`exercise_catalog` 四個工作表。兩個日誌表的每列代表一個不可變版本，並保留可讀日期、動作與 JSON 內容。網頁顯示版本投影後的一筆紀錄，不把修訂列計為多次訓練。欄位與規則见 `../schema.md`。

每版本有全域 `id`、穩定 `recordId`、`parents[]`、`kind`、`deleted`、`data`、`createdAt`。正常修改指向原版本；冲突處理指向使用者看到的所有衝突版本。兩台裝置同時修改同一版本產生兩個末端版本；網頁顯示衝突，排除該筆分析直到使用者選擇。新的未知衝突版本稍後到達，仍會再次顯示衝突。

同步步驟：

1. 用瀏覽器 Web Lock 排除同一網站多分頁的同步競爭。
2. 驗證 `_meta`、表頭、所有版本與父子關係。格式損壞時停止，不覆寫遠端。
3. 拉取兩個日誌表並與本機版本合併，找出尚未存在遠端的 pending IDs。
4. 用 RAW 值附加版本。HTTP 寫入結果不明時不自行重送；下次先拉取再決定。
5. 重新讀取遠端，確認版本內容一致；在本機 transaction 合併並只清除已確認 IDs。同步期間新增的本機紀錄保留。
6. 身分授權到期提示重新連線。429/5xx/斷網顯示可重試狀態；不無限背景重試。

Sheets 不提供跨裝置 compare-and-swap。附加日誌可保留並行修改與偵測衝突，但不宣稱 exactly-once 寫入：相同版本可能物理上重複列，讀取時依 ID 與內容去重。不同內容使用同 ID 屬損壞，停止同步。

## 手機使用流程

- 首頁：今日日期、同步狀態、常用器材、其他器材、InBody、資料設定。器材卡由既有紀錄產生，不另維護第二份清單。
- 訓練表單：動作、機台識別、日期、lb/kg、動態組數（每組重量或輔助量與次數）、疼痛／動作狀況／備註。
- 點器材卡帶入同動作、同機台、單位、各組重量與組數並改成今日；次數保持空白，必須填入本次實際結果。新增與修改清楚區別。刪除需確認且以墓碑版本保留歷史。
- 記錄清單可修改；衝突顯示完整候選內容，使用者選擇後保存新版本。
- 六段概覽：NOW、MOVEMENT LANDSCAPE、PERFORMANCE STORY、BODY COMPOSITION、TRAINING / REHAB CONTEXT、NEXT。空白資料顯示尚無資料，不生成分數。
- 初次設定 Google Client ID 後，點連線、建立專用 Sheet；新手機使用同 Client ID 查找並載入舊 Sheet。
- 備份 JSON 不含權杖；匯入採取驗證後合併，同 ID 異內容拒絕，不取代本機資料。

## 可量化驗收

1. Android 尺寸表單可完成新增、重載、修改、沿用與刪除；文字放大仍可操作。
2. 第一次線上快取完成後，離線重載可開啟與記錄。首次從未載入網站時不能離線開啟。
3. 遠端失敗不消除 pending；遠端成功但回應遺失，重試不使網頁出現重複紀錄。
4. 並行修改產生可見衝突；使用者解決後才重新納入分析。
5. 匯入損壞備份不改變既存資料；有效備份可還原；換機從 Google 重新載入須實際 OAuth 驗收。
6. 輔助量下降但次數也下降不判進步；不同機台／單位不直接比較；疼痛／代償有獨立旗標。
7. 安裝新版本不刪除 IndexedDB；網站資產不含私人資料或權杖。

## 外部驗證與後續階段

需要使用者的 GitHub repo／部署權限、Google Cloud 專案和 OAuth client ID，以及 Android 真機。未提供前完成程式、可重現測試與設定文件，但不得宣稱已部署或真實 Google 同步完成。

後續依序：真機與真實帳號驗收 → 匯入使用者歷史資料 → AI／照片擷取確認流程 → 月報匯出。新增功能延伸其所屬模組，避免在 `main.js` 堆疊邏輯。
