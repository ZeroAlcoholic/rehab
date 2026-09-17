import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/domain/analytics.js";
import { buildBodyInsights } from "../src/domain/body-insights.js";
import { BODY_REGIONS, MUSCLE_ROLES } from "../src/domain/muscles.js";
import { REGION_PATHS, REGION_LABELS } from "../src/ui/body-geometry.js";
const record = (
  id,
  date,
  exerciseId = "chest_press",
  machine = "A",
  load = 30,
  extra = {},
) => ({
  kind: "training",
  recordId: id,
  eventId: id,
  data: {
    date,
    exerciseId,
    machine,
    unit: "kg",
    sets: [{ load, reps: 12 }],
    pain: "none",
    technique: "stable",
    note: "",
    ...extra,
  },
});
test("dashboard and atlas share exactly the same equipment comparison and evidence counts", () => {
  const a = analyze([
    record("a", "2026-09-01"),
    record("b", "2026-09-02", "chest_press", "B", 90),
    record("c", "2026-09-03", "chest_press", "A", 35),
  ]);
  const map = buildBodyInsights(a.exercises),
    chest = map.regions.find((r) => r.id === "chest");
  assert.equal(a.exercises[0].comparison.status, chest.progress);
  assert.equal(a.exercises[0].comparison.comparedCount, 1);
  assert.equal(a.exercises[0].comparison.totalCount, 2);
  assert.deepEqual(
    a.exercises[0].streams.map((s) => s.comparison),
    map.streams.map((s) => s.comparison),
  );
});
test("filtering an exercise does not manufacture missing training in the next-step overview", () => {
  const exercises = analyze([
    record("a", "2026-09-01"),
    record("b", "2026-09-02", "leg_curl"),
  ]).exercises;
  const all = buildBodyInsights(exercises),
    filtered = buildBodyInsights(exercises, {
      streamId: all.streams.find((s) => s.exerciseId === "chest_press").id,
    });
  assert.deepEqual(filtered.focus, all.focus);
  assert.ok(!filtered.focus.baseline.some((r) => r.id === "back_thigh"));
  assert.equal(
    filtered.regions.find((r) => r.id === "back_thigh").recordCount,
    0,
  );
});
test("first record with pain remains visible in progress even before comparison is possible", () => {
  const m = buildBodyInsights(
    analyze([
      record("a", "2026-09-01", "chest_press", "A", 30, {
        pain: "significant",
      }),
    ]).exercises,
    { mode: "progress" },
  );
  assert.equal(m.regions.find((r) => r.id === "chest").progress, "review");
  assert.equal(m.streams[0].comparison.flagged, true);
  assert.equal(
    m.regions.find((r) => r.id === "chest").evidence.comparedCount,
    0,
  );
});
test("session date options and default date follow the selected equipment", () => {
  const exercises = analyze([
    record("a", "2026-09-01"),
    record("b", "2026-09-16", "leg_curl"),
  ]).exercises;
  const all = buildBodyInsights(exercises);
  const m = buildBodyInsights(exercises, {
    mode: "session",
    date: "2026-09-16",
    streamId: all.streams.find((s) => s.exerciseId === "chest_press").id,
  });
  assert.deepEqual(m.dates, ["2026-09-01"]);
  assert.equal(m.date, "2026-09-01");
  assert.equal(m.recordCount, 1);
});
test("empty data requests the first record without listing unmeasured muscles as workout priorities", () => {
  const m = buildBodyInsights([]);
  assert.deepEqual(m.focus.baseline, []);
  assert.equal(m.focus.hasTraining, false);
});
test("unknown context is visible but does not become an adverse pain event", () => {
  const a = analyze([
    record("a", "2026-09-01", "chest_press", "A", 30, {
      pain: "unknown",
      technique: "unknown",
    }),
  ]);
  const r = buildBodyInsights(a.exercises).regions.find(
    (r) => r.id === "chest",
  );
  assert.equal(r.progress, "review");
  assert.equal(r.painCount, 0);
  assert.equal(r.unknownCount, 1);
  assert.equal(a.exercises[0].comparison.flagged, true);
  assert.equal(r.evidence.comparedCount, 0);
});
test("every muscle mapping and illustrated selection points to a defined region with no duplicate roles", () => {
  const ids = new Set(BODY_REGIONS.map((r) => r.id));
  const drawn = new Set(
    Object.values(REGION_PATHS).flatMap((v) => Object.keys(v)),
  );
  assert.deepEqual([...drawn].sort(), [...ids].sort());
  for (const role of Object.values(MUSCLE_ROLES)) {
    const all = [...role.primary, ...role.support];
    assert.equal(new Set(all).size, all.length);
    assert.ok(all.every((id) => ids.has(id)));
  }
  for (const [view, labels] of Object.entries(REGION_LABELS))
    assert.ok(labels.every(([id]) => REGION_PATHS[view][id]));
});
