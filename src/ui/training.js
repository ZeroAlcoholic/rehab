import { qualityEditor, machineDisplayName } from "./record-quality.js";
import { EXERCISES } from "../domain/catalog.js";
import { exerciseIllustration } from './exercise-illustration.js';
import { weightBasisLabel } from './training-sets.js';
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

export function openTraining({ data = null, reference = null, editing = false, repeating = false, quick = false, onSave }) {
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
  const progress = el('p', {class:'set-progress', role:'status'});
  function updateProgress() {
    const complete = [...rows.children].filter(row =>
      [...row.querySelectorAll('input')].every(input => input.disabled || (input.value !== '' && input.validity.valid)),
    ).length;
    progress.textContent = `已填 ${complete} / ${rows.children.length} 組`;
  }
  form.addEventListener('input', updateProgress);
  let sets = initial.sets.map((s) => ({ ...s }));
  // Keep the reference attached to its original row when a set is removed.
  let references = sets.map((_, i) => reference?.sets[i] ?? null);
  const matchesReference = () => reference &&
    exercise.value === reference.exerciseId && machine.value === reference.machine && unit.value === reference.unit &&
    quality.context().loadBasis === (reference.loadBasis ?? '') &&
    quality.context().posture === (reference.posture ?? '');
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
    const loadLabel = metric === 'bodyweight' ? '自重' :
      `${metric === 'assistance' ? '輔助' : quality.context().loadBasis === 'added_plates' ? '掛片' : '重量'}（${unit.value}）`;
    hint.textContent =
      metric === "assistance"
        ? "請填輔助重量；同條件下，較少輔助才可能代表進步。"
        : metric === "bodyweight"
          ? (exercise.value==='abdominal_bracing'?"每次自然呼吸算 1 次；不憋氣。":"自體重量動作記錄次數；不以體重計算訓練量。")
          : "每組可填不同重量。比較進步時，會檢查機台與各組條件。";
    rows.replaceChildren(
      ...sets.map((s, i) => {
        const previous = matchesReference() ? references[i] : null;
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
          field(loadLabel, load),
          field("次數", reps),
          button(
            "移除",
            () => {
              capture();
              sets.splice(i, 1);
              references.splice(i, 1);
              drawSets();
            },
            {
              class: "quiet",
              disabled: sets.length === 1,
              "aria-label": `移除第 ${i + 1} 組`,
            },
          ),
          previous ? el('div',{class:'set-reference'},
            el('span',{},`前次 ${previous.load === null ? '自體重量' : `${metric === 'assistance' ? '輔助 ' : ''}${previous.load} ${reference.unit}`} × ${previous.reps}`),
            button(`同前次 ${previous.reps} 次`,()=>{
              reps.value = previous.reps;
              reps.dispatchEvent(new Event('input',{bubbles:true}));
            },{class:'secondary','aria-label':`第 ${i+1} 組同前次 ${previous.reps} 次`})) : null,
        );
      }),
    );
    updateProgress();
  }
  exercise.addEventListener("change", () => {
    capture();
    drawSets();
  });
  for (const input of [machine, unit]) input.addEventListener('input',()=>{capture();drawSets();});
  quality.element.addEventListener('input',()=>{capture();drawSets();});
  drawSets();
  const setup = el(
      "div",
      { class: "form-grid" },
      field("日期", date),
      field("時間（台灣時間，選填）", time),
      field("動作", exercise),
      field("機台／場地識別", machine),
      field("單位", unit),
    );
  if (quick) setup.append(hint);
  const identityContext = () => [
    el('span',{},`${date.value} · ${unit.value}`),
    reference ? el('span',{},matchesReference() ? `前次 ${reference.date}` : '已變更條件，請確認重量') : null,
    quality.context().loadBasis === 'added_plates' ? el('span',{},weightBasisLabel({exerciseId:exercise.value,...quality.context()})) : null,
  ];
  form.append(
    ...(quick ? [el('div',{class:'training-identity'},
      exerciseIllustration(initial.exerciseId),
      el('div',{},el('strong',{},EXERCISES.find(e=>e.id===initial.exerciseId).name),
        el('p',{class:'training-machine'},machineDisplayName(initial.machine)),
        el('p',{class:'training-context muted'},identityContext())))] : []),
    quick ? el('details',{class:'training-setup'},el('summary',{},'日期與器材設定'),setup) : setup,
    ...(repeating && !quick ? [el("p", {class:"muted"}, "填本次次數，或逐組點「同前次」。")] : []),
    ...(!quick ? [hint] : []),
    rows,
    button(
      "增加一組",
      () => {
        capture();
        sets.push({ load: sets.at(-1)?.load ?? null, reps: null });
        references.push(null);
        drawSets();
      },
      { class: "secondary" },
    ),
    el('details',{class:'training-observations',open:editing && (initial.pain!=='unknown'||initial.technique!=='unknown'||Boolean(initial.note))},
      el('summary',{},'感受與備註（選填）'),
      el('div',{class:'form-grid'},field('疼痛',pain),field('動作狀況',technique)),
      field('備註',note)),
    quality.element,
    el('div',{class:'training-save'},progress,el("button", { type: "submit", class: "primary wide" }, "儲存紀錄")),
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
  function updateIdentity() {
    const identity = form.querySelector('.training-identity');
    if (!identity) return;
    identity.querySelector('svg').replaceWith(exerciseIllustration(exercise.value));
    identity.querySelector('strong').textContent = EXERCISES.find(e=>e.id===exercise.value).name;
    identity.querySelector('.training-machine').textContent = machineDisplayName(machine.value);
    identity.querySelector('.training-context').replaceChildren(...identityContext().filter(Boolean));
  }
  for (const input of [exercise,machine,unit,date]) input.addEventListener('input', updateIdentity);
  quality.element.addEventListener('input', updateIdentity);
  // Only actual form changes need a discard confirmation; saving closes normally.
  const values = () => JSON.stringify([...form.querySelectorAll('input,select,textarea')].map(n=>[n.value,n.checked]));
  const baseline = values();
  function guardClose(event) {
    if (values() !== baseline && !confirm('尚未儲存這次輸入，確定捨棄？')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  view.dialog.addEventListener('cancel',guardClose);
  view.dialog.querySelector('.dialog-header button').addEventListener('click',guardClose,true);
}
