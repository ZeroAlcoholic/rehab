import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord } from "../src/domain/records.js";
import { analyze, compareSessions } from "../src/domain/analytics.js";
const training = {
  date: "2026-01-01",
  exerciseId: "seated_row",
  machine: "M",
  unit: "lb",
  sets: [{ load: 50, reps: 10 }],
  pain: "none",
  technique: "stable",
  note: "",
};
const rec = (id, kind, data) => ({ recordId: id, eventId: id, kind, data });
test("review flags preserve original values while excluding only the uncertain InBody metric from trends", () => {
  const a = validateRecord("inbody", {
    date: "2026-01-01",
    metrics: { weight: 70, skeletal_muscle_mass: 30 },
  });
  const b = validateRecord("inbody", {
    date: "2026-02-01",
    metrics: { weight: 71, skeletal_muscle_mass: 20 },
    review: { skeletal_muscle_mass: "需核對原始報告" },
    source: "原始文字摘要",
  });
  const m = analyze([rec("a", "inbody", a), rec("b", "inbody", b)]);
  const smm = m.bodyComposition.find((s) => s.id === "skeletal_muscle_mass");
  assert.equal(b.metrics.skeletal_muscle_mass, 20);
  assert.equal(smm.points.length, 1);
  assert.equal(smm.unverifiedPoints[0].value, 20);
  assert.equal(
    m.bodyComposition.find((s) => s.id === "weight").points.length,
    2,
  );
  assert.throws(() =>
    validateRecord("inbody", { ...b, review: { invented: "bad" } }),
  );
});
test("unconfirmed units and different load bases prevent performance comparison", () => {
  const a = validateRecord("training", {
    ...training,
    loadBasis: "added_plates",
    review: { machine: "型號未核對" },
    source: "原始紀錄",
  });
  assert.equal(
    compareSessions(a, { ...a, sets: [{ load: 60, reps: 10 }] }).status,
    "insufficient",
  );
  assert.equal(
    compareSessions(
      { ...training, loadBasis: "added_plates" },
      { ...training, loadBasis: "stack" },
    ).status,
    "insufficient",
  );
  assert.throws(() =>
    validateRecord("training", { ...a, loadBasis: "actual_force" }),
  );
  assert.throws(() =>
    validateRecord("training", { ...a, review: { unrecognized: "bad" } }),
  );
});
test("excluded warmup remains stored but is not counted as working training", () => {
  const a = validateRecord("training", {
    ...training,
    analysisExcludedReason: "單側暖身／測試，不作工作組比較",
  });
  const result = analyze([
    rec("a", "training", a),
    rec("b", "training", training),
  ]);
  assert.equal(result.trainingCount, 1);
  assert.equal(result.excludedTrainingCount, 1);
  assert.equal(a.sets[0].load, 50);
});
test("new measured report fields and training catalog entries validate without filling missing values", () => {
  const a = validateRecord("inbody", {
    date: "2026-01-01",
    metrics: {
      inbody_score: 75,
      total_body_water: 40,
      segmental_left_leg_pct: 103,
      bmr: 1500,
    },
  });
  assert.equal(a.metrics.segmental_left_leg_pct, 103);
  assert.equal(a.metrics.segmental_right_arm, null);
  for (const exerciseId of [
    "biceps_curl",
    "incline_chest_press",
    "hip_adduction",
    "hip_abduction",
    "v_squat",
  ])
    assert.equal(
      validateRecord("training", { ...training, exerciseId }).exerciseId,
      exerciseId,
    );
});
test("the starting timeline includes measurements and excluded records without inflating work counts", () => {
  const result = analyze([
    rec("a", "training", training),
    rec("b", "training", { ...training, analysisExcludedReason: "暖身" }),
    rec(
      "c",
      "inbody",
      validateRecord("inbody", { date: "2026-02-01", metrics: { weight: 70 } }),
    ),
  ]);
  assert.deepEqual(result.timeline, [
    { date: "2026-01-01", trainingCount: 1, inbodyCount: 0, excludedCount: 1 },
    { date: "2026-02-01", trainingCount: 0, inbodyCount: 1, excludedCount: 0 },
  ]);
});
