import { displayRecordText } from './record-quality.js';
import { el } from "./dom.js";
const CORE = [
  "weight",
  "skeletal_muscle_mass",
  "body_fat_mass",
  "body_fat_percentage",
  "fat_free_mass",
  "bmi",
];
const round = (n) => Number(n.toFixed(2));
function historyChart(points, label) {
  const ns = "http://www.w3.org/2000/svg";
  const node = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svg = node("svg", {
    viewBox: "0 0 300 100",
    role: "img",
    "aria-label": `${label}可比較量測值折線`,
  });
  const values = points.map((p) => p.value),
    min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || 1;
  const times = points.map((p) => Date.parse(p.date)),
    start = Math.min(...times),
    duration = Math.max(...times) - start || 1;
  const coords = points.map((p, i) => [
    48 + ((times[i] - start) / duration) * 234,
    72 - ((p.value - min) / span) * 50,
  ]);
  svg.append(
    node(
      "text",
      { x: 2, y: 25, fill: "var(--muted)", "font-size": 11 },
      String(max),
    ),
    node(
      "text",
      { x: 2, y: 75, fill: "var(--muted)", "font-size": 11 },
      String(min),
    ),
    node("path", { d: "M44 20V76H287", stroke: "var(--line)", fill: "none" }),
    node("polyline", {
      points: coords.map((c) => c.join(",")).join(" "),
      stroke: "var(--chart)",
      "stroke-width": 2,
      fill: "none",
    }),
  );
  coords.forEach(([cx, cy], i) => {
    const c = node("circle", { cx, cy, r: 3.5, fill: "var(--chart)" });
    c.append(node("title", {}, `${points[i].date}：${points[i].value}`));
    svg.append(c);
  });
  svg.append(
    node(
      "text",
      { x: 48, y: 96, fill: "var(--muted)", "font-size": 10 },
      points[0].date,
    ),
    node(
      "text",
      { x: 286, y: 96, "text-anchor": "end", fill: "var(--muted)", "font-size": 10 },
      points.at(-1).date,
    ),
  );
  return svg;
}
function metricCard(series) {
  const raw = series.observations,
    last = raw.at(-1),
    valid = series.points,
    first = valid[0],
    current = valid.at(-1);
  const card = el(
    "article",
    { class: "metric-card", "data-metric": series.id },
    el("h3", {}, series.label),
    el("strong", {}, `${last.value} `, el("small", {}, series.unit)),
    el("p", { class: "muted" }, `${last.date}${last.time ? ` ${last.time}` : ""}`),
  );
  if (last.review)
    card.append(el("p", { class: "flag" }, "此值不計入變化"));
  if (last.excluded) card.append(el("p",{class:"flag"},`不納入變化：${last.excluded}`));
  if (valid.length >= 2) {
    const delta = round(current.value - first.value);
    card.append(
      el(
        "p",
        {},
        `起點至最近可比較值：${delta > 0 ? "+" : ""}${delta} ${series.unit === "%" ? "個百分點" : series.unit}`,
      ),
      el("p", { class: "muted" }, `${first.date} → ${current.date}`),
      el("p", {}, `前次可用值至本次：${series.change.previousDelta > 0 ? "+" : ""}${round(series.change.previousDelta)} ${series.unit === "%" ? "個百分點" : series.unit}`),
      el("p", {class:"muted"}, `${valid.at(-2).date} → ${current.date} · 相隔 ${series.change.daysSincePrevious} 天`),
    );
  } else card.append(el("p", { class: "muted" }, "尚無兩筆可比較數值"));
  if (valid.length >= 2) card.append(historyChart(valid, series.label));
  card.append(el("p",{class:"muted"}, `${series.change.measurementDays} 個量測日期 · ${series.change.measurementDays < 2 ? "單日快照" : series.change.measurementDays < 3 ? "前後變化，尚不足長期趨勢" : "歷次量測走勢，仍需核對量測條件"}`));
  if (series.deviceChanged) card.append(el("p",{class:"flag"},"量測機型／地點曾改變；差值僅供對照，請核對可比性。"));
  if (series.unverifiedPoints.length)
    card.append(
      el(
        "p",
        { class: "flag" },
        `${series.unverifiedPoints.length} 筆僅保留量測值`,
      ),
    );
  const history = el(
    "details",
    {},
    el("summary", {}, `查看 ${raw.length} 次量測`),
    raw.map((p) =>
      el(
        "p",
        {},
        `${p.date}${p.time ? ` ${p.time}` : ""}：${p.value} ${series.unit}${p.review ? " · 不計入變化" : ""}${p.excluded ? ` · 排除：${p.excluded}` : ""}`,
      ),
    ),
  );
  card.append(history);
  return card;
}
function segmental(analysis) {
  const latest = analysis.inbodyRecords.at(-1);
  if (!latest) return null;
  const metrics = latest.data.metrics;
  const pairs = [
    ["手臂", "segmental_left_arm", "segmental_right_arm"],
    ["腿部", "segmental_left_leg", "segmental_right_leg"],
  ];
  if (!pairs.some(([, a, b]) => metrics[a] != null || metrics[b] != null))
    return null;
  const root = el(
    "article",
    { class: "segmental-panel" },
    el("h3", {}, "部位 Lean · 左右並列"),
    el(
      "p",
      { class: "muted" },
      `${latest.data.date} · 原報告部位除脂量，不等同單塊肌肉大小或肌力`,
    ),
  );
  for (const [name, a, b] of pairs) {
    const max = Math.max(1, metrics[a] ?? 0, metrics[b] ?? 0);
    const group = el("div", { class: "segmental-group" }, el("h4", {}, name));
    for (const [side, key] of [
      ["左", a],
      ["右", b],
    ])
      group.append(
        el(
          "div",
          { class: "segmental-row" },
          el("span", {}, side),
          el(
            "div",
            { class: "segmental-track", "aria-hidden": true },
            metrics[key] == null
              ? null
              : el("i", { style: `width:${(metrics[key] / max) * 100}%` }),
          ),
          el(
            "span",
            {},
            metrics[key] == null
              ? "缺少數值"
              : `${metrics[key]} kg${latest.data.review?.[key] ? " · 僅供瀏覽" : ""}`,
          ),
        ),
      );
    root.append(group);
  }
  root.append(
    el(
      "p",
      { class: "muted" },
      "同一部位左右共用尺度；手臂與腿部分別縮放。百分比是報告參考比，不是左右肌力分數。",
    ),
  );
  return root;
}
export function renderBodyComposition(analysis) {
  const available = analysis.bodyComposition.filter(
    (s) => s.observations.length,
  );
  if (!available.length)
    return [el("p", { class: "empty" }, "新增 InBody 數值後，在此查看紀錄。")];
  const core = el(
    "div",
    { class: "body-grid" },
    CORE.map((id) => available.find((s) => s.id === id))
      .filter(Boolean)
      .map(metricCard),
  );
  const other = el(
    "details",
    { class: "other-body-metrics" },
    el("summary", {}, "其他報告值：評分、水分、代謝與部位參考比"),
    el(
      "div",
      { class: "body-grid" },
      available.filter((s) => !CORE.includes(s.id)).map(metricCard),
    ),
  );
  const reports = el(
    "details",
    { class: "body-report-notes" },
    el("summary", {}, "量測條件、原始備註與資料來源"),
    analysis.inbodyRecords.map((r) =>
      el(
        "article",
        {},
        el("h4", {}, `${r.data.date}${r.data.time ? ` ${r.data.time}（台灣時間）` : ""}`),
        el("p",{class:"muted"},displayRecordText(r.data.measurementContext?.device) || "未記錄量測機型／地點"),
        el("p",{class:"source-text"},displayRecordText(r.data.measurementContext?.conditions) || "未記錄量測條件"),
        displayRecordText(r.data.source) ? el("p", { class: "muted" }, displayRecordText(r.data.source)) : null,
        el("p", { class: "source-text" }, displayRecordText(r.data.note) || "未提供量測條件"),
      ),
    ),
  );
  return [
    el(
      "p",
      { class: "muted" },
      `${analysis.inbodyRecords.length} 次量測 · 保留完整量測歷程`,
    ),
    core,
    segmental(analysis),
    other,
    reports,
    el('details',{class:'body-method'},el('summary',{},'如何比較量測'),el('p',{class:'muted'},'依實際日期呈現，不補未量測的數值。量測時段、水分與運動條件需一致才適合追蹤。')),
  ].filter(Boolean);
}
