import test from "node:test";
import assert from "node:assert/strict";
import { equipmentShortcuts } from "../src/domain/equipment-shortcuts.js";

const record = (recordId, date, exerciseId, machine, extra = {}) => ({
  kind: "training",
  recordId,
  createdAt: `${date}T12:00:00.000Z`,
  data: {
    date,
    exerciseId,
    machine,
    unit: "lb",
    sets: [{ load: 20, reps: 10 }],
    ...extra,
  },
});

test("equipment shortcuts keep one latest record per exact stream and put recent equipment first", () => {
  const result = equipmentShortcuts([
    record("old-a", "2026-09-01", "chest_press", "胸推 A"),
    record("new-a", "2026-09-17", "chest_press", "胸推 A"),
    record("row", "2026-09-16", "seated_row", "划船 A"),
    record("excluded", "2026-09-18", "lat_pulldown", "待核對", {
      analysisExcludedReason: "資料待核對",
    }),
    record("reviewed", "2026-09-18", "leg_extension", "器材待核對", {
      review: { machine: "型號待核對" },
    }),
    { kind: "inbody", recordId: "body", data: { date: "2026-09-18" } },
  ]);
  assert.deepEqual(
    result.map(({ record }) => record.recordId),
    ["new-a", "row"],
  );
});

test("same-day equipment order is stable by exercise catalog then machine", () => {
  const result = equipmentShortcuts([
    record("row", "2026-09-17", "seated_row", "划船 A"),
    record("press-b", "2026-09-17", "chest_press", "胸推 B"),
    record("press-a", "2026-09-17", "chest_press", "胸推 A"),
  ]);
  assert.deepEqual(
    result.map(({ record }) => record.recordId),
    ["press-a", "press-b", "row"],
  );
});
