import { machineDisplayName, displayRecordText } from './record-text.js';
import { el } from "./dom.js";
import { PROGRESS_LABELS } from "../domain/body-insights.js";
import { EXERCISES } from "../domain/catalog.js";
const PAIN = { unknown: "未填", none: "無", mild: "輕微", significant: "明顯" };
const TECHNIQUE = {
  unknown: "未填",
  stable: "穩定",
  corrected: "已修正",
  compensation: "代償",
  failed: "未完成",
};
export function recordEvidence(record) {
  const d = record.data,
    assisted =
      EXERCISES.find((e) => e.id === d.exerciseId)?.metric === "assistance";
  const context = [d.pain!=='unknown' ? `疼痛：${PAIN[d.pain]}` : '', d.technique!=='unknown' ? `動作：${TECHNIQUE[d.technique]}` : ''].filter(Boolean).join(' · ');
  return el(
    "div",
    { class: "body-source" },
    el("strong", {}, `${d.date}${d.time ? ` ${d.time}` : ""}`),
    el(
      "p",
      { class: "muted" },
      `${d.sets.length} 組 · 總次數 ${d.sets.reduce((n, s) => n + s.reps, 0)}${d.loadBasis === "added_plates" ? " · 掛片總重，未含機台起始阻力" : ""}`,
    ),
    el(
      "p",
      {},
      `${assisted ? "輔助量 " : ""}${d.sets.map((s) => `${s.load === null ? "自重" : `${s.load} ${d.unit}`} × ${s.reps}`).join(" / ")}`,
    ),
    context ? el(
      "p",
      { class: "body-source-context" },
      context,
    ) : null,
    d.note ? el("p", { class: "body-source-note" }, displayRecordText(d.note)) : null,
  );
}
export function streamEvidence(stream) {
  const status = stream.comparison.flagged
    ? "review"
    : stream.comparison.status;
  return el(
    "article",
    { class: "body-stream", "data-stream-id": stream.id },
    el(
      "strong",
      {},
      `${stream.name} · ${machineDisplayName(stream.machine)}${stream.metric === "bodyweight" ? "" : ` · ${stream.unit}`}`,
    ),
    stream.role
      ? el(
          "p",
          { class: "muted" },
          stream.role === "primary"
            ? "主要關聯"
            : "協同關聯 · 不獨立判定此肌群進步",
        )
      : null,
    el(
      "p",
      { class: "body-stream-status", "data-tone": status },
      PROGRESS_LABELS[status],
    ),
    el("p", { class: "muted" }, stream.comparison.reason),
    el("div", { class: "body-pair" }, stream.pair.map(recordEvidence)),
  );
}
