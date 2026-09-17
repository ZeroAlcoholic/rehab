import { validateRecord, compareRecordOrder } from "./records.js";

const fields = [
  "schemaVersion",
  "id",
  "recordId",
  "parents",
  "kind",
  "data",
  "deleted",
  "createdAt",
];
const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function identifier(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 200 ||
    value !== value.trim() ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new Error("版本或紀錄 ID 不正確");
  return value;
}
export function validateEvent(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !fields.includes(k))
  )
    throw new Error("版本格式不正確");
  if (value.schemaVersion !== 1) throw new Error("不支援的資料版本");
  const id = identifier(value.id),
    recordId = identifier(value.recordId);
  if (
    !Array.isArray(value.parents) ||
    value.parents.some((p) => identifier(p) === id) ||
    new Set(value.parents).size !== value.parents.length
  )
    throw new Error("父版本格式不正確");
  if (
    !["training", "inbody", "rehab"].includes(value.kind) ||
    typeof value.deleted !== "boolean"
  )
    throw new Error("版本類型不正確");
  if (
    typeof value.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt
  )
    throw new Error("版本時間格式不正確");
  if (value.deleted && value.data !== null)
    throw new Error("刪除版本的資料必須為 null");
  return {
    schemaVersion: 1,
    id,
    recordId,
    parents: [...value.parents].sort(),
    kind: value.kind,
    data: value.deleted ? null : validateRecord(value.kind, value.data),
    deleted: value.deleted,
    createdAt: value.createdAt,
  };
}

export function makeEvent({
  id = globalThis.crypto.randomUUID(),
  recordId = id,
  parents = [],
  kind,
  data,
  deleted = false,
  createdAt = new Date().toISOString(),
}) {
  return validateEvent({
    schemaVersion: 1,
    id,
    recordId,
    parents,
    kind,
    data,
    deleted,
    createdAt,
  });
}

export function mergeEvents(...groups) {
  const events = new Map();
  for (const group of groups) {
    if (!Array.isArray(group)) throw new Error("版本清單格式不正確");
    for (const raw of group) {
      const event = validateEvent(raw),
        existing = events.get(event.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(event))
        throw new Error(`相同版本 ID 具有不同內容：${event.id}`);
      events.set(event.id, event);
    }
  }
  const children = new Map(),
    indegree = new Map();
  for (const event of events.values()) {
    indegree.set(event.id, event.parents.length);
    for (const id of event.parents) {
      const parent = events.get(id);
      if (!parent) throw new Error(`缺少父版本：${id}`);
      if (parent.recordId !== event.recordId || parent.kind !== event.kind)
        throw new Error("父版本不屬於相同紀錄與類型");
      if (!children.has(id)) children.set(id, []);
      children.get(id).push(event.id);
    }
  }
  // A record's independent roots must still agree on the record kind.
  const kinds = new Map();
  for (const event of events.values()) {
    if (kinds.has(event.recordId) && kinds.get(event.recordId) !== event.kind)
      throw new Error("同一紀錄具有不同類型");
    kinds.set(event.recordId, event.kind);
  }
  const queue = [...indegree]
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  for (let i = 0; i < queue.length; i++)
    for (const id of children.get(queue[i]) ?? []) {
      indegree.set(id, indegree.get(id) - 1);
      if (indegree.get(id) === 0) queue.push(id);
    }
  if (queue.length !== events.size) throw new Error("版本圖包含循環");
  return [...events.values()].sort((a, b) => ordinal(a.id, b.id));
}

export function project(input) {
  const events = mergeEvents(input),
    referenced = new Set(events.flatMap((e) => e.parents)),
    heads = new Map(),
    created = new Map();
  for (const event of events)
    if (
      !event.parents.length &&
      (!created.has(event.recordId) ||
        event.createdAt < created.get(event.recordId))
    )
      created.set(event.recordId, event.createdAt);
  for (const event of events)
    if (!referenced.has(event.id)) {
      if (!heads.has(event.recordId)) heads.set(event.recordId, []);
      heads.get(event.recordId).push(event);
    }
  const records = [],
    conflicts = [];
  for (const [recordId, versions] of heads) {
    if (versions.length > 1) conflicts.push({ recordId, versions });
    else if (!versions[0].deleted) {
      const event = versions[0];
      records.push({
        recordId,
        eventId: event.id,
        kind: event.kind,
        data: event.data,
        createdAt: created.get(recordId),
      });
    }
  }
  records.sort(compareRecordOrder);
  conflicts.sort((a, b) => ordinal(a.recordId, b.recordId));
  return { records, conflicts };
}
