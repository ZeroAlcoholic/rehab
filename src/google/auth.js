const SCOPE = "https://www.googleapis.com/auth/drive.file";
const fail = (message) => Object.assign(new Error(message), { code: "auth" });

/** Call prepare from settings, then connect directly inside the user's click handler. */
export function createAuth({
  getGoogle = () => globalThis.google,
  documentImpl = globalThis.document,
  now = () => Date.now(),
  timeoutMs = 120000,
} = {}) {
  let accessToken = "",
    expiresAt = 0,
    clientId = "",
    prepared = false,
    loading = null,
    pending = null;

  function loadLibrary() {
    if (getGoogle()?.accounts?.oauth2) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (!documentImpl) {
        reject(fail("無法載入 Google 授權，請使用支援的瀏覽器。"));
        return;
      }
      const script = documentImpl.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      const timer = setTimeout(
        () => finish(fail("Google 授權元件載入逾時，請檢查連線後重試。")),
        Math.min(timeoutMs, 20000),
      );
      function finish(error) {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          reject(error);
        } else resolve();
      }
      script.onload = () =>
        finish(
          getGoogle()?.accounts?.oauth2
            ? null
            : fail("Google 授權元件未就緒，請重試。"),
        );
      script.onerror = () =>
        finish(fail("無法載入 Google 授權元件，請檢查連線後重試。"));
      documentImpl.head.appendChild(script);
    }).finally(() => {
      loading = null;
    });
    return loading;
  }

  function disconnect() {
    accessToken = "";
    expiresAt = 0;
    pending?.finish(fail("已中斷 Google 連線。"));
  }

  async function prepare(id) {
    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(id.trim())
    ) {
      throw fail("請填入有效的 Google Web Client ID。");
    }
    id = id.trim();
    if (id !== clientId) {
      disconnect();
      prepared = false;
      clientId = id;
    }
    await loadLibrary();
    if (clientId === id) prepared = true;
  }

  // Deliberately not async: no await may precede requestAccessToken's user gesture.
  function connect(id) {
    if (!prepared || id?.trim() !== clientId)
      return Promise.reject(fail("請先儲存設定並完成準備授權，再按連線。"));
    if (pending)
      return Promise.reject(fail("Google 授權進行中，請先完成或關閉視窗。"));
    accessToken = "";
    expiresAt = 0;
    return new Promise((resolve, reject) => {
      const request = {
        finish(error) {
          if (pending !== request) return;
          clearTimeout(timer);
          pending = null;
          if (error) reject(error);
          else resolve();
        },
      };
      pending = request;
      const timer = setTimeout(
        () => request.finish(fail("Google 授權逾時，請重新連線。")),
        timeoutMs,
      );
      try {
        const client = getGoogle().accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          include_granted_scopes: false,
          callback(response) {
            if (pending !== request) return;
            const seconds = Number(response?.expires_in);
            if (
              response?.error ||
              typeof response?.access_token !== "string" ||
              !response.access_token ||
              !Number.isFinite(seconds) ||
              seconds <= 30 ||
              typeof response.scope !== "string" ||
              !response.scope.split(" ").includes(SCOPE)
            ) {
              request.finish(fail("Google 未完成必要權限授權，請重新連線。"));
              return;
            }
            accessToken = response.access_token;
            expiresAt = now() + (seconds - 30) * 1000;
            request.finish();
          },
          error_callback(error) {
            request.finish(
              fail(
                error?.type === "popup_closed"
                  ? "Google 授權視窗已關閉，可再按連線。"
                  : "無法開啟 Google 授權，請允許彈出視窗後重試。",
              ),
            );
          },
        });
        client.requestAccessToken({ prompt: "select_account" });
      } catch {
        request.finish(fail("無法啟動 Google 授權，請重新準備授權。"));
      }
    });
  }

  function isConnected() {
    if (!accessToken || now() >= expiresAt) {
      accessToken = "";
      expiresAt = 0;
      return false;
    }
    return true;
  }
  function token() {
    if (!isConnected()) throw fail("Google 授權已到期或尚未連線，請重新連線。");
    return accessToken;
  }
  return { prepare, connect, disconnect, token, isConnected };
}
