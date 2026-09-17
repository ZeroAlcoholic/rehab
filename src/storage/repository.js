import { initialState } from "./state.js";

// One transaction owns each read-modify-write; no asynchronous callback inside it.
export async function openRepository(name = "rehab-log-v1") {
  if (!globalThis.indexedDB)
    throw new Error(
      "此瀏覽器無法儲存資料，請使用 Android Chrome 一般瀏覽模式。",
    );
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("無法開啟手機儲存空間，請確認瀏覽器權限。"));
    request.onblocked = () => reject(new Error("請關閉舊版分頁後再開啟。"));
  });
  db.onversionchange = () => db.close();
  function transaction(mode, transform) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", mode),
        store = tx.objectStore("state");
      let result, failure;
      const req = store.get("current");
      req.onsuccess = () => {
        try {
          const value = req.result ?? initialState();
          if (value.schemaVersion !== 1)
            throw new Error("本機資料版本不相容，請先使用原版本匯出資料。");
          result = transform ? transform(value) : value;
          if (result?.then) throw new Error("儲存回呼不可非同步。");
          if (mode === "readwrite") store.put(result, "current");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(structuredClone(result));
      tx.onabort = tx.onerror = () =>
        reject(
          failure ??
            new Error("資料尚未儲存，手機儲存空間可能不足。請保留畫面後再試。"),
        );
    });
  }
  return {
    read: () => transaction("readonly"),
    update: (fn) => transaction("readwrite", fn),
  };
}
