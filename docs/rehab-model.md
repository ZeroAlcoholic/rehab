# 動作計畫與身體狀況

`kind: rehab` 沿用不可變版本日誌、衝突處理與 JSON 備份。驗證在 `domain/rehab.js`，分析在 `domain/rehab-analysis.js`；不列入訓練／InBody 筆數。

- `type: plan`：date、選填 time、regions、items。每張動作卡有 id、name、exerciseId、status（review / ready / paused）、dose、cue、next。最多 20 張，卡片 ID 不重複。無 history、diagnosis、病史來源欄位，未知欄位拒絕。已確認只是使用者編輯狀態，不是程式核准安全。
- `type: symptom`：date、time、locations、score（null 或 0–10）、activity、training、qualities、radiation、numbness、weakness、deviation、direction、triggers、recovery、nextDay、note、redFlags。狀態採 unknown / no / yes；新紀錄預設 unknown，不沿用上次陰性。位置為腰、臀、坐骨附近的左右及中央分類，不能由位置直接推論病因。
- 歷史症狀不預載。新填分數以實際日期呈現，缺分數不補零。警訊依各欄最近明確回答與日期判讀，後續 unknown 不消除先前 yes；不輸出「安全」判定。編輯或刪除仍透過版本機制。
- 最新計畫獨立於短期訓練篩選；調整部位從補基準與進步候選移出，原始訓練上色及歷史統計不變。橘色虛線只代表動作需確認，沒有病灶或受傷含義。刪除部位勾選即可解除該部位的候選限制。
- 仰躺收腹的呼吸次數以 reps 記錄（每次自然呼吸算一次），不作力量或復健成效比較。一般計時型動作仍未實作，勿把秒數填成次數。

遠端初次寫入 rehab 前，以 Sheets 原子 batchUpdate 同時新增表、表頭與 metadata 2；失敗不附加。既有表不搬移。v2 讀取必須包含 rehab_log，缺失不得當空表；401 等連線錯誤維持原類別。成功仍須同步引擎重新讀回確認，HTTP 模擬測試不等於真實帳號驗證。

使用者病史分析留在私人工作區，不進 app、DOM、預載資料、快取或公開部署。以後主動新增的身體狀況是使用者資料，會依一般備份／私人 Sheet 流程保存。

## 日常操作

訓練表單的感受與備註為選填，預設收起；修改含既有觀察的紀錄時展開。數值、疼痛、動作狀況與備註仍存在同一筆 training，不另建 symptom。未填保留 unknown，不自動當作無痛或穩定；既有保守比較規則不變。

動作計畫及獨立不適追蹤放在 InBody 後方，預設收起；沒有不適紀錄時不顯示空圖表。人體圖的計畫連結會展開目的區域。已記錄的警訊放在總覽下方，與收合區域分開。

訓練進程內每個器材組別可「再記一次」，沿用該組範圍內最新紀錄，透過既有 repeatTraining 清除舊觀察；不借用其他機台、單位的數值。存檔及背景重繪保留已展開的動作結果。
