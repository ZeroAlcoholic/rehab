import { machineDisplayName, displayRecordText } from './record-text.js';
import { trainingDay } from '../domain/training-day.js';
import { el, button, field, select, localDate } from './dom.js';
import { BODY_REGIONS } from '../domain/muscles.js';
import { EXERCISES } from '../domain/catalog.js';
import { drawBody } from './body-drawing.js';
import { exerciseIllustration } from './exercise-illustration.js';
import { setStrip } from './training-sets.js';

function bodyOverview(summary) {
  const model = {regions: BODY_REGIONS.map(region => summary.regions.find(r => r.id === region.id)
    ?? {...region, primarySets:0, supportSets:0, recordCount:0})};
  return el('div', {class:'day-body-overview'},
    el('div', {class:'day-body-views'}, ['front','back'].map(view => el('figure', {},
      drawBody(model, {view, mode:'session', interactive:false, labels:false, skeleton:false}),
      el('figcaption', {}, view === 'front' ? '正面' : '背面'),
    ))),
    el('div', {class:'day-body-legend'},
      [['primary','主要'],['support','協同'],['none','未記錄']].map(([tone,label]) =>
        el('span', {}, el('i', {'data-tone':tone,'aria-hidden':'true'}), label))),
    el('p', {class:'day-visual-caption'}, '動作對應示意 · 不代表刺激程度'),
  );
}

export function renderTrainingDay(container, records, { onEdit, conflicts = [] }) {
  const today = localDate();
  const conflictDates = conflicts.flatMap(conflict => conflict.versions
    .filter(version => version.kind === 'training' && version.data?.date)
    .map(version => version.data.date));
  const dates = [...new Set([
    ...records.filter(record => record.kind === 'training').map(record => record.data.date),
    ...conflictDates,
  ])].sort().reverse();
  const choices = [...new Set([today, ...dates])].sort().reverse();
  const selected = choices.includes(container.dataset.date) ? container.dataset.date : today;
  const chooser = select(choices.map(date => [date, date === today ? `今天 · ${date}` : date]), selected,
    {'aria-label':'查看哪一天的訓練'});
  const content = el('div');

  function show(date) {
    container.dataset.date = date;
    chooser.value = date;
    const summary = trainingDay(records, date);
    const primary = summary.regions.filter(r => r.primarySets);
    const support = summary.regions.filter(r => r.supportSets);
    const showRegion = id => {
      const details = container.querySelector('.day-region-details');
      details.open = true;
      const target = details.querySelector(`[data-region="${id}"]`);
      target.focus({preventScroll:true});
      target.scrollIntoView({block:'nearest'});
    };
    const regionChips = (regions, key) => regions.map(region => button(
      `${region.name} ${region[key]} 組`, () => showRegion(region.id), {class:'day-region-chip'},
    ));
    const children = [el('h2', {}, date === today ? '今天練了哪些' : `${date} 訓練紀錄`)];
    const conflictCount = conflicts.filter(conflict => conflict.versions.some(version =>
      version.kind === 'training' && version.data?.date === date,
    )).length;
    if (conflictCount) children.push(el('p', {class:'flag'},
      `${conflictCount} 筆訓練有版本衝突，尚未列入下方紀錄與部位摘要。`,
      el('a', {href:'#history'}, '前往紀錄庫核對'),
    ));
    if (!summary.records.length) {
      children.push(el('p', {}, conflictCount ? '請先核對衝突，才能確認這天的訓練內容。' : date === today ? '今天尚未記錄訓練。' : '這天尚無訓練紀錄。'));
      const latest = dates.find(d => d <= today);
      if (latest && latest !== date) children.push(button('看最近一次訓練', () => show(latest), {class:'secondary'}));
      content.replaceChildren(...children);
      return;
    }
    children.push(
      el('p', {class:'day-totals'}, `已記錄 ${summary.records.length} 筆紀錄 · ${summary.exerciseCount} 個動作 · ${summary.setCount} 組`),
      bodyOverview(summary),
      el('div', {class:'day-primary'}, el('strong', {}, '主要'), primary.length ? regionChips(primary, 'primarySets') : '尚無對應部位'),
      el('div', {class:'day-support'}, el('strong', {}, '協同'), support.length ? regionChips(support, 'supportSets') : '尚無對應部位'),
    );
    if (summary.excludedCount) children.push(el('p', {class:'muted'}, `${summary.excludedCount} 筆暖身／排除紀錄保留於下方，不計入動作、組數與部位摘要。`));
    if (summary.unmappedCount) children.push(el('p', {class:'muted'}, `${summary.unmappedCount} 筆動作沒有部位對應，仍保留紀錄與組數。`));
    if (summary.regions.length) children.push(el('details', {class:'day-region-details'},
      el('summary', {}, '查看部位對應明細'),
      el('p', {class:'muted'}, '依已記錄動作對應部位，不代表實際刺激程度或練得足夠；同一組可能涉及多個部位，部位組數不能相加。'),
      summary.regions.map(region => el('div', {class:'day-region', 'data-region':region.id, tabindex:-1},
        el('strong', {}, region.name),
        el('p', {}, region.exercises.map(exercise => `${exercise.name} · ${exercise.role === 'primary' ? '主要' : '協同'} ${exercise.setCount} 組`).join('；')),
      )),
    ));
    children.push(el('h3', {}, '當日紀錄'), ...summary.records.map(record => el('article', {class:'day-record'},
      el('div', {},
        record.data.time ? el('time', {class:'muted'}, `${record.data.time}（台灣時間）`) : null,
        el('div', {class:'equipment-identity'}, exerciseIllustration(record.data.exerciseId),
          el('div', {}, el('strong', {}, EXERCISES.find(e => e.id === record.data.exerciseId)?.name ?? record.data.exerciseId),
            el('p', {class:'muted'}, machineDisplayName(record.data.machine)))),
        setStrip(record.data),
        record.data.note ? el('details', {class:'day-note'}, el('summary', {}, '備註'), el('p', {}, displayRecordText(record.data.note))) : null,
        record.data.analysisExcludedReason ? el('p', {class:'flag'}, `不納入統計：${record.data.analysisExcludedReason}`) : null,
      ),
      button('修改這筆紀錄', () => onEdit(record), {class:'secondary'}),
    )));
    content.replaceChildren(...children);
  }
  chooser.addEventListener('change', () => show(chooser.value));
  container.replaceChildren(field('查看哪一天的訓練', chooser), content);
  show(selected);
}
