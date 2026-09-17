import { EXERCISES, PATTERNS } from "./catalog.js";
import { inbodySeries } from "./inbody-series.js";
import { analyzeRehab } from './rehab-analysis.js';
import { compareRecordOrder } from "./records.js";
import {
  buildTrainingStreams,
  summarizeComparisons,
} from "./training-streams.js";
export { compareSessions, sessionPerformance } from "./comparison.js";

export function analyze(records, { from = null, to = null, inbodyFrom = from } = {}) {
  const sorted = records
    .filter((r) => (!from || r.data.date >= from) && (!to || r.data.date <= to))
    .slice()
    .sort(compareRecordOrder);
  const training = sorted.filter(
      (r) => r.kind === "training" && !r.data.analysisExcludedReason,
    ),
    body = records.filter(r => r.kind === "inbody" && (!inbodyFrom || r.data.date >= inbodyFrom) && (!to || r.data.date <= to)).slice().sort(compareRecordOrder);
  const exercises = EXERCISES.map((exercise) => {
    const sessions = training.filter((r) => r.data.exerciseId === exercise.id);
    const streams = buildTrainingStreams([
      { ...exercise, exerciseId: exercise.id, sessions },
    ]);
    return {
      exerciseId: exercise.id,
      name: exercise.name,
      pattern: exercise.pattern,
      metric: exercise.metric,
      sessions,
      streams,
      comparison: summarizeComparisons(streams),
    };
  }).filter((x) => x.sessions.length);
  const coverage = PATTERNS.map((pattern) => ({
    ...pattern,
    count: exercises
      .filter((x) => x.pattern === pattern.id)
      .reduce((n, x) => n + x.sessions.length, 0),
  }));
  const context = {
    painCount: training.filter((r) =>
      ["mild", "significant"].includes(r.data.pain),
    ).length,
    techniqueCount: training.filter((r) =>
      ["corrected", "compensation", "failed"].includes(r.data.technique),
    ).length,
    unknownCount: training.filter(
      (r) => r.data.pain === "unknown" || r.data.technique === "unknown",
    ).length,
    unknownPainCount: training.filter((r) => r.data.pain === "unknown").length,
    unknownTechniqueCount: training.filter(
      (r) => r.data.technique === "unknown",
    ).length,
  };
  const next = [];
  if (!training.length) next.push("新增第一筆訓練紀錄");
  if (context.unknownCount) next.push("下次記錄時補充疼痛與動作狀況");
  if (
    training.some(
      (r) =>
        !r.data.machine &&
        EXERCISES.find((x) => x.id === r.data.exerciseId)?.metric !==
          "bodyweight",
    )
  )
    next.push("補上機台識別，以利同條件比較");
  if (exercises.some((x) => x.comparison.flagged))
    next.push("檢視有旗標的原始紀錄與備註");
  if (!next.length) next.push("持續記錄同條件的訓練，累積可比資料");
  const timeline = [...new Set(sorted.map((r) => r.data.date))].map((date) => ({
    date,
    trainingCount: training.filter((r) => r.data.date === date).length,
    inbodyCount: body.filter((r) => r.data.date === date).length,
    excludedCount: sorted.filter(
      (r) =>
        r.data.date === date &&
        r.kind === "training" &&
        r.data.analysisExcludedReason,
    ).length,
  }));
  return {
    rehab: analyzeRehab(records,to),
    timeline,
    range: { from, to },
    inbodyRange: { from: inbodyFrom, to },
    trainingCount: training.length,
    excludedTrainingCount: sorted.filter(
      (r) => r.kind === "training" && r.data.analysisExcludedReason,
    ).length,
    inbodyRecords: body,
    inbodyCount: body.length,
    lastTrainingDate: training.at(-1)?.data.date ?? null,
    coverage,
    exercises,
    bodyComposition: inbodySeries(body),
    context,
    next,
  };
}
