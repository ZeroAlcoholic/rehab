# 資料契約 v1

純 JavaScript JSON 資料；未知欄位、未知紀錄類型與不合法數值一律拒絕。日期使用實際存在的 `YYYY-MM-DD`；版本建立時間使用 UTC `YYYY-MM-DDTHH:mm:ss.sssZ`。選填的實際記錄時間 `time` 是台灣 UTC+8 的 `HH:mm`。數值必須是有限 JSON number，不自動轉換字串、單位或空值。

## 訓練

`{date,exerciseId,machine,unit,sets:[{load,reps}],pain,technique,note}`。

- `exerciseId` 必須來自 `src/domain/catalog.js` 的 EXERCISES；`unit` 為 kg 或 lb。
- 每筆 1–100 組。`reps` 為 1–10000 正整數；`load` 是非負重量或輔助量。徒手動作只接受 null 重量。每組數值獨立保留。
- `machine` 可空白；負重與輔助動作缺機台識別時無法比較。字串前後空白會去除。
- `pain`：unknown、none、mild、significant；缺值為 unknown。
- `technique`：unknown、stable、corrected、compensation、failed；缺值為 unknown。
- `note` 可空白，最多 10000 字元；機台識別最多 200 字元。

## InBody

`{date,metrics:{欄位ID:數值或null},note}`；至少一項非空量測。缺漏欄位補 null，不補零。

欄位以 `INBODY_FIELDS` 為唯一來源：weight、skeletal_muscle_mass、body_fat_mass、body_fat_percentage、fat_free_mass、bmi、visceral_fat_level、segmental_left_arm、segmental_right_arm、segmental_left_leg、segmental_right_leg、segmental_trunk。體脂率為 0–100%；其他接受非負原始數值。BMI 單位 kg/m²、內臟脂肪為等級，其他 kg。部位量測保留輸入原始值，不推算不足或理想比例。

## 不可變版本日誌

`{schemaVersion:1,id,recordId,parents:[],kind,deleted,data,createdAt}`。

- `id` 全域唯一；`recordId` 識別穩定的一筆紀錄。ID 非空、無前後空白與控制字元、最多 200 字元。
- 新增無父版本；修改指向原末端版本；解決衝突指向看到的全部末端版本。
- `kind` 為 training 或 inbody。刪除 `deleted:true` 時 data 必須為 null；其餘 data 經 validateRecord 正規化。
- 父版本可在輸入清單任意位置，但完整合併圖不得缺父版本、有循環、重複父 ID、自指、跨 recordId 或跨 kind。
- 同 ID 的正規化語意內容相同時去重；鍵順序與 parents 順序不影響相等。不同內容視為損壞並拒絕。
- 每 recordId 一個末端：非墓碑納入 records；墓碑排除。多末端全部列於 conflicts，包含並行刪除版本；整筆暫不納入分析。晚到的並行版本會重新產生衝突。
- project 輸出 records 額外帶 createdAt，取同 recordId 所有無父版本的最早 createdAt；此為首次記錄時間，後續修改不改變它，不新增任何儲存欄位。
- records 依使用者填寫日期、選填 time、首次建立時間、recordId 排序；缺少 time 的紀錄排於該日已填時間前，僅為穩定顯示順序，不代表實際更早發生。字串依 UTF-16 序比較。project 與 analyze 共用 `compareRecordOrder`；版本合併回傳值不共用輸入的可變子物件。

## 分析

先按動作、機台與單位分組，再比較每組範圍內最新兩筆。人體圖與訓練進程共用 `training-streams.js`。同日使用上述排序規則；時間未知時不能藉此認定實際先後。直接傳入 analyze 的非投影資料若缺 createdAt，該排序欄視為空字串，最後仍以 ID 穩定排序。

同機台（負重／輔助必須非空）、單位、組數，且各次所有組皆同重量才可比較。每組次數逐一比較；負荷與次數增減方向不同為 mixed。輔助量下降視為負荷方向增加，但次數下降則為 mixed。任一次疼痛不是 none 或動作不是 stable 都設 flagged；這時數值上升也不給 improving。

`compareSessions` 回傳 `{status,reason,flagged}`；status 為 improving、stable、declining、insufficient、mixed。stable 僅指兩筆數值相同，不代表平台期。覆蓋 count 是紀錄數，不能解釋為肌力或訓練處方；身體組成只呈現原始數列，不提供醫療判讀。

`sessionPerformance(data)` 回傳 `{totalReps,volume,unit}`；totalReps 是各組次數加總。只有 load 動作計算逐組 load × reps 再加總的 volume，保留輸入 kg/lb，不換算單位；其顯示單位為 kg·次／lb·次。徒手與輔助動作 volume 為 null，不將輔助量當作實際負重，也不推測使用者體重。

`analyze(records,{from,to})` 回傳 range、trainingCount、inbodyCount、lastTrainingDate、coverage、exercises（含 sessions、streams 與 comparison）、bodyComposition（含 points）、context、next。context 分別計算疼痛、動作異常／修正、疼痛未知、動作未知，以及任一未知的紀錄數。

## Google Sheet 與備份

人體圖是衍生視圖，沒有新增儲存欄位。動作與區域對應、筆數／組數及旗標統計見 [人體圖契約](docs/body-map.md)；不將動作疼痛推斷為部位疼痛。

