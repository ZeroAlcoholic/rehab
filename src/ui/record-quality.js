import { el, field, select } from "./dom.js";
import { INBODY_FIELDS } from "../domain/catalog.js";
export function trainingReviewLabel(keys = []) {
  const labels = {machine:'機台',unit:'單位',posture:'姿勢',sets:'組數',load:'重量'};
  const names = keys.map(key => labels[key]).filter(Boolean);
  return names.length ? `${names.join('、')}待核對` : '';
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
    el("summary", {}, "資料來源、待核對與統計設定"),
    data.source ? el("p", { class: "muted" }, `來源：${data.source}`) : null,
    el(
      "p",
      { class: "muted" },
      "待核對的數值保留原文。InBody 僅排除該欄位的變化計算；訓練暫停進步判定。核對原始資料後再取消勾選。",
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
