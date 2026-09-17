import test from "node:test";
import assert from "node:assert/strict";
import { validateRecord, compareRecordOrder } from "../src/domain/records.js";
import { analyze } from "../src/domain/analytics.js";
import { makeEvent, mergeEvents } from "../src/domain/journal.js";
import { localDate } from "../src/ui/dom.js";

test("default entry date follows Taiwan even with a different device timezone", () => {
  assert.equal(localDate(new Date("2026-01-01T16:30:00Z")), "2026-01-02");
  assert.equal(localDate(new Date("2026-01-01T15:59:00Z")), "2026-01-01");
});

const training = { date: "2026-01-01", exerciseId: "chest_press", machine: "A", unit: "lb", sets: [{load: 65, reps: 12}], pain: "mild", technique: "corrected", note: "當天肩部不適" };
const body = (id, date, weight, extra = {}) => ({recordId:id, kind:"inbody", data:validateRecord("inbody", {date, metrics:{weight}, ...extra})});

test("optional Taiwan wall time and measurement context round-trip without changing legacy events", () => {
  const old = makeEvent({kind:"training", data:training});
  const newer = makeEvent({kind:"inbody", data:{date:"2026-02-01", time:"21:06", measurementContext:{device:"A 館 InBody 270", conditions:"晚餐後；尚未訓練"}, metrics:{weight:71, segmental_right_arm_pct:98, segmental_trunk_pct:101}}});
  assert.deepEqual(mergeEvents([old, newer]), mergeEvents(JSON.parse(JSON.stringify([old,newer]))));
  assert.equal(Object.hasOwn(old.data, "time"), false);
  assert.equal(newer.data.time, "21:06");
  assert.equal(newer.data.measurementContext.conditions, "晚餐後；尚未訓練");
  for (const time of ["24:00", "12:60", "9:10", null]) assert.throws(() => validateRecord("training", {...training, time}));
  assert.throws(() => validateRecord("inbody", {...newer.data, measurementContext:{invented:"x"}}));
});

test("same-day recorded time orders sessions independently of entry order", () => {
  const a = {recordId:"a",createdAt:"2026-02-02T00:00:00.000Z",data:{...training,time:"09:00"}};
  const b = {recordId:"b",createdAt:"2026-02-01T00:00:00.000Z",data:{...training,time:"20:00"}};
  assert.deepEqual([b,a].sort(compareRecordOrder), [a,b]);
});

test("irregular InBody history survives a short training filter without inventing intervening measurements", () => {
  const records = [body("a","2026-01-01",70),body("b","2026-02-13",71),body("c","2026-04-10",72),body("future","2027-01-01",99)];
  const result = analyze(records, {from:"2026-04-01",to:"2026-04-30",inbodyFrom:null});
  assert.equal(result.inbodyCount,3);
  const weight = result.bodyComposition.find(s=>s.id==="weight");
  assert.deepEqual(weight.points.map(p=>p.date),["2026-01-01","2026-02-13","2026-04-10"]);
  assert.deepEqual(weight.change, {baselineDelta:2,previousDelta:1,daysSincePrevious:56,measurementDays:3});
  assert.equal(result.timeline.length,1);
  assert.equal(analyze(records,{from:"2026-04-01",to:"2026-04-30"}).inbodyCount,1);
});

test("pending, excluded and missing values do not enter interval changes; same-day tests are not multiweek trends", () => {
  const records = [body("a","2026-01-01",70),body("b","2026-01-21",80,{review:{weight:"待確認"}}),body("c","2026-02-01",90,{analysisExcludedReason:"測試"}),body("d","2026-02-20",71),body("e","2026-02-20",72)];
  const weight = analyze(records).bodyComposition.find(s=>s.id==="weight");
  assert.equal(weight.observations.length,5);
  assert.equal(weight.points.length,3);
  assert.deepEqual(weight.change,{baselineDelta:2,previousDelta:1,daysSincePrevious:0,measurementDays:2});
});

test("reusing a training record resets session observations and provenance, preserving equipment uncertainty", async () => {
  const { repeatTraining } = await import("../src/domain/training-template.js");
  const original = {...training,time:"21:00",source:"歷史匯入",loadBasis:"stack",posture:"座椅 3",review:{unit:"待核對"},analysisExcludedReason:"暖身"};
  const next = repeatTraining(original,"2026-02-01");
  assert.equal(next.date,"2026-02-01");
  assert.equal(next.pain,"unknown");
  assert.equal(next.technique,"unknown");
  assert.equal(next.note,"");
  assert.equal(next.source,undefined);
  assert.equal(next.time,undefined);
  assert.equal(next.analysisExcludedReason,undefined);
  assert.deepEqual(next.review,original.review);
  assert.equal(next.loadBasis,"stack");
  assert.equal(next.posture,"座椅 3");
  next.sets[0].reps=1;
  assert.equal(original.sets[0].reps,12);
});
