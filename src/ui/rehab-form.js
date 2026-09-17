import {el,field as labeledField,select,modal,submit,localDate,numberInput,button} from './dom.js';
import {LOCATIONS,TRIGGERS,RED_FLAGS,PLAN_STATUS} from '../domain/rehab.js';
import {BODY_REGIONS} from '../domain/muscles.js';
import {EXERCISES} from '../domain/catalog.js';

const yesNo=value=>select([['unknown','未記錄'],['no','無'],['yes','有']],value??'unknown');
const field=(label,control)=>{control.setAttribute('aria-label',label);return labeledField(label,control);};
function checks(options, selected=[]) {
  const controls=options.map(([id,label])=>({id,input:el('input',{type:'checkbox',checked:selected.includes(id),'aria-label':label}),label}));
  return {element:el('div',{class:'rehab-checks'},controls.map(c=>el('label',{},c.input,c.label))),value:()=>controls.filter(c=>c.input.checked).map(c=>c.id)};
}
export function openSymptom({data=null,editing=false,onSave}) {
  const d=data??{},view=modal(editing?'修改不適紀錄':'記錄不適'),form=el('form');
  const date=el('input',{type:'date',required:true,value:d.date??localDate()});
  const time=el('input',{type:'time',value:d.time??''});
  const location=checks(LOCATIONS,d.locations);
  const score=numberInput(d.score,{max:10,step:1});
  const signals=Object.fromEntries(['radiation','numbness','weakness','deviation','nextDay'].map(k=>[k,yesNo(d[k])]));
  const direction=select([['unknown','未記錄'],['left','左'],['right','右']],d.direction??'unknown');
  const triggers=checks(TRIGGERS,d.triggers),qualities=checks(['酸','緊','抽痛','刺痛','電到／放射','卡住'].map(s=>[s,s]),d.qualities);
  const textFields=Object.fromEntries(['activity','training','recovery','note'].map(k=>[k,el('textarea',{'aria-label':{activity:'當天活動',training:'相關訓練',recovery:'多久改善',note:'備註'}[k],rows:2,maxlength:k==='note'?2000:1000},d[k]??'')]));
  const flags=RED_FLAGS.map(([id,label])=>({id,label,input:yesNo(d.redFlags?.[id])}));
  form.append(
    el('div',{class:'form-grid'},field('日期',date),field('時間（台灣時間，選填）',time)),
    el('p',{},'不適位置'),location.element,field('疼痛分數（0–10，選填）',score),
    el('div',{class:'form-grid'},field('往腿放射',signals.radiation),field('麻木',signals.numbness),field('無力',signals.weakness)),
    el('details',{},el('summary',{},'活動與隔日反應'),field('當天活動',textFields.activity),field('相關訓練',textFields.training),el('p',{},'型態'),qualities.element,el('p',{},'可能誘因'),triggers.element,field('身體歪斜',signals.deviation),field('偏向',direction),field('多久改善',textFields.recovery),field('隔天仍痛',signals.nextDay)),
    el('details',{},el('summary',{},'警訊確認'),flags.map(c=>field(c.label,c.input))),
    field('備註',textFields.note),el('button',{type:'submit',class:'primary wide'},'儲存狀況'),
  );
  form.addEventListener('submit',e=>{e.preventDefault();submit(view,()=>onSave({
    type:'symptom',date:date.value,time:time.value,locations:location.value(),score:score.value===''?null:Number(score.value),
    ...Object.fromEntries(Object.entries(signals).map(([k,c])=>[k,c.value])),direction:direction.value,
    triggers:triggers.value(),qualities:qualities.value(),...Object.fromEntries(Object.entries(textFields).map(([k,c])=>[k,c.value])),
    redFlags:Object.fromEntries(flags.map(c=>[c.id,c.input.value])),
  }));});
  view.body.append(form);
}

export function openRehabPlan({data=null,onSave}) {
  const d=data??{items:[],regions:[]},view=modal('調整動作計畫'),form=el('form'),rows=el('div');
  const regions=checks(BODY_REGIONS.map(r=>[r.id,r.name]),d.regions),entries=[];
  function add(item={id:crypto.randomUUID(),status:'review'}){
    const c={id:item.id,removed:false};
    for(const key of ['name','dose','cue','next']) c[key]=el('input',{type:'text',value:item[key]??'',maxlength:key==='name'?100:500,required:key==='name'});
    c.exerciseId=select([['','不連結訓練動作'],...EXERCISES.map(e=>[e.id,e.name])],item.exerciseId??'');
    c.status=select(Object.entries(PLAN_STATUS),item.status);
    const row=el('fieldset',{},field('動作名稱',c.name),field('狀態',c.status),field('起步方式',c.dose),field('重點',c.cue),field('下一步',c.next),field('對應紀錄',c.exerciseId),button('移除',()=>{c.removed=true;row.remove();},{class:'quiet danger'}));
    rows.append(row);entries.push(c);
  }
  d.items.forEach(add);
  form.append(el('p',{class:'muted'},'記錄個別確認過的計畫；系統不核准動作安全性。'),rows,button('增加動作',()=>add(),{class:'secondary'}),el('details',{},el('summary',{},'人體圖調整範圍'),regions.element),el('button',{type:'submit',class:'primary wide'},'儲存計畫'));
  form.addEventListener('submit',e=>{e.preventDefault();submit(view,()=>onSave({type:'plan',date:localDate(),regions:regions.value(),items:entries.filter(c=>!c.removed).map(c=>({id:c.id,...Object.fromEntries(['name','dose','cue','next','exerciseId','status'].map(k=>[k,c[k].value]))}))}));});
  view.body.append(form);
}
