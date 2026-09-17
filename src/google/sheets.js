import { EXERCISES } from "../domain/catalog.js";
import { mergeEvents, validateEvent } from "../domain/journal.js";
import { addRehabJournal } from './rehab-sheet.js';

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const HEADER = [
  "id",
  "record_id",
  "parents_json",
  "created_at",
  "deleted",
  "date",
  "exercise_id",
  "data_json",
];
const META = [
  ["key", "value"],
  ["app", "rehab-log"],
  ["schemaVersion", "1"],
];
const TABS = { training: "training_log", inbody: "inbody", rehab:'rehab_log' };
const META2 = META.map(row=>row[0]==='schemaVersion'?['schemaVersion','2']:row);
const fail = (code, message) => Object.assign(new Error(message), { code });
const damaged = () =>
  fail(
    "remote-format",
    "Google Sheet 格式或版本損壞，已停止同步；請檢查原檔與備份。",
  );
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function sheetPath(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id))
    throw fail("remote-format", "試算表 ID 無效。");
  return `${BASE}/${encodeURIComponent(id)}`;
}
function grid(title, rows) {
  return {
    properties: { title, gridProperties: { frozenRowCount: 1 } },
    data: [
      {
        startRow: 0,
        startColumn: 0,
        rowData: rows.map((row) => ({
          values: row.map((value) => ({
            userEnteredValue: { stringValue: String(value) },
          })),
        })),
      },
    ],
  };
}
function parseRows(rows, kind) {
  if (!Array.isArray(rows) || !equal(rows[0], HEADER)) throw damaged();
  const events = [];
  for (const row of rows.slice(1)) {
    if (!Array.isArray(row)) throw damaged();
    if (row.length === 0 || row.every((value) => value === "")) continue;
    if (
      row.length !== 8 ||
      row.some((value) => typeof value !== "string") ||
      !["true", "false"].includes(row[4])
    )
      throw damaged();
    const event = {
      schemaVersion: 1,
      id: row[0],
      recordId: row[1],
      parents: JSON.parse(row[2]),
      kind,
      createdAt: row[3],
      deleted: row[4] === "true",
      data: JSON.parse(row[7]),
    };
    if (
      row[5] !== (event.data?.date ?? "") ||
      row[6] !== (event.data?.exerciseId ?? "")
    )
      throw damaged();
    events.push(event);
  }
  return events;
}
function eventRow(event) {
  return [
    event.id,
    event.recordId,
    JSON.stringify(event.parents),
    event.createdAt,
    String(event.deleted),
    event.data?.date ?? "",
    event.data?.exerciseId ?? "",
    JSON.stringify(event.data),
  ];
}

