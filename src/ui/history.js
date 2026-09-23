import { machineDisplayName } from './record-quality.js';
import { EXERCISES, INBODY_FIELDS } from "../domain/catalog.js";
import { el, button, formatDate } from "./dom.js";
import {LOCATIONS,PLAN_STATUS,TRIGGERS,RED_FLAGS} from '../domain/rehab.js';
import {BODY_REGIONS} from '../domain/muscles.js';

export function describeRecord(kind, data) {
  if(kind==='rehab'){
    const label=value=>({unknown:'未記錄',yes:'有',no:'無',left:'左',right:'右'}[value]);
    if(data.type==='plan')return [`調整部位：${data.regions.map(id=>BODY_REGIONS.find(r=>r.id===id).name).join('、')}`, ...data.items.map(i=>`${i.name} · ${PLAN_STATUS[i.status]} · ${EXERCISES.find(e=>e.id===i.exerciseId)?.name??'無對應紀錄'} · ${[i.dose,i.cue,i.next].filter(Boolean).join('；')}`)].join('／');
    return [data.locations.map(id=>LOCATIONS.find(([k])=>k===id)[1]).join('、')||'位置未填',data.score===null?'分數未填':`${data.score}/10`,`放射 ${label(data.radiation)}／麻木 ${label(data.numbness)}／無力 ${label(data.weakness)}`,`歪斜 ${label(data.deviation)} · 偏向 ${label(data.direction)}`,`型態：${data.qualities.join('、')||'未填'}`,`活動：${data.activity||'未填'}`,`訓練：${data.training||'未填'}`,`可能誘因：${data.triggers.map(id=>TRIGGERS.find(([k])=>k===id)[1]).join('、')||'未填'}`,`改善時間：${data.recovery||'未填'} · 隔天仍痛 ${label(data.nextDay)}`,...RED_FLAGS.map(([id,name])=>`${name}：${label(data.redFlags[id])}`)].join('；');
  }
  if (kind === "training")
    return `${EXERCISES.find((e) => e.id === data.exerciseId)?.name ?? data.exerciseId} · ${machineDisplayName(data.machine)}${data.loadBasis === "added_plates" ? " · 掛片總重（起始阻力另計）" : ""} · ${data.sets.map((s) => `${s.load ?? "自重"}${s.load === null ? "" : data.unit} × ${s.reps}`).join(" / ")}`;
  return INBODY_FIELDS.filter((f) => data.metrics[f.id] != null)
    .map((f) => `${f.label} ${data.metrics[f.id]}${f.unit}`)
    .join(" · ");
}
export function renderHistory(
  container,
  { records, conflicts, onEdit, onDelete, onResolve, onRepeat },
) {
  const archiveOpen = container.querySelector('.history-archive')?.open ?? false;
  const expanded = new Set([...container.querySelectorAll('.record-details[open]')].map(n=>n.dataset.recordId));
  container.replaceChildren(
    el(
      "div",
      { class: "section-title" },
      el("h2", {}, "紀錄庫"),
      el("span", { class: "muted" }, `${records.length} 筆`),
    ),
  );
  for (const conflict of conflicts) {
    const box = el(
      "article",
      { class: "conflict" },
      el("h3", {}, "這筆紀錄有不同版本"),
      el("p", {}, "請核對後選擇要保留的版本。處理前，這筆不納入趨勢。"),
    );
    for (const version of conflict.versions)
      box.append(
        el(
          "div",
          { class: "conflict-version" },
          el(
            "p",
            {},
            version.deleted
              ? "刪除此筆紀錄"
              : `${formatDate(version.data.date)} · ${describeRecord(version.kind, version.data)}`,
          ),
          version.data?.note ? el("p", {}, version.data.note) : null,
          version.kind === "training" && !version.deleted
            ? el(
                "p",
                {},
                `疼痛：${version.data.pain} · 動作：${version.data.technique}`,
              )
            : null,
          button(
            version.deleted ? "保留刪除" : "保留這個版本",
            () => onResolve(conflict, version),
            { class: "secondary" },
          ),
        ),
      );
    container.append(box);
  }
  if (!records.length)
    container.append(
      el("p", { class: "empty" }, "從今天第一筆開始。紀錄會先存入這支手機。"),
    );
  const archive = el('details', {class:'history-archive',open:archiveOpen}, el('summary',{},`查看 ${records.length} 筆紀錄`));
  if (records.length) container.append(archive);
  for (const record of [...records].reverse()) {
    const summary = record.kind==='rehab' ? (record.data.type==='plan'?'訓練調整計畫':`身體狀況 · ${record.data.score===null?'未量化':`${record.data.score}/10`}`) : record.kind === 'training'
      ? `${EXERCISES.find(e=>e.id===record.data.exerciseId)?.name ?? record.data.exerciseId} · ${record.data.sets.length} 組 · ${machineDisplayName(record.data.machine)}`
      : `InBody · ${record.data.metrics.weight == null ? '體重未填' : `${record.data.metrics.weight} kg`} · ${Object.values(record.data.metrics).filter(v=>v!=null).length} 項量測`;
    archive.append(
      el(
        "article",
        { class: "record" },
        el(
          "div",
          {},
          el("time", {}, `${formatDate(record.data.date)}${record.data.time ? ` ${record.data.time}（台灣時間）` : ""}`),
          el("p", {}, summary),
          el('details',{class:'record-details','data-record-id':record.recordId,open:expanded.has(record.recordId)},
          el('summary',{},'數值與備註'),
          el("p", {}, describeRecord(record.kind, record.data)),
          record.data.analysisExcludedReason
            ? el(
                "p",
                { class: "flag" },
                `不納入統計：${record.data.analysisExcludedReason}`,
              )
            : null,
          record.data.note
            ? el("p", { class: "muted" }, record.data.note)
            : null,
          record.data.measurementContext ? el("p",{class:"muted"},[record.data.measurementContext.device,record.data.measurementContext.conditions].filter(Boolean).join(" · ")) : null,
          ),
        ),
        el(
          "div",
          { class: "record-actions" },
          record.kind === "training" && !record.data.analysisExcludedReason && onRepeat ? button("再練一次",()=>onRepeat(record),{class:"quiet"}) : null,
          button("修改", () => onEdit(record), {
            "data-action": "edit",
            class: "quiet",
          }),
          button("刪除", () => onDelete(record), { class: "quiet danger" }),
        ),
      ),
    );
  }
}
