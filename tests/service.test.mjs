import test from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/app/service.js";
import { initialState } from "../src/storage/state.js";

const training = {
  date: "2026-09-15",
  exerciseId: "chest_press",
  machine: "A",
  unit: "lb",
  sets: [{ load: 65, reps: 12 }],
  pain: "none",
  technique: "stable",
  note: "",
};
function memory() {
  let state = initialState();
  return {
    read: async () => structuredClone(state),
    update: async (fn) => {
      state = structuredClone(fn(structuredClone(state)));
      return structuredClone(state);
    },
  };
}
test("save and edit preserve revisions and original identity", async () => {
  const repo = memory(),
    service = createService(repo);
  await service.save("training", training);
  const before = await repo.read(),
    first = before.events[0];
  await service.save(
    "training",
    { ...training, note: "調整握距" },
    { recordId: first.recordId, parents: [first.id] },
  );
  const after = await repo.read();
  assert.equal(after.events.length, 2);
  assert.equal(after.pending.length, 2);
  const edited = after.events.find((e) => e.id !== first.id);
  assert.equal(edited.recordId, first.recordId);
  assert.deepEqual(edited.parents, [first.id]);
  assert.equal(after.events.find((e) => e.id === first.id).data.note, "");
});
test("invalid input never changes durable state", async () => {
  const repo = memory(),
    service = createService(repo);
  await assert.rejects(() =>
    service.save("training", { ...training, sets: [{ load: 65, reps: -1 }] }),
  );
  assert.equal((await repo.read()).events.length, 0);
});
test("stale editor cannot silently overwrite a newer revision", async () => {
  const repo = memory(),
    service = createService(repo);
  await service.save("training", training);
  const first = (await repo.read()).events[0];
  await service.save(
    "training",
    { ...training, note: "new" },
    { recordId: first.recordId, parents: [first.id] },
  );
  await assert.rejects(
    () =>
      service.save("training", training, {
        recordId: first.recordId,
        parents: [first.id],
      }),
    /更新|版本/,
  );
  assert.equal((await repo.read()).events.length, 2);
});
test("invalid backup is atomic and valid backup restores without duplicate versions", async () => {
  const repo = memory(),
    service = createService(repo);
  await service.save("training", training);
  const text = await service.exportBackup();
  assert.equal(text.includes("access_token"), false);
  await service.importBackup(text);
  assert.equal((await repo.read()).events.length, 1);
  const corrupt = JSON.parse(text);
  corrupt.events[0].data.sets[0].reps = -5;
  await assert.rejects(() => service.importBackup(JSON.stringify(corrupt)));
  assert.equal((await repo.read()).events[0].data.sets[0].reps, 12);
  const second = memory();
  await createService(second).importBackup(text);
  assert.equal((await second.read()).events.length, 1);
  assert.equal((await second.read()).pending.length, 1);
});
test("bound dataset cannot switch sheets or import another sheet backup", async () => {
  const repo = memory(),
    service = createService(repo);
  await service.bind("sheetA", []);
  await service.save("training", training);
  await assert.rejects(() => service.bind("sheetB", []));
  const backup = JSON.parse(await service.exportBackup());
  backup.sourceSheetId = "sheetB";
  await assert.rejects(() => service.importBackup(JSON.stringify(backup)));
  assert.equal((await repo.read()).settings.sheetId, "sheetA");
});
