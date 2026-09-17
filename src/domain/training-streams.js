import { compareSessions } from "./comparison.js";
import { compareRecordOrder } from "./records.js";

export const hasContextFlag = (data) =>
  data.pain !== "none" ||
  data.technique !== "stable" ||
  Object.keys(data.review ?? {}).length > 0;
export const trainingStreamId = (data) =>
  JSON.stringify([data.exerciseId, data.machine, data.unit]);
export function buildTrainingStreams(exercises) {
  const groups = new Map();
  for (const e of exercises)
    for (const record of e.sessions) {
      const id = trainingStreamId(record.data);
      if (!groups.has(id))
        groups.set(id, {
          id,
          exerciseId: e.exerciseId,
          name: e.name,
          metric: e.metric,
          machine: record.data.machine,
          unit: record.data.unit,
          sessions: [],
        });
      groups.get(id).sessions.push(record);
    }
  return [...groups.values()].map((s) => {
    s.sessions.sort(compareRecordOrder);
    const pair = s.sessions.slice(-2);
    const comparison =
      pair.length === 2
        ? compareSessions(pair[0].data, pair[1].data)
        : {
            status: "insufficient",
            flagged: pair.some((r) => hasContextFlag(r.data)),
            reason: "需要同條件的兩筆紀錄",
          };
    return { ...s, pair, comparison };
  });
}
export function summarizeComparisons(streams) {
  const statuses = streams.map((s) => s.comparison.status);
  const comparedCount = statuses.filter((s) => s !== "insufficient").length,
    totalCount = streams.length;
  const flagged = streams.some((s) => s.comparison.flagged);
  const status =
    !statuses.length || !comparedCount
      ? "insufficient"
      : statuses.every((s) => s === statuses[0])
        ? statuses[0]
        : "mixed";
  const reason =
    streams.length === 1
      ? streams[0].comparison.reason
      : !comparedCount
        ? "尚無可比的同器材紀錄"
        : `${comparedCount} / ${totalCount} 個動作／器材組別可比；${status === "mixed" ? "結果不一致或仍有資料不足" : status === "improving" ? "可比表現皆增加" : status === "declining" ? "可比表現皆下降" : "可比表現皆相同"}`;
  return { status, reason, flagged, comparedCount, totalCount };
}
