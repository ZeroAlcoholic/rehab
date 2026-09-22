# 練習誌

Android 優先的個人訓練與 InBody 紀錄。純靜態網頁，資料先存手機，透過 Google 授權同步至自己的私人試算表。不需自行架後端；部署不需要 npm 或建置工具。

## 目前可使用

- 首頁依最近使用排序顯示 6 項器材／動作，其餘收合；可點選部位篩選，人體圖也可直接帶入部位，文字搜尋為備用。篩選涵蓋全部已記錄器材，不受概覽日期範圍限制。
- 點器材或歷史「再練一次」共用記錄表單：帶入重量，每組顯示參考日期對應的前次數值，本次次數留白，可逐組點「同前次」。日期與器材設定預設收合；重量／次數使用原生數字輸入提示。有變更未儲存時，關閉前提示捨棄；不提供跨重整草稿恢復。
- 當日紀錄可直接核對、修改，預設今天，可點選其他日期，不受概覽期間影響。顯示已記錄組數及主要／協同部位，沿用人體圖的動作對應；部位組數不可相加，也不代表實際刺激或訓練足夠。暖身／排除、待核對與版本衝突會明示。
- 表單顯示已填組數，儲存期間鎖定輸入並防止重複送出；失敗後保留輸入並恢復原本操作狀態。
- InBody 手動輸入、選填台灣時間／機型／量測條件；常用四欄優先，其餘報告欄位展開填寫。支援不定期間隔，保留完整歷史、前次差值與間隔天數。
- InBody 不受訓練篩選範圍影響；逐欄待核對與排除值仍保留，但不計入變化。沒有的項目留白，不沿用前次數值。
- 六段概覽、日期範圍、動作明細、逐組訓練量與 InBody 歷史。
- 紀錄庫與疼痛／記錄提醒預設收合；紀錄庫內每筆再展開原始數值與備註。同步衝突仍直接顯示。
- 15 區正面／背面肌群圖：單次／單筆紀錄上色、主要與協同組數、依器材比較進步、下一步候選；[呈現規則與模組](docs/body-map.md)。
- IndexedDB 保存、離線殼層、JSON 備份匯出與驗證後合併還原。
- Google 授權、建立／載入私人 Sheet、同步讀回確認、並行修改衝突處理。
- Android 主畫面安裝設定；真機安裝仍須實際驗收。

尚未包含照片 OCR、AI 文字解析／教練與月報 PNG。初次開啟沒有虛構的健康紀錄。

## 開始使用

先看 [手機上手指南](docs/start.html)，再依 [設定與部署](docs/setup.md) 設定 GitHub Pages 與 Google Cloud。Client ID 可以公開；Google Client secret、權杖與健康資料不可放到 GitHub。

本機開發預覽（Windows PowerShell）：

```powershell
& 'C:\Programs\miniforge3\envs\deve\python.exe' -m http.server 8765 --bind 127.0.0.1
```

再開啟 `http://127.0.0.1:8765/`。請透過 HTTP／HTTPS 開啟，不要直接雙擊 HTML。手機正式使用 HTTPS Pages 網址；手機上的 localhost 並不是電腦。

儲存會清楚區分「已存手機」與「已同步」。關閉網頁後不承諾背景同步；Google 權杖只留記憶體，重開網頁後需重新連線。未同步的紀錄仍須保留原手機網站資料或匯出備份。

## 工作藍圖與模組

- [工作藍圖](docs/blueprint.md)：目標、架構、資料生命週期、驗收與後續階段。
- [執行計畫](docs/superpowers/plans/2026-09-15-android-fitness.md)：各模組交付與測試順序。
- [資料與分析規則](schema.md)：欄位、版本、比較條件與缺漏處理。
- [資料來源、核對與分析契約](schema.md)：保留原文、掛片語意、排除暖身及相容擴充。
- [驗證紀錄](docs/verification.md)：已測、未測與上線前必要步驟。
- [動作計畫與身體狀況](docs/rehab-model.md)：獨立資料型別、未知狀態、人體圖調整範圍與 Sheet 相容性。

```text
src/domain     純資料驗證、版本投影、固定分析規則
src/storage    IndexedDB 原子讀寫
src/google     Google 授權與 REST 存取
src/sync       同步協調、讀回確認、待送版本順序
src/app        記錄命令、備份、資料集綁定
src/ui         表單與資料呈現；不直接碰儲存或網路
src/main.js    組裝與事件連接
```

新增分析規則改 `domain/analytics.js`；新增畫面改對應 `ui` 模組；更換遠端服務實作相同 `read/append` 契約，不把網路邏輯放進表單。`scripts/check-boundaries.mjs` 與 CI 檢查依賴方向。

## 開發驗證

Node 24 僅用於開發／CI；使用者的手機不需要它。

```powershell
node --test tests/*.test.mjs
node scripts/check-boundaries.mjs
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/gym_entry_check.py
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/training_day_check.py
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/visual_training_check.py
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/submit_recovery_check.py
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/browser_check.py
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/settings_auth_check.py
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/body_map_check.py
& 'C:\Programs\miniforge3\envs\deve\python.exe' -X utf8 tests/atlas_ux_check.py
```

瀏覽器測試需指定 Python 環境的 Playwright 與已安裝 Google Chrome。它會啟動僅本機可達的臨時 HTTP server、獨立瀏覽器設定檔，結束後關閉。`artifacts/` 是測試產物，不發布；內含測試資料，正式備份請另存私人位置。

網站更新時須更新 `sw.js` 的 `VERSION`，新增入口模組也須加入其快取清單。新版本等待舊分頁關閉後接手，避免舊畫面與新程式混用。IndexedDB 不隨殼層快取更新而刪除。


私人起始資料保存在排除 Git 與部署的 private/；不可將該資料夾放進公開 Pages。私人入口會合併到目前瀏覽器並開啟全部日期範圍。一般使用仍從資料設定匯入／匯出 JSON。不同裝置需各自匯入私人備份或透過已設定的私人 Sheet 載入。

外觀色票集中在 `src/ui/theme.css`；版面在 `styles.css` 與 `src/ui/body-map.css`。圖表沿用同一色票，修改外觀不需動資料與分析模組。圖示可用指定 Python 執行 `scripts/generate_icons.py` 重新產生。
