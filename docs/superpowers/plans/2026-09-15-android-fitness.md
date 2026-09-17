# Android Fitness Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development for bounded independent tasks. Keep ownership per module and inspect final integration.

**Goal:** 完成 Android 優先的靜態健身紀錄程式與私人 Sheet 同步路徑，誠實區分本機、模擬 HTTP 與真實帳號證據。

**Architecture:** 純函式 domain；IndexedDB repository；Google REST adapter；同步 engine；app service 與分離 UI。追加版本日誌保留並行修改，依版本 ID 去重與偵測衝突。

**Tech Stack:** 原生 ES modules、HTML/CSS/SVG、IndexedDB、Google GIS/Sheets/Drive、service worker。Node 內建 test runner 僅用於開發測試。Python 僅使用 `C:\Programs\miniforge3\envs\deve\python.exe`。

**Spec:** `../../blueprint.md` 和 `../../../schema.md`。

## Global Constraints

- Android Chrome 為主要目標；部署不需 npm、Node 或建置伺服器。
- 不建立後端，不發布真實健康資料；權杖只留記憶體。
- 空值不推測。修改保留版本，衝突不可靜默覆蓋。
- 各模組具清楚契約與獨立測試，domain 不依賴網路、DOM 或儲存。

## Task 1：資料契約、版本日誌與分析

Files: `schema.md`, `src/domain/{catalog,records,journal,analytics}.js`, `tests/{domain,journal}.test.mjs`。

Interfaces:
```js
validateRecord(kind, data); // throws invalid data, returns normalized data
mergeEvents(...groups); // dedup IDs; rejects corrupt duplicates/graphs
project(events); // {records: [{recordId,eventId,kind,data}], conflicts:[{recordId,versions}]}
makeEvent({kind,recordId,parents,data,deleted,id,createdAt});
compareSessions(previous, current); // {status,reason,flagged}
analyze(records, {from,to}); // six-section presentation data
```

- [x] 先寫案例：未知欄位、缺漏、各組調重、日期非法、同 ID 異內容、並行版本、解決衝突、墓碑、辅助量与次數同降、機台不可比。
- [x] `node --test tests/domain.test.mjs tests/journal.test.mjs`，確認缺少功能時失敗。
- [x] 實作純函式並通過上述測試，覆核固定門檻與測試手算結果。

## Task 2：本機命令與可還原資料

Files: `src/storage/repository.js`, `src/app/service.js`, `tests/service.test.mjs`, `tests/browser_check.py`。

Interfaces:
```js
repository.read(); // Promise<State>
repository.update(state => nextState); // transaction commit -> Promise<State>
service.save(kind, data, {recordId,parents});
service.remove(recordId, parents);
service.exportBackup(); service.importBackup(text);
// State: {schemaVersion:1, events:[], pending:[], settings:{clientId:'',sheetId:''},lastSync:null}
```

- [x] 先寫儲存／修改／匯入測試：原始讀值不能修改儲存、非法輸入不增加版本、不同 Sheet 不可切換混寫、備份不含憑證、衝突不得由一般修改取代。
- [x] 執行失敗測試後實作 service；瀏覽器測試使用真正 IndexedDB 檢查重新載入後資料與並行 transaction。

## Task 3：Google adapter 與同步引擎

Files: `src/google/{auth,sheets}.js`, `src/sync/engine.js`, `tests/{sheets,sync}.test.mjs`。

Interfaces:
```js
auth.connect(clientId); auth.token(); auth.disconnect();
remote.create(); remote.list(); remote.read(sheetId); remote.append(sheetId, events);
sync.run(); // reads repository, pulls, appends pending absent remotely, rereads, acknowledges
```

- [x] 測試先行：真實 HTTP adapter 搭配受控 fetch 回應，驗證 RAW 與列編碼、401、429、損壞表頭、分頁與格式拒絕。
- [x] 同步案例覆蓋 response lost、同步途中本機新增、雙裝置 sibling、重新讀取失敗、外部刪除歷史、pending 不誤消除。
- [x] 依官方 REST 文件實作，`node --test tests/sheets.test.mjs tests/sync.test.mjs`。
- [x] 無帳號不得把受控 HTTP 測試稱為 Google 整合驗收。

## Task 4：Android 操作介面與離線殼層

Files: `index.html`, `styles.css`, `src/main.js`, `src/ui/{dom,training,inbody,dashboard,settings,history}.js`, `manifest.webmanifest`, `sw.js`, `icons/*`。

UI modules receive data plus callbacks, never direct repository or REST access. Form callbacks return Promises; dialog closes only on successful durable save.

- [x] 行為測試先描述新增／重載／編輯／沿用／刪除、InBody 空欄、衝突选择、備份匯入与離線路徑。
- [x] 實作手機優先介面、六段真實資料圖表、48px 主要控制、dialog focus、錯誤顯示與不丟草稿。
- [x] PWA 使用相對路徑支援 GitHub project Pages 子路徑；只快取自家殼層，不快取 Google API／OAuth。
- [x] 本機 HTTP 啟動後執行實際 Chromium 流程與離線重載；另記 Android 真機待驗證。

## Task 5：交付與驗證

Files: `README.md`, `docs/{setup,verification}.md`, `scripts/check-boundaries.mjs`, `.github/workflows/pages.yml`, `.gitignore`。

- [x] 依賴方向檢查、Node 行為測試、實際瀏覽器檢查、最後變更檢閱。
- [x] GitHub Actions 僅封裝 allowlist 靜態檔案；Google Client ID 可公開但 secret/token 不可入庫。
- [x] 記錄真實測試命令與結果、限制、帳號設定及 Android 驗收步骤。
- [x] 若尚無遠端與 OAuth 設定，以可部署程式交付並列為未完成的外部驗證，不宣稱全系統完成。