新建 Sheet 有 `_meta`、`training_log`、`inbody`、`exercise_catalog` 四頁；首次同步 rehab 版本時原子新增 `rehab_log` 並將遠端 metadata 升為 2。日誌每列是一個完整版本，歷史只附加、不覆寫。實體重複列允許讀取時按版本 ID 去重。

`_meta` 為兩欄 key/value，列依序是表頭 `[key,value]`、`[app,rehab-log]`、`[schemaVersion,1]`（全為字串）。`exercise_catalog` 表頭為 `id,name,pattern,metric`。

各日誌表固定欄序為 `id,record_id,parents_json,created_at,deleted,date,exercise_id,data_json`。所有儲存使用 RAW 字串；parents_json 為 JSON 字串陣列，deleted 為字串 true 或 false，data_json 為正規化完整紀錄 JSON。墓碑 data_json 是字串 null，date 與 exercise_id 留空；InBody 與 rehab 的 exercise_id 留空。kind 由所屬表格決定。事件與備份 schemaVersion 仍為 1；遠端 metadata 2 僅表示另有 rehab_log，不是事件版本。舊版程式不認得遠端 2 時會拒絕同步，避免漏讀。讀取時驗證重複可讀欄與 data_json 的一致性，實際常數由 `src/google/sheets.js` 定義。

備份儲存 schemaVersion 與完整 events，匯入先驗證完整版本圖再合併；不得包含 OAuth 權杖。衝突和墓碑也需保留，不能僅匯出目前投影。


## 來源、核對與負荷語意（相容擴充）

訓練与 InBody 可帶 `source`（來源文字，最多 2000 字）、`review`（欄位 ID → 非空核對原因，最多 500 字）、`analysisExcludedReason`（排除原因，最多 2000 字）。缺省不強制增加這些鍵，既有版本日誌可繼續讀取。

訓練另可帶 `loadBasis`：stack／added_plates／assistance／bodyweight／unknown，以及 `posture` 條件文字。review 只接受 machine、unit、posture、sets、load；有待核對條件或兩筆負荷記錄方式／姿勢不一致，就不判定進退步。掛片量不與估計空機阻力相加成實際負荷。排除紀錄仍保存、匯出並出現在歷史，工作訓練統計另列排除筆數。

InBody review 的鍵限於量測目錄 ID。原始值不變；`bodyComposition.observations` 包含所有值與核對標記，`points` 只含未標待核對且未排除的值，`unverifiedPoints` 提供核對原因。變化比較與折線使用 points，歷史顯示 observations。這只是資料品質條件，不代表已確認臨床真實性。

InBody 擴充評分、BMR、SMI、WHR、水分、蛋白質、礦物質、軀幹脂肪量與參考比、左臂／左右腿 Lean 參考比。原本 segmental 欄位改用「部位 Lean」標籤，避免把除脂量當成單肌肉量。參考比可高於 100%，不是體脂率。新增欄位標為 optional，舊紀錄未提供時不自動加入新鍵，以保留既有正規化語意；原本 12 欄仍維持缺值補 null。明示缺值仍為 null，不推算。

`analyze.timeline` 依選定範圍的紀錄日期列出工作訓練、InBody 與排除訓練筆數；不是推測的訓練階段或復健成效。建立事件時間是建檔時間，先前匯入的原文時間仍留在備註，不改寫既有事件。

## 持續記錄與不定期量測

- 訓練／InBody 的 `time` 可缺省或空字串；有值時限制為 00:00–23:59。預設日期固定依台灣 UTC+8，不受手機所在時區影響。編輯保留時間，新訓練沿用模板時清空時間。
- `training-template.js` 僅複製動作、機台、單位、組別、負荷方式與姿勢設定；當次 pain/technique 重設 unknown，note 清空，不繼承 source 或統計排除原因。沿用數值的待核對旗標保留，避免不明單位變成已確認。UI 不提供沿用暖身／排除紀錄。
- InBody 可帶 `measurementContext:{device,conditions}`；兩欄各最多 2000 字元，可缺省，不接受未知鍵。新報告不複製前次量測值或條件。
- 新增 `segmental_right_arm_pct`、`segmental_trunk_pct` 兩個 optional 指標。共 26 個量測欄位；原報告其他內容可記入備註，尚未支援圖片附件或自動辨識。
- `inbody-series.js` 獨立計算原始觀察、可用數列、前次差、基準差、日曆天數間隔、不同量測日期數。待核對／排除值不納入差值，沒有檢測的日期不補值、不推測肌肉增減。3 筆同日量測不算 3 個量測日期。已填機型／地點有變更時顯示提醒。
- `analyze({from,to,inbodyFrom})` 預設 inbodyFrom=from，保留 API 原有範圍語意；主頁明確傳 null，使 InBody 保留截至今天的所有歷史，訓練篩選與日期總覽仍依 from/to。
- 新欄位經原有 data_json 儲存及同步，不變更 Sheet 欄序。舊事件未提供的選填欄位不補入，避免改變相同版本 ID 內容。舊程式不認得新欄位，所有裝置更新後再同步。

資料 envelope 與 Google Sheet 欄序仍為 v1；此版新增的可選欄位由 data_json 保存。舊程式的嚴格驗證會拒絕新欄位，使用多裝置前應先讓各裝置載入新版網頁，不能讓舊版程式寫入新資料集。
