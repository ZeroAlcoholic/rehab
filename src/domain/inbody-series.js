import { INBODY_FIELDS } from "./catalog.js";

export function inbodySeries(records) {
  return INBODY_FIELDS.map(field => {
    const observations = records.filter(r => r.data.metrics[field.id] != null).map(r => ({
      date: r.data.date, time: r.data.time ?? "", value: r.data.metrics[field.id],
      recordId: r.recordId, review: r.data.review?.[field.id] ?? "",
      excluded: r.data.analysisExcludedReason ?? "", source: r.data.source ?? "",
      device: r.data.measurementContext?.device ?? "",
    }));
    const points = observations.filter(p => !p.review && !p.excluded).map(({date,time,value,recordId,device})=>({date,time,value,recordId,device}));
    const first = points[0], last = points.at(-1), previous = points.at(-2);
    return {
      ...field, observations, points,
      unverifiedPoints: observations.filter(p=>p.review).map(p=>({date:p.date,value:p.value,reason:p.review,recordId:p.recordId})),
      change: {
        baselineDelta: previous ? last.value - first.value : null,
        previousDelta: previous ? last.value - previous.value : null,
        daysSincePrevious: previous ? (Date.parse(last.date) - Date.parse(previous.date)) / 86400000 : null,
        measurementDays: new Set(points.map(p=>p.date)).size,
      },
      deviceChanged: new Set(points.map(p=>p.device).filter(Boolean)).size > 1,
    };
  });
}
