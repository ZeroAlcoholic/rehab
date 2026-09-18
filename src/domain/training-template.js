// A new workout can reuse a setup, never an old observation or provenance.
export function repeatTraining(data, date) {
  const result = {
    date, exerciseId: data.exerciseId, machine: data.machine, unit: data.unit,
    sets: data.sets.map(s => ({...s})),
    pain: "unknown", technique: "unknown", note: "",
  };
  for (const key of ["loadBasis", "posture"])
    if (data[key] !== undefined) result[key] = data[key];
  // Copied uncertain loads/units remain uncertain until explicitly checked.
  if (data.review) result.review = {...data.review};
  return result;
}

export function startFromEquipment(data, date) {
  const result = repeatTraining(data, date);
  result.sets = result.sets.map((set) => ({ ...set, reps: null }));
  return result;
}
