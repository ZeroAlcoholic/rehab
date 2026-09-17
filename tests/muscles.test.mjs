import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMuscles, EXERCISE_REGIONS } from "../src/domain/muscles.js";
import { EXERCISES } from "../src/domain/catalog.js";
import { analyze } from "../src/domain/analytics.js";

const record = (id, date, exerciseId = "chest_press", overrides = {}) => ({
  recordId: id,
  eventId: id,
  kind: "training",
  data: {
    date,
    exerciseId,
    machine: "A",
    unit: "kg",
    sets: [
      { load: 30, reps: 12 },
      { load: 30, reps: 10 },
    ],
    pain: "none",
    technique: "stable",
    note: "",
    ...overrides,
  },
});
test("empty body map has no inferred coverage or symptoms", () => {
  const result = summarizeMuscles([]);
  assert.ok(result.regions.length >= 8);
  assert.ok(
    result.regions.every(
      (r) => r.recordCount === 0 && r.setCount === 0 && r.painCount === 0,
    ),
  );
});
test("chest press covers associated regions without turning exercise pain into a localized injury", () => {
  const data = analyze([
    record("one", "2026-09-16", "chest_press", { pain: "significant" }),
  ]);
  const result = summarizeMuscles(data.exercises),
    chest = result.regions.find((r) => r.id === "chest"),
    calves = result.regions.find((r) => r.id === "calves");
  assert.equal(chest.recordCount, 1);
  assert.equal(chest.setCount, 2);
  assert.equal(chest.painCount, 1);
  assert.equal(chest.exercises[0].exerciseId, "chest_press");
  assert.equal(calves.recordCount, 0);
  assert.equal(result.regions.find((r) => r.id === "triceps").recordCount, 1);
});
test("body map follows the same date range and counts missing context separately", () => {
  const data = analyze(
    [
      record("old", "2020-01-01", "calf_raise"),
      record("new", "2026-09-16", "chest_press", {
        pain: "unknown",
        technique: "unknown",
      }),
    ],
    { from: "2026-09-01", to: "2026-09-30" },
  );
  const result = summarizeMuscles(data.exercises),
    chest = result.regions.find((r) => r.id === "chest");
  assert.equal(result.regions.find((r) => r.id === "calves").recordCount, 0);
  assert.equal(chest.unknownCount, 1);
  assert.equal(chest.painCount, 0);
  assert.equal(chest.techniqueCount, 0);
});
test("every offered exercise has an explicit mapping and new unknown exercises remain unclassified", () => {
  assert.ok(EXERCISES.every((e) => Array.isArray(EXERCISE_REGIONS[e.id])));
  const result = summarizeMuscles([
    {
      exerciseId: "new-exercise",
      name: "Unknown",
      sessions: [record("one", "2026-09-16")],
    },
  ]);
  assert.equal(result.unmappedCount, 1);
  assert.ok(result.regions.every((r) => r.recordCount === 0));
});
