import { validateRecord } from "../domain/records.js";
import { makeEvent, mergeEvents, project } from "../domain/journal.js";

const sameIds = (a, b) =>
  a.length === b.length &&
  [...a].sort().every((id, i) => id === [...b].sort()[i]);
function heads(events, recordId) {
  const group = events.filter((e) => e.recordId === recordId),
    parents = new Set(group.flatMap((e) => e.parents));
  return group.filter((e) => !parents.has(e.id));
}
export function createService(repository) {
  async function save(kind, data, { recordId = null, parents = [] } = {}) {
    const normalized = validateRecord(kind, data);
    return repository.update((state) => {
      const current = recordId ? heads(state.events, recordId) : [];
      if (
        recordId &&
        (!current.length ||
          !sameIds(
            current.map((e) => e.id),
            parents,
          ))
      )
        throw new Error("這筆資料已有新版本，請重新開啟後再修改。");
      if (current.some((e) => e.kind !== kind))
        throw new Error("不能改變紀錄類型。");
      const event = makeEvent({
        kind,
        data: normalized,
        recordId: recordId ?? crypto.randomUUID(),
        parents,
      });
      return {
        ...state,
        events: mergeEvents(state.events, [event]),
        pending: [...state.pending, event.id],
      };
    });
  }
  async function remove(recordId, parents) {
    return repository.update((state) => {
      const current = heads(state.events, recordId);
      if (
        !current.length ||
        !sameIds(
          current.map((e) => e.id),
          parents,
        )
      )
        throw new Error("這筆資料已有新版本，請重新開啟。");
      const event = makeEvent({
        recordId,
        parents,
        kind: current[0].kind,
        data: null,
        deleted: true,
      });
      return {
        ...state,
        events: mergeEvents(state.events, [event]),
        pending: [...state.pending, event.id],
      };
    });
  }
  async function bind(sheetId, remoteEvents) {
    if (!/^[a-zA-Z0-9_-]+$/.test(sheetId))
      throw new Error("試算表識別碼不正確。");
    const remote = mergeEvents(remoteEvents),
      ids = new Set(remote.map((e) => e.id));
    return repository.update((state) => {
      if (state.settings.sheetId && state.settings.sheetId !== sheetId)
        throw new Error(
          "此手機資料已綁定另一份試算表。請使用另一個瀏覽器設定檔開啟其他資料集。",
        );
      const events = mergeEvents(state.events, remote);
      return {
        ...state,
        events,
        pending: state.pending.filter((id) => !ids.has(id)),
        settings: { ...state.settings, sheetId },
      };
    });
  }
  async function setClientId(clientId) {
    if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))
      throw new Error("請填入 Google 網頁應用程式的用戶端 ID。");
    return repository.update((state) => ({
      ...state,
      settings: { ...state.settings, clientId },
    }));
  }
  async function exportBackup() {
    const state = await repository.read();
    return JSON.stringify(
      {
        format: "rehab-log-backup",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        sourceSheetId: state.settings.sheetId,
        events: state.events,
      },
      null,
      2,
    );
  }
  async function importBackup(text) {
    if (typeof text !== "string" || text.length > 10_000_000)
      throw new Error("備份過大或格式不正確。");
    let backup;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error("無法讀取 JSON 備份。");
    }
    if (
      backup.format !== "rehab-log-backup" ||
      backup.schemaVersion !== 1 ||
      !Array.isArray(backup.events) ||
      typeof backup.sourceSheetId !== "string" ||
      (backup.sourceSheetId && !/^[a-zA-Z0-9_-]+$/.test(backup.sourceSheetId))
    )
      throw new Error("不支援的備份格式。");
    const incoming = mergeEvents(backup.events);
    return repository.update((state) => {
      if (
        state.settings.sheetId &&
        backup.sourceSheetId &&
        state.settings.sheetId !== backup.sourceSheetId
      )
        throw new Error("此備份來自另一份試算表，無法合併。");
      const known = new Set(state.events.map((e) => e.id));
      return {
        ...state,
        events: mergeEvents(state.events, incoming),
        pending: [
          ...state.pending,
          ...incoming.filter((e) => !known.has(e.id)).map((e) => e.id),
        ],
        settings: {
          ...state.settings,
          sheetId: state.settings.sheetId || backup.sourceSheetId,
        },
      };
    });
  }
  return {
    save,
    remove,
    bind,
    setClientId,
    exportBackup,
    importBackup,
    read: async () => {
      const state = await repository.read();
      return { ...state, ...project(state.events) };
    },
  };
}
