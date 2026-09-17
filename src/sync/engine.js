import { mergeEvents } from "../domain/journal.js";

// Parents must reach the server before children if a multi-batch upload stops midway.
function causalOrder(events) {
  const byId = new Map(events.map((e) => [e.id, e])),
    children = new Map(),
    counts = new Map();
  for (const event of events) {
    const pendingParents = event.parents.filter((id) => byId.has(id));
    counts.set(event.id, pendingParents.length);
    for (const parent of pendingParents) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(event.id);
    }
  }
  const queue = events.filter((e) => counts.get(e.id) === 0);
  for (let i = 0; i < queue.length; i++)
    for (const child of children.get(queue[i].id) ?? []) {
      counts.set(child, counts.get(child) - 1);
      if (counts.get(child) === 0) queue.push(byId.get(child));
    }
  if (queue.length !== events.length) throw new Error("待同步版本關係不正確。");
  return queue;
}

export function createSyncEngine({ repository, remote }) {
  let running = null;
  async function perform() {
    const start = await repository.read(),
      sheetId = start.settings.sheetId;
    if (!sheetId) throw new Error("請先建立或載入私人試算表。");
    const cloud = mergeEvents(await remote.read(sheetId));
    const ids = new Set(cloud.map((e) => e.id)),
      pending = new Set(start.pending);
    if (start.events.some((e) => !pending.has(e.id) && !ids.has(e.id)))
      throw new Error(
        "雲端缺少已同步的歷史版本，已停止寫入。請檢查是否刪除了試算表資料，並匯出本機備份。",
      );
    const current = await repository.update((state) => {
      if (state.settings.sheetId !== sheetId)
        throw new Error("同步期間資料來源已變更，請重試。");
      return {
        ...state,
        events: mergeEvents(state.events, cloud),
        pending: state.pending.filter((id) => !ids.has(id)),
      };
    });
    const queue = new Set(current.pending),
      outgoing = causalOrder(current.events.filter((e) => queue.has(e.id)));
    if (outgoing.length) await remote.append(sheetId, outgoing);
    const confirmed = mergeEvents(await remote.read(sheetId)),
      confirmedIds = new Set(confirmed.map((e) => e.id));
    if (cloud.some((e) => !confirmedIds.has(e.id)))
      throw new Error("同步期間雲端歷史被移除，請檢查試算表。");
    if (outgoing.some((e) => !confirmedIds.has(e.id)))
      throw new Error("尚未確認雲端寫入，紀錄仍保留待同步。");
    return repository.update((state) => {
      if (state.settings.sheetId !== sheetId)
        throw new Error("同步期間資料來源已變更。");
      return {
        ...state,
        events: mergeEvents(state.events, confirmed),
        pending: state.pending.filter((id) => !confirmedIds.has(id)),
        lastSync: new Date().toISOString(),
      };
    });
  }
  return {
    run() {
      if (running) return running;
      const task = () => perform();
      running = (
        globalThis.navigator?.locks
          ? navigator.locks.request("rehab-log-sync", task)
          : task()
      ).finally(() => {
        running = null;
      });
      return running;
    },
  };
}
