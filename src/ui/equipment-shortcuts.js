import { equipmentShortcuts } from "../domain/equipment-shortcuts.js";
import { el } from "./dom.js";

const PRIMARY_LIMIT = 6;

function setSummary(data, metric) {
  const groups = [];
  for (const set of data.sets) {
    const previous = groups.at(-1);
    if (previous?.load === set.load) previous.reps.push(set.reps);
    else groups.push({ load: set.load, reps: [set.reps] });
  }
  return groups
    .map(({ load, reps }) => {
      const amount =
        load === null
          ? "自體重量"
          : `${metric === "assistance" ? "輔助 " : ""}${load} ${data.unit}`;
      return `${amount} · ${reps.join(" / ")}`;
    })
    .join("　");
}

function shortcutButton(shortcut, onSelect) {
  return el(
    "button",
    {
      type: "button",
      class: "equipment-shortcut",
      onClick: () => onSelect(shortcut.record),
      "aria-label": `記錄 ${shortcut.name}，${shortcut.machine}`,
    },
    el("strong", {}, shortcut.name),
    el("span", { class: "equipment-name" }, shortcut.machine),
    el(
      "span",
      { class: "equipment-last" },
      `上次 ${setSummary(shortcut.record.data, shortcut.metric)}`,
    ),
    el("small", {}, shortcut.record.data.date),
  );
}

export function renderEquipmentShortcuts(container, records, { onSelect }) {
  const shortcuts = equipmentShortcuts(records);
  if (!shortcuts.length) {
    container.replaceChildren(
      el(
        "p",
        { class: "equipment-empty" },
        "第一次從「其他器材」記錄；之後會在這裡直接選器材。",
      ),
    );
    return;
  }
  const primary = shortcuts.slice(0, PRIMARY_LIMIT);
  const additional = shortcuts.slice(PRIMARY_LIMIT);
  const more = additional.length
    ? el(
        "details",
        { class: "equipment-more" },
        el("summary", {}, `其他已記錄器材（${additional.length}）`),
        el(
          "div",
          { class: "equipment-more-grid" },
          additional.map((shortcut) => shortcutButton(shortcut, onSelect)),
        ),
      )
    : null;
  container.replaceChildren(
    ...primary.map((shortcut) => shortcutButton(shortcut, onSelect)),
    more,
  );
}
