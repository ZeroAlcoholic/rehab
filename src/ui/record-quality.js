import { el, field, select } from "./dom.js";
import { displayRecordText, recordTextValue } from './record-text.js';
export function qualityEditor(kind, data = {}) {
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
    value: displayRecordText(data.posture ?? ""),
    maxlength: 2000,
    placeholder: "握法、座椅或動作條件",
  });
  const postureValue = () => recordTextValue(data.posture, posture.value.trim());
  const element = el(
    "details",
    { class: "record-quality-editor" },
    el("summary", {}, "更多設定"),
    el("label", {}, excluded, "不納入統計"),
    field("排除原因", reason),
  );
  if (kind === "training")
    element.append(field("負荷記錄方式", basis), field("姿勢條件", posture));
  return {
    element,
    context: () => ({loadBasis: basis.value, posture: postureValue()}),
    value() {
      const result = {};
      if (data.source) result.source = data.source;
      if (data.review) result.review = {...data.review};
      if (excluded.checked) {
        if (!reason.value.trim()) throw new Error("請填寫不納入統計的原因");
        result.analysisExcludedReason = reason.value.trim();
      }
      if (kind === "training") {
        if (basis.value) result.loadBasis = basis.value;
        if (postureValue()) result.posture = postureValue();
      }
      return result;
    },
  };
}
