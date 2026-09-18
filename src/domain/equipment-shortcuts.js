import { EXERCISES } from "./catalog.js";
import { compareRecordOrder } from "./records.js";
import { trainingStreamId } from "./training-streams.js";

const exerciseOrder = new Map(
  EXERCISES.map((exercise, index) => [exercise.id, index]),
);

export function equipmentShortcuts(records) {
  const latest = new Map();
  for (const record of records) {
    if (
      record.kind !== "training" ||
      record.data.analysisExcludedReason ||
      ["machine", "unit", "load", "sets"].some(
        (field) => record.data.review?.[field],
      ) ||
      !record.data.machine
    )
      continue;
    const id = trainingStreamId(record.data);
    const current = latest.get(id);
    if (!current || compareRecordOrder(current, record) < 0)
      latest.set(id, record);
  }
  return [...latest.entries()]
    .map(([id, record]) => {
      const exercise = EXERCISES.find(
        (item) => item.id === record.data.exerciseId,
      );
      return {
        id,
        name: exercise.name,
        metric: exercise.metric,
        machine: record.data.machine,
        unit: record.data.unit,
        record,
      };
    })
    .sort(
      (left, right) =>
        right.record.data.date.localeCompare(left.record.data.date) ||
        (right.record.data.time ?? "").localeCompare(
          left.record.data.time ?? "",
        ) ||
        (right.record.createdAt ?? "").localeCompare(
          left.record.createdAt ?? "",
        ) ||
        exerciseOrder.get(left.record.data.exerciseId) -
          exerciseOrder.get(right.record.data.exerciseId) ||
        left.machine.localeCompare(right.machine, "zh-Hant"),
    );
}
