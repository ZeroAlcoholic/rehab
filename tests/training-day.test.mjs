import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingDay } from '../src/domain/training-day.js';

const day = '2026-09-22';
const record = (id, exerciseId, count, extra = {}) => ({
  kind: 'training', recordId: id, createdAt: `${day}T01:00:00Z`,
  data: {date: day, exerciseId, machine: id, unit: 'kg',
    sets: Array.from({length: count}, () => ({load: 20, reps: 10})),
    pain: 'unknown', technique: 'unknown', note: '', ...extra},
});

test('daily summary counts recorded sets once, separates primary/support and exposes their sources', () => {
  const chest = record('press', 'chest_press', 3);
  const shoulder = record('shoulder', 'shoulder_press', 2);
  const result = trainingDay([chest, shoulder], day);
  assert.equal(result.setCount, 5);
  assert.equal(result.records.length, 2);
  assert.equal(result.exerciseCount, 2);
  const shoulders = result.regions.find(r => r.id === 'shoulders');
  assert.equal(shoulders.primarySets, 2);
  assert.equal(shoulders.supportSets, 3);
  assert.deepEqual(shoulders.exercises.map(e => [e.exerciseId, e.role, e.setCount]), [
    ['chest_press', 'support', 3], ['shoulder_press', 'primary', 2],
  ]);
  assert.equal(result.regions.find(r => r.id === 'chest').primarySets, 3);
  assert.equal(result.regions.find(r => r.id === 'triceps').supportSets, 5);
  assert.ok(!result.regions.some(r => r.id === 'calves'));
});

test('excluded records remain editable but do not count as muscle coverage; uncertainty is explicit', () => {
  const result = trainingDay([
    record('warmup', 'chest_press', 2, {analysisExcludedReason: '暖身'}),
    record('review', 'leg_press', 3, {review: {sets: '組數待核对'}}),
    record('balance', 'single_leg_balance', 1),
    record('old', 'calf_raise', 4, {date: '2026-09-21'}),
    {kind: 'inbody', data: {date: day, metrics: {weight: 70}}},
  ], day);
  assert.equal(result.records.length, 3);
  assert.equal(result.setCount, 4);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.reviewCount, 1);
  assert.equal(result.unmappedCount, 1);
  assert.ok(!result.regions.some(r => ['chest','calves'].includes(r.id)));
});

test('empty date never substitutes a past workout and does not infer missing exercise', () => {
  const input = [record('old', 'chest_press', 3, {date: '2026-09-21'})];
  const before = structuredClone(input);
  const result = trainingDay(input, day);
  assert.equal(result.setCount, 0);
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.regions, []);
  assert.deepEqual(input, before);
});
