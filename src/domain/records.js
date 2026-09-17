import { EXERCISES, INBODY_FIELDS } from "./catalog.js";
import { validateRehab } from './rehab.js';

const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// User-entered date/time are Taiwan wall time, independent of entry time.
// Unknown time sorts first (not an inferred midnight); ties use creation and ID.
export function compareRecordOrder(a, b) {
  return (
    ordinal(a.data.date, b.data.date) ||
    ordinal(a.data.time ?? "", b.data.time ?? "") ||
    ordinal(a.createdAt ?? "", b.createdAt ?? "") ||
    ordinal(a.recordId, b.recordId)
  );
}

function object(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}格式不正確`);
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new Error(`${label}包含未知欄位`);
}
function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "0001-01-01"
  )
    throw new Error("日期格式必須為 YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error("日期不存在");
  return value;
}
function text(value, label, max) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${label}格式或長度不正確`);
  return value.trim();
}
function option(value, allowed, label, fallback) {
  const result = value === undefined ? fallback : value;
  if (!allowed.includes(result)) throw new Error(`${label}不正確`);
  return result;
}
function number(
  value,
  label,
  { integer = false, min = 0, max = Infinity } = {},
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(`${label}必須為有效${integer ? "整數" : "數值"}`);
  return value;
}

function annotations(kind, data) {
  const out = {};
  if (data.time !== undefined) {
    if (typeof data.time !== "string" || (data.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)))
      throw new Error("時間格式必須為 HH:mm（台灣時間）");
    out.time = data.time;
  }
  if (data.measurementContext !== undefined) {
    object(data.measurementContext, ["device", "conditions"], "量測條件");
    out.measurementContext = {};
    for (const key of ["device", "conditions"])
      if (data.measurementContext[key] !== undefined)
        out.measurementContext[key] = text(data.measurementContext[key], "量測條件", 2000);
  }
  for (const key of ["source", "analysisExcludedReason", "posture"])
    if (data[key] !== undefined) out[key] = text(data[key], key, 2000);
  if (data.loadBasis !== undefined)
    out.loadBasis = option(
      data.loadBasis,
      ["stack", "added_plates", "assistance", "bodyweight", "unknown"],
      "負荷記錄方式",
    );
  if (data.review !== undefined) {
    const fields =
      kind === "inbody"
        ? INBODY_FIELDS.map((f) => f.id)
        : ["machine", "unit", "posture", "sets", "load"];
    object(data.review, fields, "待核對欄位");
    out.review = {};
    for (const [key, value] of Object.entries(data.review)) {
      const reason = text(value, "待核對原因", 500);
      if (!reason) throw new Error("待核對原因不可空白");
      out.review[key] = reason;
    }
  }
  return out;
}

export function validateRecord(kind, data) {
  if(kind==='rehab') return validateRehab(data,{object,date,text,option,number});
  if (kind === "training") {
    object(
      data,
      [
        "date",
        "time",
        "exerciseId",
        "machine",
        "unit",
        "sets",
        "pain",
        "technique",
        "note",
        "source",
        "review",
        "loadBasis",
        "posture",
        "analysisExcludedReason",
      ],
      "訓練紀錄",
    );
    const exercise = EXERCISES.find((x) => x.id === data.exerciseId);
    if (!exercise) throw new Error("未知動作");
    if (
      !Array.isArray(data.sets) ||
      data.sets.length < 1 ||
      data.sets.length > 100
    )
      throw new Error("組數必須介於 1 至 100");
    return {
      ...annotations(kind, data),
      date: date(data.date),
      exerciseId: exercise.id,
      machine: text(data.machine, "機台", 200),
      unit: option(data.unit, ["kg", "lb"], "單位"),
      sets: data.sets.map((set) => {
        object(set, ["load", "reps"], "組");
        const load =
          exercise.metric === "bodyweight" &&
          (set.load === null || set.load === undefined)
            ? null
            : number(set.load, "重量或輔助量");
        if (exercise.metric === "bodyweight" && load !== null)
          throw new Error("徒手動作重量欄請留空");
        return {
          load,
          reps: number(set.reps, "次數", { integer: true, min: 1, max: 10000 }),
        };
      }),
      pain: option(
        data.pain,
        ["unknown", "none", "mild", "significant"],
        "疼痛",
        "unknown",
      ),
      technique: option(
        data.technique,
        ["unknown", "stable", "corrected", "compensation", "failed"],
        "動作狀況",
        "unknown",
      ),
      note: text(data.note, "備註", 10000),
    };
  }
  if (kind === "inbody") {
    object(
      data,
      ["date", "time", "measurementContext", "metrics", "note", "source", "review", "analysisExcludedReason"],
      "InBody 紀錄",
    );
    object(
      data.metrics,
      INBODY_FIELDS.map((x) => x.id),
      "InBody 量測",
    );
    const metrics = {};
    for (const field of INBODY_FIELDS) {
      const value = data.metrics[field.id];
      if (field.optional && value === undefined) continue;
      metrics[field.id] =
        value === undefined || value === null
          ? null
          : number(value, field.label, {
              max: field.id === "body_fat_percentage" ? 100 : Infinity,
            });
    }
    if (!Object.values(metrics).some((x) => x !== null))
      throw new Error("請填寫至少一項量測");
    return {
      ...annotations(kind, data),
      date: date(data.date),
      metrics,
      note: text(data.note, "備註", 10000),
    };
  }
  throw new Error("未知紀錄類型");
}
