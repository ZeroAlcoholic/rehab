import { qualityEditor } from "./record-quality.js";
import { EXERCISES } from "../domain/catalog.js";
import {
  el,
  button,
  field,
  select,
  modal,
  submit,
  localDate,
  numberInput,
} from "./dom.js";

export function openTraining({ data = null, editing = false, repeating = false, quick = false, onSave }) {
  const view = modal(editing ? "修改訓練" : "記一筆訓練"),
    form = el("form");
  const quality = qualityEditor("training", data ?? {});
  const initial = data ?? {
    date: localDate(),
    exerciseId: "chest_press",
    machine: "",
    unit: "kg",
    sets: [{ load: null, reps: null }],
    pain: "unknown",
    technique: "unknown",
    note: "",
  };
  const exercise = select(
    EXERCISES.map((e) => [e.id, e.name]),
    initial.exerciseId,
  );
  const date = el("input", {
    type: "date",
    required: true,
    value: initial.date,
  });
  const time = el("input", { type: "time", value: initial.time ?? "" });
  const machine = el("input", {
    type: "text",
    maxlength: 120,
    value: initial.machine,
    placeholder: "例如：A 館胸推 02",
  });
  const unit = select(
    [
      ["kg", "kg"],
      ["lb", "lb"],
    ],
    initial.unit,
  );
  const pain = select(
    [
      ["unknown", "未記錄"],
      ["none", "無痛"],
      ["mild", "輕微"],
      ["significant", "明顯"],
    ],
    initial.pain,
  );
  const technique = select(
    [
      ["unknown", "未記錄"],
      ["stable", "穩定"],
      ["corrected", "已修正"],
      ["compensation", "有代償"],
      ["failed", "未完成"],
    ],
    initial.technique,
  );
  const note = el(
    "textarea",
    {
      "aria-label": "備註",
      rows: 3,
      maxlength: 10000,
      placeholder: "例如：最後一組手肘外開",
    },
    initial.note,
  );
  const rows = el("div", { class: "set-list" }),
    hint = el("p", { class: "muted" });
  let sets = initial.sets.map((s) => ({ ...s }));
  const currentMetric = () =>
    EXERCISES.find((e) => e.id === exercise.value).metric;
  function capture() {
    sets = [...rows.children].map((row) => ({
      load:
        row.querySelector("[data-load]").value === ""
          ? null
          : Number(row.querySelector("[data-load]").value),
      reps:
        row.querySelector("[data-reps]").value === ""
          ? null
          : Number(row.querySelector("[data-reps]").value),
    }));
  }
  function drawSets() {
    const metric = currentMetric();
    hint.textContent =
      metric === "assistance"
        ? "請填輔助重量；同條件下，較少輔助才可能代表進步。"
        : metric === "bodyweight"
          ? (exercise.value==='abdominal_bracing'?"每次自然呼吸算 1 次；不憋氣。":"自體重量動作記錄次數；不以體重計算訓練量。")
          : "每組可填不同重量。比較進步時，會檢查機台與各組條件。";
    rows.replaceChildren(
      ...sets.map((s, i) => {
        const load = numberInput(s.load, {
          "data-load": "",
          "aria-label": `第 ${i + 1} 組重量`,
          required: metric !== "bodyweight",
          disabled: metric === "bodyweight",
        });
        const reps = numberInput(s.reps, {
          "data-reps": "",
          "aria-label": `第 ${i + 1} 組次數`,
          required: true,
          min: 1,
          step: 1,
          inputmode: "numeric",
        });
        return el(
          "div",
          { class: "set-row" },
          el("span", { class: "set-number" }, String(i + 1).padStart(2, "0")),
          field(metric === "assistance" ? "輔助重量" : "重量", load),
          field("次數", reps),
          button(
            "移除",
            () => {
              capture();
              sets.splice(i, 1);
              drawSets();
            },
            {
              class: "quiet",
              disabled: sets.length === 1,
              "aria-label": `移除第 ${i + 1} 組`,
            },
          ),
        );
      }),
    );
  }
  exercise.addEventListener("change", () => {
    capture();
    drawSets();
  });
  drawSets();
  form.append(
    ...(repeating ? [el("p", {class:"muted"}, quick ? "已帶入器材、重量與組數；請填本次實際次數。" : "已帶入上次數值，請改成這次實際完成的組數與次數。")] : []),
    el(
      "div",
      { class: "form-grid" },
      field("日期", date),
      field("時間（台灣時間，選填）", time),
      field("動作", exercise),
      field("機台／場地識別", machine),
      field("單位", unit),
    ),
    hint,
    rows,
    button(
      "增加一組",
      () => {
        capture();
        sets.push({ ...sets.at(-1) });
        drawSets();
      },
      { class: "secondary" },
    ),
    el('details',{class:'training-observations',open:editing && (initial.pain!=='unknown'||initial.technique!=='unknown'||Boolean(initial.note))},
      el('summary',{},'感受與備註（選填）'),
      el('div',{class:'form-grid'},field('疼痛',pain),field('動作狀況',technique)),
      field('備註',note)),
    quality.element,
    el("button", { type: "submit", class: "primary wide" }, "儲存紀錄"),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    capture();
    submit(view, () =>
      onSave({
        ...quality.value(),
        date: date.value,
        ...(time.value || initial.time !== undefined ? {time: time.value} : {}),
        exerciseId: exercise.value,
        machine: machine.value,
        unit: unit.value,
        sets: sets.map((s) => ({
          ...s,
          load: currentMetric() === "bodyweight" ? null : s.load,
        })),
        pain: pain.value,
        technique: technique.value,
        note: note.value,
      }),
    );
  });
  view.body.append(form);
}
