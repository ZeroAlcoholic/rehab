import { el, button } from "./dom.js";
import { PROGRESS_LABELS } from "../domain/body-insights.js";
import { streamEvidence, recordEvidence } from "./training-evidence.js";
export function renderBodyDetail(selected, model, mode, onExercise, onFindEquipment) {
  const content = [
    el("p", { class: "body-region-eyebrow" }, "相關訓練"),
    el("h3", {}, selected.name),
  ];
  if (onFindEquipment) content.push(button(`找${selected.name}相關器材`,()=>onFindEquipment(selected.id),{class:'secondary'}));
  if(selected.needsAdjustment)content.push(el('p',{class:'adjust-legend'},'◇ 動作需確認 · 不代表此處受傷'),el('a',{href:'#rehab-panel',class:'rehab-plan-link',onClick:()=>{const options=document.querySelector('#rehab-panel .rehab-options');if(options)options.open=true;}},'查看動作計畫 →'));
  if (mode === "progress") {
    content.push(
      el(
        "p",
        { class: "body-status", "data-tone": selected.progress },
        PROGRESS_LABELS[selected.progress],
      ),
      el(
        "p",
        { class: "muted" },
        "依主要關聯動作的最近兩筆紀錄；不是單塊肌肉的肌力量測。",
      ),
    );
    content.push(
      el(
        "p",
        { class: "body-evidence-count" },
        `主要關聯：${selected.evidence.comparedCount} / ${selected.evidence.totalCount} 個動作／器材組別可比`,
      ),
    );
    for (const s of selected.streams) content.push(streamEvidence(s));
    if (!selected.streams.length)
      content.push(el("p", { class: "muted" }, "尚無相關訓練紀錄"));
  } else {
    if (!selected.recordCount)
      content.push(
        el("p", { class: "muted" }, "尚無相關訓練紀錄"),
        el("p", { class: "muted" }, "這不表示這個部位較弱。"),
      );
    else
      content.push(
        el(
          "p",
          { class: "body-region-count" },
          el("strong", {}, selected.recordCount),
          " 筆相關紀錄",
        ),
        el(
          "p",
          { class: "body-set-count" },
          `主要 ${selected.primarySets} 組 · 協同 ${selected.supportSets} 組`,
        ),
        el("p", { class: "muted" }, `最近記錄 ${selected.lastDate}`),
      );
    if (selected.painCount)
      content.push(
        el(
          "p",
          { class: "body-context-note" },
          `相關動作有 ${selected.painCount} 筆疼痛紀錄；位置未記錄。`,
        ),
      );
    if (selected.techniqueCount)
      content.push(
        el(
          "p",
          { class: "body-context-note" },
          `相關動作有 ${selected.techniqueCount} 筆修正／代償／未完成紀錄。`,
        ),
      );
    for (const e of selected.exercises) {
      content.push(
        el(
          "div",
          { class: "body-exercise-row" },
          button(
            `${e.name} · ${e.recordCount} 筆`,
            () => onExercise(e.exerciseId),
            { class: "body-exercise-link", "aria-label": `查看${e.name}進程` },
          ),
          el(
            "span",
            { class: "body-role" },
            e.role === "primary" ? "主要" : "協同",
          ),
        ),
      );
    }
    if (mode === "session")
      for (const r of model.records.filter((r) =>
        selected.exercises.some((e) => e.exerciseId === r.data.exerciseId),
      ))
        content.push(
          el(
            "div",
            {},
            el("p", { class: "muted" }, r.data.machine || "機台未填"),
            recordEvidence(r),
          ),
        );
  }
  return content;
}

export function renderBodyFocus(model, onSelect) {
  const root = el(
    "details",
    { class: "body-focus" },
    el(
      "summary",
      {},
      `期間重點：${model.focus.baseline.length} 區無主要紀錄 · ${model.focus.progress.length} 區有進步`,
    ),
  );
  if (!model.focus.hasTraining) {
    root.replaceChildren(
      el("summary", {}, "從第一筆紀錄開始"),
      el(
        "p",
        { class: "muted" },
        "這段期間尚無訓練紀錄，先記錄實際訓練，再建立部位基準。",
      ),
    );
    return root;
  }
  root.append(
    el(
      "p",
      { class: "muted" },
      `依本期間 ${model.focus.recordCount} 筆紀錄。`,
    ),
  );
  for (const [key, title, reason] of [
    ['adjust','需調整的部位','依目前動作計畫'],
    ["baseline", "尚無主要訓練紀錄", "先確認可訓練範圍；受限部位不必補練"],
    ["incomplete", "繼續累積可比紀錄", "已有主要訓練，但還沒有兩筆可比資料"],
    ["progress", "已有可比進步", "主要關聯動作都有可比進步"],
    ["review", "先查看紀錄", "相關動作有疼痛或技術事件，位置未記錄"],
  ]) {
    root.append(
      el("h4", {}, title),
      el("p", { class: "body-map-caption" }, reason),
      el(
        "div",
        { class: "body-chips" },
        model.focus[key].length
          ? model.focus[key].map((r) =>
              button(r.name, () => onSelect(r.id), { class: "body-chip" }),
            )
          : el("span", { class: "muted" }, "目前無符合項目"),
      ),
    );
  }
  return root;
}
