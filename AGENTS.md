# Rehab 專案操作規則

## 範圍與執行
- 使用台灣繁體中文。所有 Python 使用 `C:\Programs\miniforge3\envs\deve\python.exe`。
- 本專案是靜態 Android 優先 PWA；維持 domain/storage/google/sync/app/ui 邊界。
- 使用者健康紀錄、原始病史、備份、截圖放 private/；測試輸出放 artifacts/。不得將這些內容搬到公開來源、測試、文件或提交訊息。
- public-site/ 為部署產物，不提交。發布仍使用 .github/workflows/pages.yml 白名單。

## 使用者要求 git commit 時
1. 先讀 `git status --short --branch`、工作區 diff、staged diff 與近期 log；辨識本次範圍和已有暫存內容，不混入無關修改。
2. 依明確檔案或區塊暫存，避免未檢查就 `git add .` / `git add -A`。不使用 `git add -f` 繞過私人資料排除。
3. 執行相關驗證；JS 行為修改跑對應測試及 `node scripts/check-boundaries.mjs`。UI 修改另跑受影響的瀏覽器案例。不要宣稱模擬 Google 或手機尺寸等同真實帳號／實機驗證。
4. 提交前檢查 `git diff --cached --check`、`git diff --cached --stat`、完整 staged diff，並執行 `node scripts/check-staged.mjs`。確認無私人資料、憑證、測試輸出及非預期檔案。
5. 提交訊息描述實際變更目的。提交後查 `git show --stat --oneline HEAD` 和 `git status --short --branch`，報告 hash、內容、驗證及剩餘未提交項目。
6. commit 不等於 push 或部署；使用者只要求 commit 時不得自動 push。不得擅自 amend、reset、清除他人變更或 force push。
7. GitHub CLI 在沙箱內可能無法讀取 Windows keyring。若 401，先用允許的沙箱外唯讀檢查確認，不要求使用者反覆登入，也不列印／複製權杖。

## 本機提交防護
- 本 clone 使用 `git config --local core.hooksPath .githooks`；新 clone 也需執行一次。
- pre-commit 檢查 staged 路徑與常見憑證。這些防護不能識別所有私人文字，完整 diff 人工審閱仍必要。
- 不以 `--no-verify`、關閉 hook 或放寬檢查繞過失敗；先查明原因。
