import { EXERCISES } from '../domain/catalog.js';
import { el } from './dom.js';

export function weightBasisLabel(data) {
  const metric = EXERCISES.find(exercise => exercise.id === data.exerciseId)?.metric;
  return metric === 'assistance' ? '輔助重量' : data.loadBasis === 'added_plates' ? '掛片重量（不含起始阻力）' : metric === 'bodyweight' ? '自體重量' : '重量';
}

// A tile is one recorded set; never flatten variable loads or convert units.
export function setStrip(data) {
  const metric = EXERCISES.find(exercise => exercise.id === data.exerciseId)?.metric;
  const sharedLoad = data.sets.length > 0 && data.sets.every(set => set.load === data.sets[0].load);
  const loadLabel = sharedLoad ? (data.sets[0].load === null ? '自重' : `${data.sets[0].load} ${data.unit}`) : '';
  return el('span', {class:`set-strip${sharedLoad ? ' shared-load' : ''}`},
    el('span', {class:'set-basis'}, weightBasisLabel(data),
      sharedLoad ? el('strong', {class:'set-shared-load'}, loadLabel) : null,
      el('span', {}, `${data.sets.length} 組`)),
    el('span', {class:'set-tiles'}, data.sets.map((set,index) => {
      const load = set.load === null ? '自重' : `${set.load} ${data.unit}`;
      const description = `${metric === 'assistance' ? '輔助 ' : data.loadBasis === 'added_plates' ? '掛片 ' : ''}${load}`;
      return el('span', {class:'set-tile', role:'img', 'aria-label':`第 ${index+1} 組，${description}，${set.reps} 次`},
        el('span', {class:'set-tile-index'}, `第 ${index+1} 組`),
        sharedLoad ? null : el('strong', {}, load),
        el('span', {class:'set-tile-reps'}, `${set.reps} 次`),
      );
    })),
  );
}
