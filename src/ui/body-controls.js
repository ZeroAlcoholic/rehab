import { el, field, select } from "./dom.js";
// Keep native select elements mounted: changing selection must retain focus.
export function createBodyControls(onChange) {
  const stream = select([], "", {
    "aria-label": "動作／器材",
    onChange: (e) => onChange({ streamId: e.target.value, recordId: "" }),
  });
  const date = select([], "", {
    "aria-label": "訓練日期",
    onChange: (e) => onChange({ date: e.target.value, recordId: "" }),
  });
  const record = select([], "", {
    "aria-label": "單筆紀錄",
    onChange: (e) => onChange({ recordId: e.target.value }),
  });
  const dateField = field("訓練日期", date),
    recordField = field("單筆紀錄", record);
  const element = el(
    "div",
    { class: "body-map-controls" },
    field("動作／器材", stream),
    dateField,
    recordField,
  );
  function options(node, items, value) {
    const signature = JSON.stringify(items);
    if (node.dataset.options !== signature) {
      node.replaceChildren(
        ...items.map(([id, name]) => el("option", { value: id }, name)),
      );
      node.dataset.options = signature;
    }
    node.value = value;
  }
  return {
    element,
    update(model, mode) {
      options(
        stream,
        [
          ["", "全部動作與器材"],
          ...model.streams.map((s) => [
            s.id,
            `${s.name} · ${s.machine || "機台未填"}${s.metric === "bodyweight" ? "" : ` · ${s.unit}`}`,
          ]),
        ],
        model.streamId,
      );
      options(
        date,
        model.dates.length
          ? model.dates.map((d) => [d, d])
          : [["", "尚無紀錄"]],
        model.date,
      );
      options(
        record,
        [
          ["", "當日全部紀錄"],
          ...model.dayRecords.map((r, i) => [
            r.recordId,
            `${i + 1}. ${model.streams.find((s) => s.exerciseId === r.data.exerciseId)?.name} · ${r.data.machine || "機台未填"} · ${r.data.sets.length} 組`,
          ]),
        ],
        model.recordId,
      );
      dateField.hidden = recordField.hidden = mode !== "session";
    },
  };
}
