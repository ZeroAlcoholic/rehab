import { buildBodyInsights } from "../domain/body-insights.js";
import { el, button, field, select } from "./dom.js";
import { REGION_PATHS } from "./body-geometry.js";
import { drawBody } from "./body-drawing.js";
import { createBodyControls } from "./body-controls.js";
import {
  createRegionList,
  createRanking,
  regionValue,
} from "./body-regions.js";
import { renderBodyDetail, renderBodyFocus } from "./body-detail.js";
const MODES = [
  ["session", "本次訓練"],
  ["coverage", "期間累積"],
  ["progress", "可比進步"],
];
const LEGENDS = {
  session: [
    ["primary", "主要訓練"],
    ["support", "協同參與"],
    ["none", "無相關紀錄"],
  ],
  coverage: [
    ["low", "主要 1–4 組"],
    ["medium", "主要 5–9 組"],
    ["high", "主要 10+ 組"],
    ["support", "僅協同"],
    ["none", "無紀錄"],
  ],
  progress: [
    ["improving", "↑ 進步"],
    ["stable", "→ 持平"],
    ["declining", "↓ 下降"],
    ["mixed", "↕ 不一致"],
    ["review", "! 需檢視"],
    ["insufficient", "— 不足"],
  ],
};
export function createBodyMap(
  exercises,
  {
    regionId = "chest",
    view = "front",
    skeleton = "false",
    mode = "coverage",
    date = "",
    recordId = "",
    streamId = "",
    display = "diagram",
    focusOpen = "false",
    rankingOpen = "false",
    onExercise = () => {},
    onFindEquipment,
    rehabRegions = [],
  } = {},
) {
  const root = el("div", { id: "body-map", class: "body-map" });
  if (!MODES.some(([id]) => id === mode)) mode = "coverage";
  if (!REGION_PATHS[view]) view = "front";
  if (!["diagram", "list"].includes(display)) display = "diagram";
  let showSkeleton = skeleton === "true",
    model,
    focusPanel,
    rankingPanel;
  const canvas = el("div", { class: "body-canvas" }),
    regionList = el("div"),
    detail = el("div", {
      id: "body-map-detail",
      class: "body-map-detail",
      tabindex: -1,
    });
  const selection = el("div", {
    class: "body-selection",
    "aria-live": "polite",
  });
  const legend = el("div", { class: "body-map-legend" }),
    overview = el("div", { class: "body-map-overview" }),
    ranking = el("div");
  const controls = createBodyControls((next) => {
    ({ date, recordId, streamId } = { date, recordId, streamId, ...next });
    refresh();
  });
  const modeButtons = MODES.map(([id, name]) =>
    button(
      name,
      () => {
        mode = id;
        refresh();
      },
      { "data-mode": id },
    ),
  );
  const front = button("正面", () => changeView("front")),
    back = button("背面", () => changeView("back"));
  const graphic = button("肌群圖", () => {
      display = "diagram";
      drawSelection();
    }),
    list = button("數值清單", () => {
      display = "list";
      drawSelection();
    });
  const toggle = el("input", {
    type: "checkbox",
    checked: showSkeleton,
    onChange: () => {
      showSkeleton = toggle.checked;
      drawSelection();
    },
  });
  const chooser = select([], regionId, {
    "aria-label": "選擇身體部位",
    onChange: (e) => choose(e.target.value),
  });
  const summary = el("p", { class: "body-map-summary", "aria-live": "polite" });
  const anatomyControls = el(
    "div",
    { class: "body-map-toolbar" },
    el("div", { class: "body-view-switch" }, front, back),
    el("label", { class: "skeleton-toggle" }, toggle, "顯示骨架"),
  );
  const showDetail = () => {
    detail.focus({ preventScroll: true });
    detail.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  root.append(
    el(
      "div",
      { class: "body-mode-switch", "aria-label": "人體圖資訊" },
      modeButtons,
    ),
    controls.element,
    summary,
    legend,
    el(
      "div",
      { class: "body-display-switch", "aria-label": "呈現方式" },
      graphic,
      list,
    ),
    anatomyControls,
    el(
      "div",
      { class: "body-map-content" },
      el(
        "div",
        { class: "body-visual" },
        el(
          "div",
          { class: "body-selection-bar" },
          selection,
          button("查看選取部位明細", showDetail, { class: "body-detail-jump" }),
        ),
        canvas,
        regionList,
      ),
      detail,
    ),
    field("選擇身體部位", chooser),
    ranking,
    overview,
    el(
      "details",
      { class: "body-method" },
      el("summary", {}, "如何讀圖與資料限制"),
      el(
        "p",
        { class: "body-map-caption" },
        "顏色依預設動作關聯，未區分左右。主要組數 1–4、5–9、10+ 僅為顯示分級，不是訓練目標。同一組可關聯多區，區域組數不相加。",
      ),
      el(
        "p",
        { class: "body-map-caption" },
        "骨架只供辨識位置。人體比例固定，不以組數推算肌肉大小。疼痛屬於整筆動作紀錄，不代表上色部位受傷。",
      ),
    ),
  );
  function state() {
    Object.assign(root.dataset, {
      regionId,
      view,
      skeleton: String(showSkeleton),
      mode,
      date,
      recordId,
      streamId,
      display,
      focusOpen: String(focusPanel?.open ?? false),
      rankingOpen: String(rankingPanel?.open ?? false),
    });
  }
  function choose(id, keyboard = false) {
    regionId = id;
    if (!REGION_PATHS[view][id]) view = view === "front" ? "back" : "front";
    drawSelection();
    if (keyboard) canvas.querySelector(`[data-region="${id}"]`)?.focus();
  }
  function chooseOverview(id) {
    if (streamId || mode === "session") {
      streamId = "";
      recordId = "";
      if (mode === "session") mode = "coverage";
      refresh();
    }
    choose(id);
    showDetail();
  }
  function changeView(next) {
    view = next;
    if (!REGION_PATHS[view][regionId])
      regionId = view === "front" ? "chest" : "back";
    drawSelection();
  }
  function drawSelection() {
    if (!model.regions.some((r) => r.id === regionId)) regionId = "chest";
    front.setAttribute("aria-pressed", String(view === "front"));
    back.setAttribute("aria-pressed", String(view === "back"));
    graphic.setAttribute("aria-pressed", String(display === "diagram"));
    list.setAttribute("aria-pressed", String(display === "list"));
    canvas.hidden = anatomyControls.hidden = display !== "diagram";
    regionList.hidden = display !== "list";
    canvas.replaceChildren(
      drawBody(model, {
        view,
        mode,
        regionId,
        skeleton: showSkeleton,
        onSelect: choose,
        rehabRegions,
      }),
    );
    for (const b of regionList.querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b.dataset.regionId === regionId));
    const r = model.regions.find((r) => r.id === regionId);
    selection.replaceChildren(
      el("strong", {}, r.name),
      el("span", {}, regionValue(r, mode)),
    );
    detail.replaceChildren(...renderBodyDetail(r, model, mode, onExercise, onFindEquipment));
    chooser.value = regionId;
    state();
  }
  function refresh() {
    const keepFocus = focusPanel ? focusPanel.open : focusOpen === "true",
      keepRanking = rankingPanel ? rankingPanel.open : rankingOpen === "true";
    model = buildBodyInsights(exercises, { mode, date, recordId, streamId, rehabRegions });
    for(const r of model.regions)r.needsAdjustment=rehabRegions.includes(r.id);
    date = model.date;
    recordId = model.recordId;
    streamId = model.streamId;
    for (const b of modeButtons)
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    controls.update(model, mode);
    if (!chooser.options.length)
      chooser.append(
        ...model.regions.map((r) => el("option", { value: r.id }, r.name)),
      );
    summary.textContent =
      mode === "session"
        ? `${date || "尚無日期"} · ${model.recordCount} 筆紀錄`
        : mode === "coverage"
          ? `目前篩選 ${model.recordCount} 筆紀錄 · 色深表示主要關聯組數`
          : `${model.recordCount} 筆紀錄 · 按動作／器材比較最近兩筆`;
    if (model.unmappedCount)
      summary.append(` · ${model.unmappedCount} 筆未指定肌群`);
    legend.replaceChildren(
      ...(rehabRegions.length?[el('span',{class:'adjust-legend'},'◇ 外框：動作需確認')]:[]),
      ...LEGENDS[mode].map(([tone, label]) =>
        el(
          "span",
          {},
          el("i", { "data-tone": tone, "aria-hidden": true }),
          label,
        ),
      ),
    );
    regionList.replaceChildren(createRegionList(model, mode, choose));
    rankingPanel = createRanking(model, choose);
    rankingPanel.open = keepRanking;
    rankingPanel.addEventListener("toggle", state);
    ranking.replaceChildren(rankingPanel);
    ranking.hidden = mode !== "coverage";
    focusPanel = renderBodyFocus(model, chooseOverview);
    focusPanel.open = keepFocus;
    focusPanel.addEventListener("toggle", state);
    overview.replaceChildren(focusPanel);
    drawSelection();
  }
  refresh();
  return root;
}
