import { el, field, select } from "./dom.js";
import { INBODY_FIELDS } from "../domain/catalog.js";
// Display only: keep original machine identity in saved data and comparison keys.
export function machineDisplayName(machine = '') {
  return machine.replace(/\s*[（(](?:型號|機型|機台|姿勢|姿式)待(?:核對|確認)[）)]\s*$/u, '').trim() || '未指定機台';
}
export function reviewDetails(data) {
  const originalMachine = data.machine && machineDisplayName(data.machine) !== data.machine;
  const reasons = Object.values(data.review ?? {});
  if (!originalMachine && !reasons.length) return null;
  return el('details', {class:'record-review-details'},
    el('summary', {}, '紀錄詳情'),
    originalMachine ? el('p', {class:'muted'}, `原始器材名稱：${data.machine}`) : null,
    reasons.length ? el('p', {class:'muted'}, '部分條件尚未確認，暫不判定進步。') : null,
    reasons.map(reason => el('p', {class:'muted'}, reason)));
}
export function qualityEditor(kind, data = {}) {
  const keys =
    kind === "inbody"
      ? INBODY_FIELDS.map((f) => [f.id, f.label])
      : [
          ["machine", "機台"],
          ["unit", "單位"],
          ["posture", "姿勢"],
          ["sets", "組數"],
          ["load", "重量"],
        ];
  const rows = keys.map(([id, label]) => ({
    id,
    input: el("input", {
      type: "checkbox",
      checked: !!data.review?.[id],
      "aria-label": `${label}待核對`,
    }),
    label,
  }));
  const excluded = el("input", {
    type: "checkbox",
    checked: !!data.analysisExcludedReason,
  });
  const reason = el("input", {
    type: "text",
    value: data.analysisExcludedReason ?? "",
    placeholder: "例如：暖身／測試；不作工作組比較",
    maxlength: 2000,
  });
  const basis = select(
    [
      ["", "未指定"],
      ["stack", "機台刻度"],
      ["added_plates", "掛片總重（不含機台起始阻力）"],
      ["assistance", "輔助量"],
      ["bodyweight", "自重"],
      ["unknown", "未知"],
    ],
    data.loadBasis ?? "",
  );
  const posture = el("input", {
    type: "text",
    value: data.posture ?? "",
    maxlength: 2000,
    placeholder: "握法、座椅或動作條件",
  });
  const element = el(
    "details",
    { class: "record-quality-editor" },
    el("summary", {}, "紀錄詳情與統計設定"),
    data.source ? el("p", { class: "muted" }, `來源：${data.source}`) : null,
    el(
      "p",
      { class: "muted" },
      "勾選尚未確認的欄位：InBody 暫不計算該數值的變化，訓練暫不判定進步。確認後可取消勾選。",
    ),
    el(
      "div",
      { class: "quality-checks" },
      rows.map((r) =>
        el(
          "label",
          {},
          r.input,
          `${r.label}待核對`,
          data.review?.[r.id] ? el("small", {}, data.review[r.id]) : null,
        ),
      ),
    ),
    el("label", {}, excluded, "不納入統計"),
    field("排除原因", reason),
  );
  if (kind === "training")
    element.append(field("負荷記錄方式", basis), field("姿勢條件", posture));
  return {
    element,
    reviewKeys: () => rows.filter(row=>row.input.checked).map(row=>row.id),
    context: () => ({loadBasis: basis.value, posture: posture.value.trim()}),
    value() {
      const result = {};
      if (data.source) result.source = data.source;
      const review = Object.fromEntries(
        rows
          .filter((r) => r.input.checked)
          .map((r) => [r.id, data.review?.[r.id] ?? "使用者標記待核對"]),
      );
      if (Object.keys(review).length) result.review = review;
      if (excluded.checked) {
        if (!reason.value.trim()) throw new Error("請填寫不納入統計的原因");
        result.analysisExcludedReason = reason.value.trim();
      }
      if (kind === "training") {
        if (basis.value) result.loadBasis = basis.value;
        if (posture.value.trim()) result.posture = posture.value.trim();
      }
      return result;
    },
  };
}
