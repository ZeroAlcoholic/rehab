import test from "node:test";
import assert from "node:assert/strict";
import {
  makeEvent,
  validateEvent,
  mergeEvents,
  project,
} from "../src/domain/journal.js";
const data = {
  date: "2026-09-15",
  exerciseId: "leg_press",
  machine: "A",
  unit: "kg",
  sets: [{ load: 40, reps: 10 }],
  pain: "none",
  technique: "stable",
  note: "",
};
const event = (id, parents = [], extra = {}) =>
  makeEvent({
    id,
    recordId: "record",
    parents,
    kind: "training",
    data,
    createdAt: "2026-09-15T00:00:00.000Z",
    ...extra,
  });
test("merges immutable versions and deduplicates semantic content", () => {
  const a = event("a");
  const reordered = {
    ...a,
    data: { ...a.data, sets: [{ reps: 10, load: 40 }] },
  };
  assert.equal(mergeEvents([a], [reordered]).length, 1);
  assert.throws(() =>
    mergeEvents([a], [{ ...a, data: { ...a.data, note: "different" } }]),
  );
  assert.equal(a.schemaVersion, 1);
});
test("parallel edits conflict; explicit multi-parent resolution restores one record", () => {
  const a = event("a"),
    b = event("b", ["a"]),
    c = event("c", ["a"], { data: { ...data, note: "other" } });
  const unresolved = project([c, a, b]);
  assert.equal(unresolved.records.length, 0);
  assert.deepEqual(
    unresolved.conflicts[0].versions.map((x) => x.id),
    ["b", "c"],
  );
  const d = event("d", ["b", "c"]);
  assert.equal(project([a, b, c, d]).records[0].eventId, "d");
  const late = event("e", ["a"]);
  assert.equal(project([a, b, c, d, late]).conflicts.length, 1);
});
test("sole tombstone deletes but parallel deletion remains visible as conflict", () => {
  const a = event("a"),
    b = event("b", ["a"], { deleted: true, data: null }),
    c = event("c", ["a"]);
  assert.deepEqual(project([a, b]), { records: [], conflicts: [] });
  assert.equal(
    project([a, b, c]).conflicts[0].versions.find((x) => x.id === "b").deleted,
    true,
  );
});
test("rejects malformed events and broken causal graphs", () => {
  const a = event("a");
  for (const bad of [
    { ...a, schemaVersion: 2 },
    { ...a, deleted: "false" },
    { ...a, createdAt: "tomorrow" },
    { ...a, parents: ["a"] },
    { ...a, extra: 1 },
  ])
    assert.throws(() => mergeEvents([bad]));
  assert.throws(() => mergeEvents([event("b", ["missing"])]));
  assert.throws(() => mergeEvents([event("a", ["b"]), event("b", ["a"])]));
  assert.throws(() =>
    mergeEvents([a, event("b", ["a"], { recordId: "another" })]),
  );
  assert.throws(() =>
    mergeEvents([
      a,
      event("b", ["a"], {
        kind: "inbody",
        data: { date: "2026-09-15", metrics: { weight: 70 } },
      }),
    ]),
  );
});
test("individual validation permits absent parents in an append batch but rejects malformed required fields", () => {
  const child = event("child", ["not-in-this-batch"]);
  assert.equal(validateEvent(child).id, "child");
  for (const key of [
    "id",
    "recordId",
    "parents",
    "kind",
    "data",
    "deleted",
    "createdAt",
    "schemaVersion",
  ]) {
    const bad = { ...child };
    delete bad[key];
    assert.throws(() => validateEvent(bad), key);
  }
  const a = event("a"),
    b = event("b", ["a"]);
  const c = event("c", ["a", "b"]);
  assert.equal(
    mergeEvents([a, b, c], [{ ...c, parents: ["b", "a"] }]).length,
    3,
  );
  assert.throws(() =>
    mergeEvents([
      a,
      event("other", [], {
        kind: "inbody",
        data: { date: "2026-09-15", metrics: { weight: 70 } },
      }),
    ]),
  );
});
test("projection orders current records by date and record ID and isolates returned data", () => {
  const a = event("a", [], { recordId: "z" }),
    b = event("b", [], {
      recordId: "a",
      data: { ...data, date: "2026-09-14" },
    });
  const result = project([a, b]);
  assert.deepEqual(
    result.records.map((x) => x.recordId),
    ["a", "z"],
  );
  result.records[0].data.note = "mutated";
  assert.equal(b.data.note, "");
});
test("Unicode record IDs have a total order independent of merge insertion order", () => {
  const a = event("a", [], { recordId: "é" }),
    b = event("b", [], { recordId: "e\u0301" });
  assert.deepEqual(
    project([a, b]).records.map((x) => x.recordId),
    ["e\u0301", "é"],
  );
  assert.deepEqual(
    project([b, a]).records.map((x) => x.recordId),
    ["e\u0301", "é"],
  );
});
test("same-day ordering follows initial creation time and editing an old record does not move it last", () => {
  const a = event("a", [], {
    recordId: "z",
    createdAt: "2026-09-15T08:00:00.000Z",
  });
  const b = event("b", [], {
    recordId: "a",
    createdAt: "2026-09-15T09:00:00.000Z",
  });
  const edit = event("edit", ["a"], {
    recordId: "z",
    createdAt: "2026-09-15T10:00:00.000Z",
  });
  const backfill = event("backfill", [], {
    recordId: "backfill",
    createdAt: "2026-09-15T11:00:00.000Z",
    data: { ...data, date: "2026-09-14" },
  });
  const result = project([edit, b, backfill, a]);
  assert.deepEqual(
    result.records.map((r) => r.recordId),
    ["backfill", "z", "a"],
  );
  assert.equal(
    result.records.find((r) => r.recordId === "z").createdAt,
    a.createdAt,
  );
  assert.deepEqual(project([a, backfill, b, edit]), result);
});
test("resolved independent roots retain the earliest initial creation timestamp", () => {
  const a = event("a", [], { createdAt: "2026-09-15T08:00:00.000Z" }),
    b = event("b", [], { createdAt: "2026-09-15T07:00:00.000Z" }),
    resolved = event("resolve", ["a", "b"], {
      createdAt: "2026-09-15T10:00:00.000Z",
    });
  assert.equal(project([a, b, resolved]).records[0].createdAt, b.createdAt);
});
