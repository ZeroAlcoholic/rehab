import { equipmentShortcuts } from "../domain/equipment-shortcuts.js";
import { BODY_REGIONS, MUSCLE_ROLES } from "../domain/muscles.js";
import { el, field, select, button } from "./dom.js";
import { exerciseIllustration } from './exercise-illustration.js';
import { setStrip, weightBasisLabel } from './training-sets.js';
import { machineDisplayName } from './record-quality.js';

const PRIMARY_LIMIT = 6;

function shortcutButton(shortcut, onSelect) {
  const machine = machineDisplayName(shortcut.machine);
  return el(
    "button",
    {
      type: "button",
      class: "equipment-shortcut",
      onClick: () => onSelect(shortcut.record),
      "aria-label": `記錄 ${shortcut.name}，${machine}，${weightBasisLabel(shortcut.record.data)}${shortcut.metric === 'bodyweight' ? '' : ` ${shortcut.unit}`}`,
    },
    el('span', {class:'equipment-identity'}, exerciseIllustration(shortcut.record.data.exerciseId),
      el('span', {}, el('strong', {}, shortcut.name), el('span', {class:'equipment-name'}, machine))),
    el('span', {class:'equipment-card-meta'}, el("small", {}, `前次 ${shortcut.record.data.date}`),
      el('span', {class:'equipment-action','aria-hidden':'true'}, '記錄 ›')),
    setStrip(shortcut.record.data),
  );
}

export function renderEquipmentShortcuts(container, records, { onSelect, regionId }) {
  const previousSearch = container.querySelector('[type="search"]')?.value ?? "";
  const previousRegion = container.querySelector('select')?.value ?? "";
  const wasFiltering = container.querySelector('.equipment-search')?.open ?? false;
  const shortcuts = equipmentShortcuts(records);
  if (!shortcuts.length) {
    container.replaceChildren(
      el(
        "p",
        { class: "equipment-empty" },
        "第一次從「其他器材」記錄；之後會在這裡直接選器材。",
      ),
    );
    return;
  }
  const search = el('input', {type:'search', value:regionId !== undefined ? '' : previousSearch,
    placeholder:'動作、機台名稱或位置', 'aria-label':'搜尋已記錄器材'});
  const region = select([['','全部部位'], ...BODY_REGIONS.map(r=>[r.id,r.name])], regionId ?? previousRegion,
    {'aria-label':'依訓練部位找器材'});
  const results = el('div', {class:'equipment-results'});
  const count = el('p', {class:'equipment-count', role:'status'});
  function draw() {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const filtered = shortcuts.filter(shortcut => {
      const roles = MUSCLE_ROLES[shortcut.record.data.exerciseId];
      const matchesRegion = !region.value || roles?.primary.includes(region.value) || roles?.support.includes(region.value);
      const text = `${shortcut.name} ${shortcut.machine} ${shortcut.unit}`.toLocaleLowerCase();
      return matchesRegion && terms.every(term => text.includes(term));
    });
    const filtering = terms.length || region.value;
    const primary = filtering ? filtered : filtered.slice(0, PRIMARY_LIMIT);
    const additional = filtering ? [] : filtered.slice(PRIMARY_LIMIT);
    const children = primary.map(shortcut => shortcutButton(shortcut, onSelect));
    if (additional.length) children.push(el(
      'details', {class:'equipment-more'},
      el('summary', {}, `其他已記錄器材（${additional.length}）`),
      el('div', {class:'equipment-more-grid'}, additional.map(shortcut => shortcutButton(shortcut, onSelect))),
    ));
    if (!filtered.length) children.push(el(
      'p', {class:'equipment-empty'}, '沒有符合的已記錄器材，請調整或清除篩選。',
    ));
    results.replaceChildren(...children);
    count.textContent = filtering
      ? `找到 ${filtered.length} 項器材／動作${region.value ? '（含主要與協同部位）' : ''}`
      : `最近使用 · 共 ${shortcuts.length} 項器材／動作`;
  }
  search.addEventListener('input', draw);
  region.addEventListener('change', draw);
  container.replaceChildren(
    el('details',{class:'equipment-search',open:wasFiltering || Boolean(search.value || region.value)},
      el('summary',{},'依部位找器材／搜尋'),
      el('div',{class:'equipment-filters'},field('依訓練部位找器材',region),
        button('清除篩選',()=>{search.value='';region.value='';draw();region.focus();},{class:'quiet'})),
      field('搜尋已記錄器材',search)), count, results);
  draw();
}
