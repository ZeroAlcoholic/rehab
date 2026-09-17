import { el, button } from "./dom.js";
import { PROGRESS_LABELS } from "../domain/body-insights.js";
export function regionValue(region, mode) {
  return mode === "progress"
    ? PROGRESS_LABELS[region.progress]
    : `主要 ${region.primarySets} 組 · 協同 ${region.supportSets} 組`;
}
export function createRegionList(model, mode, onSelect) {
  return el(
    "div",
    { class: "body-region-list", "aria-label": "肌群數值清單" },
    model.regions.map((r) =>
      button(
        [el("strong", {}, r.name), el("span", {}, regionValue(r, mode))],
        () => onSelect(r.id),
        {
          "data-region-id": r.id,
          "aria-pressed": false,
          "aria-label": `選取${r.name}：${regionValue(r, mode)}`,
        },
      ),
    ),
  );
}
export function createRanking(model, onSelect) {
  const rows = model.regions
    .filter((r) => r.setCount)
    .sort(
      (a, b) => b.primarySets - a.primarySets || b.supportSets - a.supportSets,
    );
  const max = Math.max(1, ...rows.map((r) => r.primarySets));
  const list = el(
    "details",
    { class: "body-ranking" },
    el("summary", {}, "比較各肌群的相關組數"),
  );
  for (const r of rows)
    list.append(
      el(
        "div",
        { class: "body-bar-row" },
        button(r.name, () => onSelect(r.id), { class: "body-bar-name" }),
        el(
          "div",
          { class: "body-bar-track", "aria-hidden": true },
          el("i", { style: `width:${(r.primarySets / max) * 100}%` }),
        ),
        el("span", {}, `${r.primarySets} 主要 / ${r.supportSets} 協同`),
      ),
    );
  if (!rows.length)
    list.append(el("p", { class: "muted" }, "新增訓練後顯示組數比較。"));
  return list;
}
