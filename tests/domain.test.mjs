import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, PATTERNS, INBODY_FIELDS } from "../src/domain/catalog.js";
import { validateRecord } from "../src/domain/records.js";
import {
  compareSessions,
  analyze,
  sessionPerformance,
} from "../src/domain/analytics.js";

const session = (overrides = {}) => ({
  date: "2026-09-15",
  exerciseId: "leg_press",
  machine: "A",
  unit: "kg",
  sets: [
    { load: 40, reps: 10 },
    { load: 40, reps: 10 },
  ],
  pain: "none",
  technique: "stable",
  note: "",
  ...overrides,
});
test("catalog IDs are unique and fields have units", () => {
  assert.equal(new Set(EXERCISES.map((x) => x.id)).size, EXERCISES.length);
  assert.ok(INBODY_FIELDS.every((x) => x.id && x.label && x.unit));
});
test("catalog supports the requested movement landscape without unreachable categories", () => {
  for (const id of [
    "horizontal_push",
    "vertical_pull",
    "horizontal_pull",
    "knee_dominant",
    "hip_hinge",
    "hip_extension",
    "core_anti_extension",
    "core_anti_rotation",
    "single_leg_balance",
  ]) {
    assert.ok(
      PATTERNS.some((p) => p.id === id),
      id,
    );
    assert.ok(
      EXERCISES.some((e) => e.pattern === id),
      id,
    );
  }
  assert.equal(
    EXERCISES.find((e) => e.id === "assisted_chinup").metric,
    "assistance",
  );
});
test("training preserves per-set loads and explicit unknowns", () => {
  const value = validateRecord(
    "training",
    session({
      sets: [
        { load: 30, reps: 12 },
        { load: 40, reps: 8 },
      ],
      pain: undefined,
      technique: undefined,
    }),
  );
  assert.deepEqual(value.sets, [
    { load: 30, reps: 12 },
    { load: 40, reps: 8 },
  ]);
  assert.equal(value.pain, "unknown");
  assert.equal(value.technique, "unknown");
});
test("rejects invalid dates, unknown fields, non-finite data and missing loads", () => {
  for (const data of [
    session({ date: "2026-02-30" }),
    session({ date: "2026-9-15" }),
    session({ score: 3 }),
    session({ exerciseId: "invented" }),
    session({ sets: [] }),
    session({ sets: [{ load: NaN, reps: 10 }] }),
    session({ sets: [{ load: null, reps: 10 }] }),
    session({ sets: [{ load: 10, reps: 1.5 }] }),
    session({ unit: "stone" }),
  ])
    assert.throws(() => validateRecord("training", data));
  assert.equal(
    validateRecord("training", session({ date: "2024-02-29" })).date,
    "2024-02-29",
  );
});
test("inbody retains nulls and rejects unknown metrics and an empty measurement", () => {
  const value = validateRecord("inbody", {
    date: "2026-09-15",
    metrics: { weight: 70, body_fat_percentage: null },
  });
  assert.equal(value.metrics.weight, 70);
  assert.equal(value.metrics.body_fat_percentage, null);
  assert.throws(() =>
    validateRecord("inbody", {
      date: "2026-09-15",
      metrics: { weight: 70, wat: 1 },
    }),
  );
  assert.throws(() =>
    validateRecord("inbody", { date: "2026-09-15", metrics: { weight: null } }),
  );
  assert.throws(() =>
    validateRecord("inbody", {
      date: "2026-09-15",
      metrics: { body_fat_percentage: 101 },
    }),
  );
});
test("load and assistance comparison does not invent improvement from tradeoffs", () => {
  assert.equal(
    compareSessions(
      session(),
      session({
        sets: [
          { load: 45, reps: 10 },
          { load: 45, reps: 10 },
        ],
      }),
    ).status,
    "improving",
  );
  const assisted = session({ exerciseId: "assisted_pull_up" });
  assert.equal(
    compareSessions(assisted, {
      ...assisted,
      sets: [
        { load: 30, reps: 8 },
        { load: 30, reps: 8 },
      ],
    }).status,
    "mixed",
  );
  assert.equal(
    compareSessions(assisted, {
      ...assisted,
      sets: [
        { load: 30, reps: 10 },
        { load: 30, reps: 10 },
      ],
    }).status,
    "improving",
  );
  assert.equal(
    compareSessions(
      session(),
      session({
        sets: [
          { load: 30, reps: 8 },
          { load: 30, reps: 8 },
        ],
      }),
    ).status,
    "declining",
  );
  assert.equal(compareSessions(session(), session()).status, "stable");
});
test("comparison respects machine, units, set count, variable loads and individual reps", () => {
  for (const data of [
    session({ machine: "B" }),
    session({ machine: "" }),
    session({ unit: "lb" }),
    session({ sets: [{ load: 40, reps: 10 }] }),
    session({
      sets: [
        { load: 40, reps: 10 },
        { load: 45, reps: 10 },
      ],
    }),
  ])
    assert.equal(compareSessions(session(), data).status, "insufficient");
  assert.equal(
    compareSessions(
      session(),
      session({
        sets: [
          { load: 40, reps: 12 },
          { load: 40, reps: 8 },
        ],
      }),
    ).status,
    "mixed",
  );
});
test("pain and unknown technique cannot yield unqualified improvement", () => {
  for (const extra of [
    { pain: "mild" },
    { pain: "significant" },
    { pain: "unknown" },
    { technique: "unknown" },
    { technique: "compensation" },
    { technique: "failed" },
    { technique: "corrected" },
  ]) {
    const result = compareSessions(
      session(),
      session({
        ...extra,
        sets: [
          { load: 45, reps: 10 },
          { load: 45, reps: 10 },
        ],
      }),
    );
    assert.notEqual(result.status, "improving");
    assert.equal(result.flagged, true);
  }
});
test("analysis sorts by date and ID, filters range and reports coverage without strength claims", () => {
  const wrap = (id, data, kind = "training") => ({
    recordId: id,
    eventId: id,
    kind,
    data,
  });
  const records = [
    wrap("b", session({ date: "2026-09-13" })),
    wrap(
      "c",
      session({
        date: "2026-09-14",
        sets: [
          { load: 45, reps: 10 },
          { load: 45, reps: 10 },
        ],
      }),
    ),
    wrap("a", session({ date: "2026-09-12" })),
    wrap(
      "body",
      { date: "2026-09-14", metrics: { weight: 70 }, note: "" },
      "inbody",
    ),
  ];
  const result = analyze(records, { from: "2026-09-13", to: "2026-09-15" });
  assert.equal(result.trainingCount, 2);
  assert.equal(result.inbodyCount, 1);
  assert.deepEqual(
    result.exercises[0].sessions.map((x) => x.recordId),
    ["b", "c"],
  );
  assert.equal(result.exercises[0].comparison.status, "improving");
  assert.equal(
    result.coverage.reduce((n, x) => n + x.count, 0),
    2,
  );
  assert.equal(
    result.bodyComposition.find((x) => x.id === "weight").points[0].value,
    70,
  );
  assert.equal(analyze([]).trainingCount, 0);
});
test("bodyweight preserves unknown load without treating it as zero external weight", () => {
  const value = validateRecord(
    "training",
    session({
      exerciseId: "squat",
      machine: "",
      sets: [{ load: null, reps: 10 }],
    }),
  );
  assert.equal(value.sets[0].load, null);
  assert.equal(
    compareSessions(value, { ...value, sets: [{ load: null, reps: 12 }] })
      .status,
    "improving",
  );
  assert.throws(() =>
    validateRecord("training", { ...value, sets: [{ load: 0, reps: 10 }] }),
  );
});
test("analysis compares only latest pair and separates unknown context from reported symptoms", () => {
  const records = [
    ["c", 45],
    ["a", 40],
    ["b", 45],
  ].map(([id, load]) => ({
    recordId: id,
    eventId: id,
    kind: "training",
    data: session({
      sets: [{ load, reps: 10 }],
      pain: "unknown",
      technique: "unknown",
    }),
  }));
  const result = analyze(records);
  assert.equal(result.exercises[0].comparison.status, "stable");
  assert.deepEqual(
    result.exercises[0].sessions.map((x) => x.recordId),
    ["a", "b", "c"],
  );
  assert.equal(result.context.unknownPainCount, 3);
  assert.equal(result.context.unknownTechniqueCount, 3);
  assert.equal(result.context.unknownCount, 3);
  assert.equal(result.context.painCount, 0);
});
test("Unicode record IDs do not change latest-pair analysis when input order changes", () => {
  const records = [
    {
      recordId: "é",
      kind: "training",
      data: session({ sets: [{ load: 45, reps: 10 }] }),
    },
    {
      recordId: "e\u0301",
      kind: "training",
      data: session({ sets: [{ load: 40, reps: 10 }] }),
    },
  ];
  assert.equal(analyze(records).exercises[0].comparison.status, "improving");
  assert.equal(
    analyze([...records].reverse()).exercises[0].comparison.status,
    "improving",
  );
});
test("session performance sums per-set reps and external volume without converting assistance to work", () => {
  assert.deepEqual(
    sessionPerformance(
      session({
        sets: [
          { load: 30, reps: 12 },
          { load: 40, reps: 8 },
        ],
      }),
    ),
    { totalReps: 20, volume: 680, unit: "kg" },
  );
  assert.deepEqual(
    sessionPerformance(session({ unit: "lb", sets: [{ load: 50, reps: 10 }] })),
    { totalReps: 10, volume: 500, unit: "lb" },
  );
  assert.deepEqual(
    sessionPerformance(session({ exerciseId: "assisted_chinup" })),
    { totalReps: 20, volume: null, unit: "kg" },
  );
  assert.deepEqual(
    sessionPerformance(
      session({ exerciseId: "dead_bug", sets: [{ load: null, reps: 12 }] }),
    ),
    { totalReps: 12, volume: null, unit: "kg" },
  );
  assert.throws(() => sessionPerformance(session({ sets: [] })));
});
test("same-day analysis follows first record creation time before arbitrary ID order", () => {
  const records = [
    {
      recordId: "a",
      createdAt: "2026-09-15T09:00:00.000Z",
      kind: "training",
      data: session({ sets: [{ load: 45, reps: 10 }] }),
    },
    {
      recordId: "z",
      createdAt: "2026-09-15T08:00:00.000Z",
      kind: "training",
      data: session({ sets: [{ load: 40, reps: 10 }] }),
    },
  ];
  const result = analyze(records);
  assert.deepEqual(
    result.exercises[0].sessions.map((r) => r.recordId),
    ["z", "a"],
  );
  assert.equal(result.exercises[0].comparison.status, "improving");
  assert.equal(
    analyze([...records].reverse()).exercises[0].comparison.status,
    "improving",
  );
});