/** HTTP boundary only. The sync engine validates the complete graph before append. */
export function createSheets({ getToken, fetchImpl = fetch }) {
  const versions=new Map();
  async function request(url, { method = "GET", body } = {}) {
    const token = getToken();
    if (typeof token !== "string" || !token)
      throw fail("auth", "請先連線 Google。");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
        });
      } catch {
        throw fail(
          "network",
          "Google 連線失敗或逾時。紀錄仍在本機；請恢復連線後重新同步。",
        );
      }
      if (!response.ok) {
        if (response.status === 401)
          throw fail("auth", "Google 授權失效，請重新連線。");
        if (response.status === 429)
          throw fail("rate-limit", "Google 請求次數過多，請稍候再同步。");
        if (response.status === 403)
          throw fail(
            "remote",
            "Google 拒絕存取，請確認帳號、檔案授權與 API 設定。",
          );
        if (response.status === 404)
          throw fail(
            "remote",
            "找不到或無權存取這份 Google Sheet，請確認帳號與原始檔案。",
          );
        throw fail(
          "remote",
          "Google 暫時無法完成請求。請保留本機資料，稍候重新同步。",
        );
      }
      try {
        return await response.json();
      } catch {
        throw damaged();
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function create() {
    const name = "個人訓練紀錄";
    const result = await request(BASE, {
      method: "POST",
      body: {
        properties: { title: name },
        sheets: [
          grid("_meta", META),
          grid("training_log", [HEADER]),
          grid("inbody", [HEADER]),
          grid("exercise_catalog", [
            ["id", "name", "pattern", "metric"],
            ...EXERCISES.map((e) => [e.id, e.name, e.pattern, e.metric]),
          ]),
        ],
      },
    });
    if (
      typeof result?.spreadsheetId !== "string" ||
      typeof result?.properties?.title !== "string"
    )
      throw damaged();
    return { id: result.spreadsheetId, name: result.properties.title };
  }

  async function list() {
    const files = [],
      seen = new Set();
    let pageToken = "";
    do {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set(
        "q",
        "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      );
      url.searchParams.set(
        "fields",
        "nextPageToken,incompleteSearch,files(id,name)",
      );
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const result = await request(url.href);
      if (!Array.isArray(result?.files) || result.incompleteSearch === true)
        throw damaged();
      for (const file of result.files) {
        if (typeof file?.id !== "string" || typeof file?.name !== "string")
          throw damaged();
        files.push({ id: file.id, name: file.name });
      }
      pageToken = result.nextPageToken ?? "";
      if (typeof pageToken !== "string" || (pageToken && seen.has(pageToken)))
        throw damaged();
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return files;
  }

  async function read(id) {
    // batchGet has no pagination; whole-column ranges include every journal row.
    const url = new URL(`${sheetPath(id)}/values:batchGet`);
    for (const range of ["'_meta'!A:B", "'training_log'!A:H", "'inbody'!A:H"])
      url.searchParams.append("ranges", range);
    url.searchParams.set("majorDimension", "ROWS");
    url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
    const result = await request(url.href);
    try {
      if (
        result?.spreadsheetId !== id ||
        !Array.isArray(result.valueRanges) ||
        result.valueRanges.length !== 3
      )
        throw damaged();
      const [meta, training, inbody] = result.valueRanges;
      if (!equal(meta.values, META) && !equal(meta.values,META2)) throw damaged();
      const version=meta.values[2][1];
      const extended=[];
      if(version==='2'){
        const extraUrl=new URL(`${sheetPath(id)}/values:batchGet`);
        extraUrl.searchParams.set('ranges',"'rehab_log'!A:H");
        extraUrl.searchParams.set('majorDimension','ROWS');
        extraUrl.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
        const extra=await request(extraUrl.href);
        if(extra?.spreadsheetId!==id||extra.valueRanges?.length!==1) throw damaged();
        extended.push(...parseRows(extra.valueRanges[0].values,'rehab'));
      }
      versions.set(id,version);
      return mergeEvents(
        [],
        [
          ...parseRows(training.values, "training"),
          ...parseRows(inbody.values, "inbody"),
          ...extended,
        ],
      );
    } catch (error) {
      if(['auth','network','rate-limit','remote'].includes(error.code)) throw error;
      throw damaged();
    }
  }

  async function append(id, events) {
    const base = sheetPath(id);
    if (!Array.isArray(events))
      throw fail("validation", "待同步版本格式無效。");
    // Validate all rows before the first request, including the other kind.
    const checked = events.map(validateEvent);
    if(checked.some(e=>e.kind==='rehab')){
      if(!versions.has(id)) await read(id);
      if(versions.get(id)!=='2'){
        await addRehabJournal(request,base,HEADER);
        versions.set(id,'2');
      }
    }
    for (const [kind, tab] of Object.entries(TABS)) {
      const rows = checked.filter((event) => event.kind === kind).map(eventRow);
      for (let start = 0; start < rows.length; start += 100) {
        const values = rows.slice(start, start + 100);
        const url = new URL(
          `${base}/values/${encodeURIComponent(`'${tab}'!A:H`)}:append`,
        );
        url.searchParams.set("valueInputOption", "RAW");
        url.searchParams.set("insertDataOption", "INSERT_ROWS");
        // Never retry an ambiguous write here; next sync reads before sending again.
        const result = await request(url.href, {
          method: "POST",
          body: { majorDimension: "ROWS", values },
        });
        if (
          result?.spreadsheetId !== id ||
          result?.updates?.updatedRows !== values.length
        )
          throw damaged();
      }
    }
  }
  return { create, list, read, append };
}
