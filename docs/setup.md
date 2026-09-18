# 設定與部署

一般使用者先看 [手機上手指南](start.html)，本頁保留給設定者核對細節。

這份程式是私人紀錄工具的靜態前端。未設定 Google 時仍可在本機記錄；跨裝置還原需要同一個 Google Cloud 專案的 Client ID、相同 Google 帳號及原本的 Sheet。本文件不代表已完成部署或真實帳號驗收。

## GitHub Pages

1. 將程式放進自己的 GitHub repository（GitHub Free 的 Pages 使用公開 repository），保留附帶的 Pages workflow。不要將健康紀錄 JSON、試算表匯出、權杖、Client secret 或服務帳號金鑰加入 repository。
2. 到 repository 的 **Settings → Pages → Build and deployment**，Source 選 **GitHub Actions**。參考 [GitHub Pages 自訂 workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
3. 執行附帶的部署 workflow；它只發布網站資產白名單，不把 repository 根目錄整份當成網站。部署前檢查 workflow 顯示的 artifact 內容。
4. 開啟 Pages 提供的 HTTPS 網址，例如 `https://your-name.github.io/rehab/`。部署權限、workflow 成功與實際網址都需在自己的 GitHub 帳號確認。

公開的是網頁程式；私人紀錄保存在瀏覽器 IndexedDB 與自己的 Google Sheet。請維持 Sheet 的共用設定為受限制，不需「發布到網路」。本機清除網站資料、移除瀏覽器設定檔或無痕模式結束，可能讓未同步紀錄消失；定期下載 JSON 備份並保存到私人位置。

## Google Cloud 與授權

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立或選用專案，啟用 **Google Sheets API** 與 **Google Drive API**。
2. 設定 Google Auth Platform 的 Branding、Audience 與 Data Access。個人 Google 帳號使用 External；開發階段保留 Testing，將實際使用的帳號加入 Test users。External Testing 有測試使用者名單限制，Workspace 管理員也可能另外封鎖授權。參考 [OAuth 應用程式狀態](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)。
3. 建立 OAuth Client，類型選 **Web application**。在 **Authorized JavaScript origins** 填網站來源，例如 `https://your-name.github.io`；不要包含 `/rehab/` 路徑。自訂網域需另加其 HTTPS origin。本機測試需加 `http://localhost` 和實際的 `http://localhost:連接埠`。此程式使用 GIS token popup；不需設定後端交換授權碼。參考 [Client ID 設定](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)。
4. Data Access 僅設定 `https://www.googleapis.com/auth/drive.file`。此範圍允許操作由這個應用程式建立或獲使用者授權的特定檔案，不列出帳號全部試算表；不需要全域 Drive 或 Sheets 權限。參考 [Sheets scope 選擇](https://developers.google.com/workspace/sheets/api/scopes)。
5. 複製以 `.apps.googleusercontent.com` 結尾的 **Client ID**，填入 `index.html` 的 `google-oauth-client-id` meta 設定後部署。新裝置會自動預填並準備授權；已儲存的裝置設定仍優先。Client ID 是公開識別碼；不要填 Client secret。REST 呼叫使用 Bearer access token，本程式不需要 API key。

Google 授權視窗必須由使用者點擊啟動；程式先在準備授權步驟載入 GIS，再由連線按鈕同步呼叫 `requestAccessToken()`。若視窗被封鎖，允許本站彈出視窗後重試。取消、關閉或拒絕權限不會刪除本機紀錄。參考 [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) 與 [授權錯誤](https://developers.google.com/identity/oauth2/web/guides/error)。

Access token 只留在記憶體，到期或重載頁面後需再點連線。主畫面按同步時，尚未連線或尚未綁定 Sheet 會直接開啟設定；部署預設或已儲存的 Client ID 會自動準備授權，不必重貼。權杖不會在背景刷新。Google 的 External Testing 七天規則涉及測試授權／refresh token；本程式沒有取得或儲存 refresh token，不可把七天理解為單次 access token 的有效期。實際 access token 依 Google 回傳的 `expires_in` 判斷。參考 [OAuth token 到期規則](https://developers.google.com/identity/protocols/oauth2#expiration)。網站「中斷連線」清除本機記憶體權杖，不撤銷整個 Google 授權；若要撤銷，請到 [Google 帳號連線設定](https://myaccount.google.com/connections) 操作。

## 首次連線與換機

1. 初次使用時連線 Google，建立專用 Sheet。程式在一次建立請求中初始化 `_meta`、`training_log`、`inbody`、`exercise_catalog` 四個工作表，完成後綁定本機資料集。
   首次同步動作計畫或身體狀況時，程式會自動新增 `rehab_log` 並升級遠端格式。資料仍留在同一份私人 Sheet；不必另建後端。
2. 舊的本機預覽與正式 HTTPS 網站屬於不同來源，資料不會自動搬家。先在舊預覽匯出 JSON 備份，再到正式網站匯入並同步。記錄一筆資料並同步；只有讀回遠端、確認相同版本後才會取消待同步狀態。網路中斷、429、伺服器錯誤或權杖到期時，保留本機紀錄，待恢復後手動重試。
3. 換機時開啟相同網站並連線相同 Google 帳號，查找此應用程式可存取的 Sheet，再載入原本那份。網站已提供相同 Client ID；清單不是全部 Google Drive。若更換 Cloud 專案或複製／手動建立 Sheet，可能不在這個應用程式的檔案授權範圍內。
4. 載入前會驗證標記、版本、表頭與完整日誌。不要手動改表頭、公式化資料欄位或刪除歷史版本。若顯示格式損壞，先保留本機備份及 Sheet 副本並檢查原因，不要透過覆蓋遠端消除錯誤。

## 實際驗收

自動測試使用受控的 HTTP 與 GIS 邊界，不能證明 Google Console、真實帳號、Chrome 授權視窗與遠端持久化均已正常。上線前需在 Android Chrome 實際完成：授權 → 建立 Sheet → 記錄與同步 → 直接檢查 Sheet → 第二台裝置載入 → 離線新增後恢復同步 → 關閉授權視窗與重新連線。另以兩台裝置離線修改同一筆，確認同步後呈現衝突並可手動解決。

GitHub Pages 部署、Google 真實帳號往返、Android 真機與換機還原，在未提供相應環境並實測前均屬**尚未驗證**。最新驗證結果見 [verification.md](verification.md)。
