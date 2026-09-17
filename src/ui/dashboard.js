import { renderBodyComposition } from "./body-composition.js";
import { el, button } from "./dom.js";
import { sessionPerformance } from "../domain/analytics.js";
import { streamEvidence } from "./training-evidence.js";
import { createBodyMap } from "./body-map.js";
import { renderRehab, renderRehabAlert } from './rehab-panel.js';

const statusLabels = {
  review: "需檢視",
  improving: "進步",
  stable: "持平",
  declining: "下降",
  insufficient: "資料不足",
  mixed: "變化不一致",
};
function section(index, title, sub) {
  return el(
    "section",
    { class: "dashboard-section", id: {'01':'overview','02':'movement','03':'progress','04':'composition'}[index.slice(0,2)] ?? `section-${index.slice(0,2)}` },
    el(
      "div",
      { class: "section-title" },
      el("span", { class: "eyebrow", 'aria-hidden':true }, index.slice(0,2)),
      el("h2", {}, title),
    ),
    el("p", { class: "muted" }, sub),
  );
}
export function renderDashboard(container, analysis, rehabActions={}) {
  const previousMap = container.querySelector("#body-map");
  const expandedExercises = new Set([...container.querySelectorAll(".performance[open]")].map(node=>node.dataset.exerciseId));
  const timeline = analysis.timeline.filter(day=>day.trainingCount||day.inbodyCount||day.excludedCount);
  const now = section(
    "01 / NOW",
    "訓練總覽",
    "這段時間，累積的每一次練習。",
  );
  now.append(
    el(
      "div",
      { class: "stats" },
      el(
        "div",
        {},
        el("strong", {}, analysis.trainingCount),
        el("span", {}, "動作紀錄"),
      ),
      el(
        "div",
        {},
        el("strong", {}, analysis.inbodyCount),
        el("span", {}, "InBody 紀錄"),
      ),
      el(
        "div",
        {},
        el("strong", {}, analysis.coverage.filter((p) => p.count > 0).length),
        el("span", {}, "動作類型"),
      ),
    ),
  );
  if (timeline.length)
    now.append(
      el(
        "details",
        { class: "training-timeline" },
        el("summary", {}, `${timeline[0].date} → ${timeline.at(-1).date} · 查看日期`),
        analysis.excludedTrainingCount ? el('small',{class:'muted'},'訓練統計不含暖身；完整紀錄保留於紀錄庫。') : null,
        timeline.map((day) =>
          el(
            "p",
            {},
            `${day.date} · 工作訓練 ${day.trainingCount} 筆 · InBody ${day.inbodyCount} 筆${day.excludedCount ? ` · 暖身／排除 ${day.excludedCount} 筆` : ""}`,
          ),
        ),
      ),
    );
  const landscape = section(
    "02 / MOVEMENT",
    "身體訓練地圖",
    "點選肌群，查看相關訓練與變化。",
  );
  landscape.append(
    createBodyMap(analysis.exercises, {
      ...(previousMap?.dataset ?? {}),
      rehabRegions:analysis.rehab.regions,
      onExercise(id) {
        const target = container.querySelector(`[data-exercise-id="${id}"]`);
        if (target) {
          target.open = true;
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      },
    }),
    el(
      "details",
      { class: "movement-breakdown" },
      el("summary", {}, "查看動作類型覆蓋"),
      el(
        "div",
        { class: "coverage-grid" },
        analysis.coverage.map((p) =>
          el(
            "div",
            { class: `coverage ${p.count ? "covered" : ""}` },
            el("span", {}, p.name),
            el("strong", {}, p.count ? `${p.count} 筆` : "尚無資料"),
          ),
        ),
      ),
    ),
  );
  const performance = section(
    "03 / PERFORMANCE",
    "訓練進程",
    "展開動作，查看最近兩次的表現。",
  );
  if (!analysis.exercises.length)
    performance.append(
      el("p", { class: "empty" }, "至少記錄一次訓練後，這裡才會出現動作。"),
    );
  for (const group of analysis.exercises) {
    const last = group.sessions.at(-1),
      details = el("details", { class: "performance", open: expandedExercises.has(group.exerciseId) });
    details.dataset.exerciseId = group.exerciseId;
    details.append(
      el(
        "summary",
        {},
        el("strong", {}, group.name),
        el(
          "span",
          {
            class: `badge ${group.comparison.flagged ? "review" : group.comparison.status}`,
          },
          statusLabels[
            group.comparison.flagged ? "review" : group.comparison.status
          ] ?? group.comparison.status,
        ),
      ),
      el("p", {}, group.comparison.reason),
    );
    if (group.comparison.flagged)
      details.append(
        el("p", { class: "flag" }, "疼痛或動作資訊需留意，不能只看重量變化。"),
      );
    details.append(
      el(
        "p",
        { class: "body-evidence-count" },
        `${group.comparison.comparedCount} / ${group.comparison.totalCount} 個動作／器材組別可比`,
      ),
      ...group.streams.map(stream=>{
        const evidence=streamEvidence(stream);
        if(rehabActions.onRepeat && stream.sessions.length)evidence.append(button('再記一次',()=>rehabActions.onRepeat(stream.sessions.at(-1)),{class:'secondary'}));
        return evidence;
      }),
    );
    details.append(
      el(
        "details",
        { class: "session-list" },
        el("summary", {}, `查看全部 ${group.sessions.length} 筆紀錄`),
        [...group.sessions].reverse().map((s) => {
          const performance = sessionPerformance(s.data);
          return el(
            "div",
            {},
            el(
              "p",
              {},
              `${s.data.date} · ${s.data.machine || "未指定機台"} · ${s.data.sets.map((set) => `${set.load ?? "自重"}${set.load === null ? "" : s.data.unit} × ${set.reps}`).join(" / ")}`,
            ),
            el(
              "p",
              { class: "muted" },
              `總次數 ${performance.totalReps}${performance.volume === null ? "" : ` · 訓練量 ${performance.volume} ${performance.unit}·次`}`,
            ),
          );
        }),
      ),
    );
    if (last) performance.append(details);
  }
  const body = section(
    "04 / BODY",
    "身體組成",
    "最近一次量測，以及長期的變化。",
  );
  body.append(...renderBodyComposition(analysis));
  const context = section(
    "05 / CONTEXT",
    "疼痛與動作紀錄",
    "依你填寫的狀況顯示，不推測復健成效。",
  );
  context.append(
    el(
      "div",
      { class: "context-list" },
      el("p", {}, `有疼痛紀錄：${analysis.context.painCount} 筆`),
      el("p", {}, `有動作事件：${analysis.context.techniqueCount} 筆`),
    ),
  );
  const next = section(
    "06 / NEXT",
    "下一步記錄重點",
    "固定規則產生的資料提示。",
  );
  next.append(
    el(
      "ul",
      {},
      analysis.next.map((text) => el("li", {}, text)),
    ),
  );
  const extraOpen = container.querySelector('.supporting-info')?.open ?? false;
  const extra = el('details', {class:'supporting-info',open:extraOpen},
    el('summary',{},`疼痛與記錄提醒${analysis.context.painCount ? ` · ${analysis.context.painCount} 筆疼痛` : ''}`), context, next);
  const rehab=renderRehab(analysis.rehab,{...rehabActions,trendOpen:container.querySelector('.rehab-trend')?.open??false,optionsOpen:container.querySelector('.rehab-options')?.open??false});
  const alert=renderRehabAlert(analysis.rehab);
  container.replaceChildren(now,...(alert?[alert]:[]),landscape,performance,body,rehab,extra);
}
