import { EXERCISES } from './catalog.js';
import { summarizeMuscles } from './muscles.js';
import { compareRecordOrder } from './records.js';

// These are recorded sets and fixed movement associations, not measured activation.
export function trainingDay(records, date) {
  const selected = records
    .filter(record => record.kind === 'training' && record.data.date === date)
    .slice().sort(compareRecordOrder);
  const included = selected.filter(record => !record.data.analysisExcludedReason);
  const exercises = EXERCISES.map(exercise => ({
    exerciseId: exercise.id,
    name: exercise.name,
    sessions: included.filter(record => record.data.exerciseId === exercise.id),
  })).filter(exercise => exercise.sessions.length);
  const muscles = summarizeMuscles(exercises);
  return {
    date,
    records: selected,
    exerciseCount: exercises.length,
    setCount: included.reduce((sum, record) => sum + record.data.sets.length, 0),
    excludedCount: selected.length - included.length,
    reviewCount: included.filter(record => Object.keys(record.data.review ?? {}).length).length,
    unmappedCount: muscles.unmappedCount,
    regions: muscles.regions.filter(region => region.recordCount),
  };
}
