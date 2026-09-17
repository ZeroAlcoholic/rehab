import test from "node:test";
import assert from "node:assert/strict";
import { createSyncEngine } from "../src/sync/engine.js";
import { initialState } from "../src/storage/state.js";
import { mergeEvents } from "../src/domain/journal.js";
const event = (id, parents = []) => ({
  schemaVersion: 1,
  id,
  recordId: "r1",
  parents,
  createdAt: "2026-09-15T00:00:00.000Z",
  kind: "inbody",
  deleted: false,
  data: { date: "2026-09-15", metrics: { weight: 70 }, note: "" },
});
function memory(events, pending) {
  let state = {
    ...initialState(),
    events,
    pending,
    settings: { clientId: "", sheetId: "sheetA" },
  };
  return {
    read: async () => structuredClone(state),
    update: async (fn) => {
      state = structuredClone(fn(structuredClone(state)));
      return structuredClone(state);
    },
  };
}
test("lost write response stays pending then next pull confirms without another append", async () => {
  const e = event("e1"),
    repo = memory([e], ["e1"]);
  let cloud = [],
    writes = 0;
  const remote = {
    read: async () => structuredClone(cloud),
    append: async (id, events) => {
      writes++;
      cloud.push(...events);
      throw Error("lost response");
    },
  };
  const sync = createSyncEngine({ repository: repo, remote });
  await assert.rejects(() => sync.run());
  assert.deepEqual((await repo.read()).pending, ["e1"]);
  await sync.run();
  assert.deepEqual((await repo.read()).pending, []);
  assert.equal(writes, 1);
});
test("new local edit during upload remains pending", async () => {
  const e = event("e1"),
    next = event("e2", ["e1"]),
    repo = memory([e], ["e1"]);
  let cloud = [];
  const remote = {
    read: async () => structuredClone(cloud),
    append: async (id, events) => {
      cloud.push(...events);
      await repo.update((s) => ({
        ...s,
        events: [...s.events, next],
        pending: [...s.pending, next.id],
      }));
    },
  };
  await createSyncEngine({ repository: repo, remote }).run();
  assert.deepEqual((await repo.read()).pending, ["e2"]);
  assert.equal((await repo.read()).events.length, 2);
});
test("missing previously acknowledged history blocks writing", async () => {
  const repo = memory([event("e1")], []);
  let writes = 0;
  const remote = {
    read: async () => [],
    append: async () => {
      writes++;
    },
  };
  await assert.rejects(
    () => createSyncEngine({ repository: repo, remote }).run(),
    /歷史|缺少/,
  );
  assert.equal(writes, 0);
  assert.equal((await repo.read()).events.length, 1);
});
test("simultaneous divergent device edits both survive and remain a conflict", async () => {
  const root = event("e1"),
    a = event("a", ["e1"]),
    b = {
      ...event("b", ["e1"]),
      data: { date: "2026-09-15", metrics: { weight: 72 }, note: "" },
    };
  const repo = memory([root, a], ["a"]);
  let cloud = [root, b];
  const remote = {
    read: async () => structuredClone(cloud),
    append: async (id, events) => {
      cloud.push(...events);
    },
  };
  await createSyncEngine({ repository: repo, remote }).run();
  const { project } = await import("../src/domain/journal.js");
  const result = project((await repo.read()).events);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.records.length, 0);
  assert.deepEqual((await repo.read()).pending, []);
});
test("failed readback cannot mark an upload synchronized", async () => {
  const repo = memory([event("e1")], ["e1"]);
  let reads = 0;
  const remote = {
    read: async () => {
      if (++reads > 1) throw Error("offline");
      return [];
    },
    append: async () => {},
  };
  await assert.rejects(() =>
    createSyncEngine({ repository: repo, remote }).run(),
  );
  assert.deepEqual((await repo.read()).pending, ["e1"]);
});
test("each interrupted upload prefix contains its pending ancestors", async () => {
  const events = [];
  for (let i = 120; i >= 0; i--)
    events.push(
      event(
        `e${String(i).padStart(3, "0")}`,
        i === 120 ? [] : [`e${String(i + 1).padStart(3, "0")}`],
      ),
    );
  const repo = memory(
    [...events].reverse(),
    events.map((e) => e.id),
  );
  let cloud = [];
  const remote = {
    read: async () => structuredClone(cloud),
    append: async (id, rows) => {
      for (let offset = 0; offset < rows.length; offset += 100) {
        cloud = mergeEvents(cloud, rows.slice(offset, offset + 100));
      }
    },
  };
  await createSyncEngine({ repository: repo, remote }).run();
  assert.equal(cloud.length, 121);
  assert.deepEqual((await repo.read()).pending, []);
});
