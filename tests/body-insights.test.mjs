import test from "node:test";
import assert from "node:assert/strict";
import { buildBodyInsights } from "../src/domain/body-insights.js";
import { analyze } from "../src/domain/analytics.js";

const r = (
  id,
  date,
  exerciseId = "chest_press",
  machine = "A",
  load = 30,
  overrides = {},
) => ({
  recordId: id,
  eventId: id,
  kind: "training",
  data: {
    date,
    exerciseId,
    machine,
    unit: "kg",
    sets: [
      { load, reps: 12 },
      { load, reps: 10 },
    ],
    pain: "none",
    technique: "stable",
    note: "",
    ...overrides,
  },
});
const model = (records, options = {}) =>
  buildBodyInsights(analyze(records).exercises, options);
const area = (m, id) => m.regions.find((r) => r.id === id);

test("session selection separates primary and assisting muscles, and a single record excludes other work", () => {
  const data = [
    r("a", "2026-09-15"),
    r("b", "2026-09-16"),
    r("c", "2026-09-16", "lat_pulldown"),
  ];
  const m = model(data, { mode: "session", date: "2026-09-16", recordId: "b" });
  assert.equal(area(m, "chest").primarySets, 2);
  assert.equal(area(m, "triceps").primarySets, 0);
  assert.equal(area(m, "triceps").supportSets, 2);
  assert.equal(area(m, "biceps").setCount, 0);
  assert.equal(m.recordCount, 1);
});
test("progress is compared inside equipment streams, never across machines or units", () => {
  const m = model(
    [
      r("1", "2026-09-01"),
      r("2", "2026-09-02", "chest_press", "B", 80),
      r("3", "2026-09-03", "chest_press", "A", 35),
    ],
    { mode: "progress" },
  );
  const a = m.streams.find((s) => s.machine === "A");
  assert.equal(a.comparison.status, "improving");
  assert.deepEqual(
    a.pair.map((r) => r.recordId),
    ["1", "3"],
  );
  assert.equal(area(m, "chest").progress, "mixed"); // B still has insufficient evidence
  const filtered = model(
    [r("1", "2026-09-01"), r("2", "2026-09-03", "chest_press", "A", 35)],
    { mode: "progress" },
  );
  assert.equal(area(filtered, "chest").progress, "improving");
  assert.equal(area(filtered, "triceps").progress, "insufficient"); // secondary association isn't isolated progress
});
test("pain and unknown context cannot paint a muscle as clean improvement", () => {
  const m = model(
    [
      r("1", "2026-09-01"),
      r("2", "2026-09-02", "chest_press", "A", 35, { pain: "mild" }),
    ],
    { mode: "progress" },
  );
  assert.equal(area(m, "chest").progress, "review");
  assert.equal(area(m, "chest").painCount, 1);
});
test("coverage has explicit bins, empty baselines and no muscle size or recovery inference", () => {
  const m = model([r("1", "2026-09-01")]);
  assert.equal(area(m, "chest").coverage, "low");
  assert.equal(area(m, "triceps").coverage, "support");
  assert.ok(m.focus.baseline.some((r) => r.id === "back_thigh"));
  assert.ok(!m.focus.baseline.some((r) => r.id === "chest"));
  assert.equal(area(m, "chest").size, undefined);
  assert.equal(area(m, "chest").recovery, undefined);
  assert.ok(
    model([]).regions.every(
      (r) => r.progress === "insufficient" && r.coverage === "none",
    ),
  );
});
test("stream filtering and assistance direction retain source records", () => {
  const records = [
    r("1", "2026-09-01", "assisted_chinup", "X", 40),
    r("2", "2026-09-02", "assisted_chinup", "X", 33),
    r("3", "2026-09-02"),
  ];
  const all = model(records);
  const streamId = all.streams.find(
    (s) => s.exerciseId === "assisted_chinup",
  ).id;
  const filtered = model(records, { streamId, mode: "progress" });
  assert.equal(filtered.recordCount, 2);
  assert.equal(area(filtered, "back").progress, "improving");
  assert.equal(area(filtered, "chest").recordCount, 0);
  assert.equal(records[0].data.sets[0].load, 40);
});
test("units, incomparable set counts and partial evidence cannot imply complete progress", () => {
  const records = [
    r("a", "2026-09-01"),
    r("b", "2026-09-02", "chest_press", "A", 70, { unit: "lb" }),
  ];
  assert.equal(model(records).streams.length, 2);
  assert.equal(area(model(records), "chest").progress, "insufficient");
  const changed = [
    r("a", "2026-09-01"),
    r("b", "2026-09-02", "chest_press", "A", 40, {
      sets: [{ load: 40, reps: 12 }],
    }),
  ];
  assert.equal(area(model(changed), "chest").progress, "insufficient");
  const scoped = buildBodyInsights(
    analyze([r("a", "2026-08-01"), r("b", "2026-09-02")], {
      from: "2026-09-01",
    }).exercises,
    { mode: "progress" },
  );
  assert.equal(area(scoped, "chest").progress, "insufficient");
  assert.equal(scoped.streams[0].pair.length, 1);
});
test("coverage tiers are deterministic and unknown selection safely resets to actual data", () => {
  const many = [
    r("a", "2026-09-01", "chest_press", "A", 30, {
      sets: Array.from({ length: 5 }, () => ({ load: 30, reps: 10 })),
    }),
  ];
  assert.equal(area(model(many), "chest").coverage, "medium");
  const m = model([
    ...many,
    r("b", "2026-09-02", "chest_press", "A", 30, {
      sets: Array.from({ length: 5 }, () => ({ load: 30, reps: 10 })),
    }),
  ]);
  assert.equal(area(m, "chest").coverage, "high");
  const stale = model(many, {
    mode: "session",
    date: "1999-01-01",
    recordId: "deleted",
    streamId: "removed",
  });
  assert.equal(stale.date, "2026-09-01");
  assert.equal(stale.recordCount, 1);
});
