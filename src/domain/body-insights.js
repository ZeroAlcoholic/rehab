import { summarizeMuscles, MUSCLE_ROLES } from "./muscles.js";
import {
  buildTrainingStreams,
  summarizeComparisons,
  trainingStreamId,
} from "./training-streams.js";
import { compareRecordOrder } from "./records.js";
export const PROGRESS_LABELS = Object.freeze({
  improving: "↑ 相關動作進步",
  stable: "→ 兩次表現持平",
  declining: "↓ 兩次表現下降",
  mixed: "↕ 結果不一致／部分可比",
  review: "! 先檢視動作狀況",
  insufficient: "— 資料不足",
});
function withEvidence(exercises, streams) {
  const summary = summarizeMuscles(exercises);
  for (const r of summary.regions) {
    r.coverage =
      r.primarySets >= 10
        ? "high"
        : r.primarySets >= 5
          ? "medium"
          : r.primarySets
            ? "low"
            : r.supportSets
              ? "support"
              : "none";
    r.streams = streams
      .filter(
        (s) =>
          MUSCLE_ROLES[s.exerciseId]?.primary.includes(r.id) ||
          MUSCLE_ROLES[s.exerciseId]?.support.includes(r.id),
      )
      .map((s) => ({
        ...s,
        role: MUSCLE_ROLES[s.exerciseId].primary.includes(r.id)
          ? "primary"
          : "support",
      }));
    r.evidence = summarizeComparisons(
      r.streams.filter((s) => s.role === "primary"),
    );
    r.progress = r.evidence.flagged ? "review" : r.evidence.status;
    r.lastDate =
      r.exercises
        .map((e) => e.lastDate)
        .sort()
        .at(-1) ?? null;
  }
  return summary;
}
export function buildBodyInsights(
  exercises,
  { mode = "coverage", date = "", recordId = "", streamId = "", rehabRegions = [] } = {},
) {
  const all = exercises
    .flatMap((e) => e.sessions)
    .slice()
    .sort(compareRecordOrder);
  const streams = buildTrainingStreams(exercises);
  const selectedStream = streams.some((s) => s.id === streamId) ? streamId : "";
  const available = all.filter(
    (r) => !selectedStream || trainingStreamId(r.data) === selectedStream,
  );
  const dates = [...new Set(available.map((r) => r.data.date))]
    .sort()
    .reverse();
  const selectedDate = dates.includes(date) ? date : (dates[0] ?? "");
  const dayRecords = available.filter((r) => r.data.date === selectedDate);
  const selectedRecord = dayRecords.some((r) => r.recordId === recordId)
    ? recordId
    : "";
  const filtered =
    mode === "session"
      ? dayRecords.filter(
          (r) => !selectedRecord || r.recordId === selectedRecord,
        )
      : available;
  const ids = new Set(filtered.map((r) => r.recordId));
  const summary = withEvidence(
    exercises.map((e) => ({
      ...e,
      sessions: e.sessions.filter((r) => ids.has(r.recordId)),
    })),
    streams.filter((s) => !selectedStream || s.id === selectedStream),
  );
  // Next-step candidates use the entire selected date range, never the inspection filter.
  const full =
    selectedStream || mode === "session"
      ? withEvidence(exercises, streams)
      : summary;
  const hasPrimary = (id) =>
    Object.values(MUSCLE_ROLES).some((r) => r.primary.includes(id));
  const focus = {
    adjust: full.regions.filter(r=>rehabRegions.includes(r.id)),
    hasTraining: all.length > 0,
    recordCount: all.length,
    baseline: all.length
      ? full.regions.filter((r) => !r.primarySets && hasPrimary(r.id) && !rehabRegions.includes(r.id))
      : [],
    progress: full.regions.filter((r) => r.progress === "improving" && !rehabRegions.includes(r.id)),
    review: full.regions.filter((r) => r.painCount || r.techniqueCount),
    incomplete: full.regions.filter(
      (r) => r.primarySets && !r.evidence.comparedCount,
    ),
  };
  return {
    ...summary,
    streams,
    dates,
    date: selectedDate,
    dayRecords,
    recordId: selectedRecord,
    streamId: selectedStream,
    recordCount: filtered.length,
    records: filtered,
    focus,
  };
}
