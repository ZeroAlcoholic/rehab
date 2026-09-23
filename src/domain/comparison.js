import { EXERCISES } from "./catalog.js";
import { validateRecord } from "./records.js";

const contextFlag = (data) =>
  data.pain !== "none" || data.technique !== "stable";

export function sessionPerformance(data) {
  const value = validateRecord("training", data);
  const exercise = EXERCISES.find((x) => x.id === value.exerciseId);
  return {
    totalReps: value.sets.reduce((total, set) => total + set.reps, 0),
    volume:
      exercise.metric === "load"
        ? value.sets.reduce((total, set) => total + set.load * set.reps, 0)
        : null,
    unit: value.unit,
  };
}

export function compareSessions(previousData, currentData) {
  let previous, current;
  try {
    previous = validateRecord("training", previousData);
    current = validateRecord("training", currentData);
  } catch {
    return {
      status: "insufficient",
      reason: "缺少有效的兩次紀錄",
      flagged: true,
    };
  }
  const flagged =
    contextFlag(previous) ||
    contextFlag(current) ||
    Object.keys(previous.review ?? {}).length > 0 ||
    Object.keys(current.review ?? {}).length > 0;
  const result = (status, reason) => ({ status, reason, flagged });
  const exercise = EXERCISES.find((x) => x.id === current.exerciseId);
  if(current.exerciseId==='abdominal_bracing') return result('insufficient','呼吸次數只作練習量紀錄，不用來判定肌力進步或復健成效');
  if (
    previous.analysisExcludedReason ||
    current.analysisExcludedReason ||
    Object.keys(previous.review ?? {}).length ||
    Object.keys(current.review ?? {}).length
  )
    return result("insufficient", "目前僅顯示數值，不判定進步");
  if (
    (previous.loadBasis ?? "unknown") !== (current.loadBasis ?? "unknown") ||
    (previous.posture ?? "") !== (current.posture ?? "")
  )
    return result("insufficient", "負荷記錄方式或姿勢條件不同，暫不比較");
  if (
    previous.exerciseId !== current.exerciseId ||
    previous.unit !== current.unit ||
    previous.machine !== current.machine ||
    previous.sets.length !== current.sets.length ||
    (exercise.metric !== "bodyweight" && !current.machine)
  )
    return result(
      "insufficient",
      "動作、機台、單位或組數不同／缺漏，無法直接比較",
    );
  if (
    previous.sets.some((x) => x.load !== previous.sets[0].load) ||
    current.sets.some((x) => x.load !== current.sets[0].load)
  )
    return result("insufficient", "各組調重，保留明細供檢視，不直接判定趨勢");
  const loadDelta =
    (current.sets[0].load - previous.sets[0].load) *
    (exercise.metric === "assistance" ? -1 : 1);
  const directions = [
    Math.sign(loadDelta),
    ...current.sets.map((set, i) =>
      Math.sign(set.reps - previous.sets[i].reps),
    ),
  ];
  const up = directions.includes(1),
    down = directions.includes(-1);
  if (up && down)
    return result("mixed", "負荷／輔助量與各組次數有增有減，不能判定進步");
  if (up && flagged)
    return result(
      "mixed",
      "數值增加，但疼痛或動作狀況有旗標／未知，需併看原始紀錄",
    );
  if (up)
    return result(
      "improving",
      exercise.metric === "assistance"
        ? "輔助量下降或次數增加，其他可比數值未下降"
        : "負荷或次數增加，其他可比數值未下降",
    );
  if (down) return result("declining", "本次可比數值下降，僅描述這兩次紀錄");
  return result("stable", "這兩次負荷與次數相同；不足以判定平台期");
}
