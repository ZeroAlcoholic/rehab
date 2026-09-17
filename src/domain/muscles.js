// Version 2: explicit associations, not measured muscle activation.
export const BODY_REGIONS = Object.freeze(
  [
    ["chest", "胸大肌"],
    ["shoulders", "三角肌"],
    ["biceps", "肱二頭肌"],
    ["triceps", "肱三頭肌"],
    ["forearms", "前臂肌群"],
    ["abs", "腹直肌／深層核心"],
    ["obliques", "腹斜肌"],
    ["upper_back", "斜方肌／菱形肌"],
    ["back", "背闊肌"],
    ["lower_back", "豎脊肌"],
    ["glutes", "臀肌群"],
    ["front_thigh", "股四頭肌"],
    ["back_thigh", "腿後肌群"],
    ["calves", "小腿後側"],
    ["adductors", "大腿內收肌群"],
  ].map(([id, name]) => Object.freeze({ id, name })),
);
const association = (primary, support = []) =>
  Object.freeze({
    primary: Object.freeze(primary),
    support: Object.freeze(support),
  });
export const MUSCLE_ROLES = Object.freeze({
  abdominal_bracing: association(['abs'],['obliques']),
  biceps_curl: association(["biceps"], ["forearms"]),
  incline_chest_press: association(["chest"], ["shoulders", "triceps"]),
  hip_adduction: association(["adductors"]),
  hip_abduction: association(["glutes"]),
  v_squat: association(["front_thigh", "glutes"], ["adductors"]),
  chest_press: association(["chest"], ["shoulders", "triceps"]),
  shoulder_press: association(["shoulders"], ["triceps"]),
  assisted_dip: association(["triceps", "chest"], ["shoulders"]),
  seated_row: association(
    ["upper_back", "back"],
    ["shoulders", "biceps", "forearms"],
  ),
  lat_pulldown: association(["back"], ["biceps", "forearms"]),
  assisted_pull_up: association(["back"], ["biceps", "forearms"]),
  assisted_chinup: association(["back"], ["biceps", "forearms"]),
  leg_press: association(["front_thigh", "glutes"]),
  leg_extension: association(["front_thigh"]),
  leg_curl: association(["back_thigh"], ["calves"]),
  squat: association(["front_thigh", "glutes"], ["abs"]),
  hip_hinge: association(["glutes", "back_thigh"], ["lower_back", "abs"]),
  glute_bridge: association(["glutes"], ["back_thigh", "abs"]),
  pallof_press: association(["obliques", "abs"]),
  single_leg_balance: association([]),
  calf_raise: association(["calves"]),
  dead_bug: association(["abs"], ["obliques"]),
});
export const EXERCISE_REGIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(MUSCLE_ROLES).map(([id, r]) => [
      id,
      Object.freeze([...r.primary, ...r.support]),
    ]),
  ),
);
export function summarizeMuscles(exercises) {
  const regions = BODY_REGIONS.map((r) => ({
    ...r,
    recordCount: 0,
    setCount: 0,
    primarySets: 0,
    supportSets: 0,
    painCount: 0,
    techniqueCount: 0,
    unknownCount: 0,
    exercises: [],
  }));
  let unmappedCount = 0;
  for (const exercise of exercises) {
    const roles = MUSCLE_ROLES[exercise.exerciseId],
      targets = EXERCISE_REGIONS[exercise.exerciseId] ?? [];
    if (!targets.length) {
      unmappedCount += exercise.sessions.length;
      continue;
    }
    const sessions = exercise.sessions,
      recordCount = sessions.length;
    if (!recordCount) continue;
    const setCount = sessions.reduce((n, r) => n + r.data.sets.length, 0);
    const painCount = sessions.filter((r) =>
      ["mild", "significant"].includes(r.data.pain),
    ).length;
    const techniqueCount = sessions.filter((r) =>
      ["corrected", "compensation", "failed"].includes(r.data.technique),
    ).length;
    const unknownCount = sessions.filter(
      (r) => r.data.pain === "unknown" || r.data.technique === "unknown",
    ).length;
    for (const id of targets) {
      const region = regions.find((r) => r.id === id),
        role = roles.primary.includes(id) ? "primary" : "support";
      for (const [key, value] of Object.entries({
        recordCount,
        setCount,
        painCount,
        techniqueCount,
        unknownCount,
      }))
        region[key] += value;
      region[role === "primary" ? "primarySets" : "supportSets"] += setCount;
      region.exercises.push({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        role,
        recordCount,
        setCount,
        painCount,
        techniqueCount,
        unknownCount,
        lastDate: sessions.at(-1).data.date,
      });
    }
  }
  return { regions, unmappedCount };
}
