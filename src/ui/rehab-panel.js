import {el,button,localDate} from './dom.js';
import {LOCATIONS,PLAN_STATUS} from '../domain/rehab.js';
import {painChart,painLocation} from './rehab-visuals.js';

export function renderRehabAlert(model){
  return model.alert ? el('div',{class:`rehab-alert ${model.alert.level}`,role:'alert'},`${model.alert.date} · ${model.alert.text}`) : null;
}

export function renderRehab(model,{onSymptom,onPlan,onExercise,trendOpen=false,optionsOpen=false}={}){
  const root=el('section',{id:'rehab-panel',class:'rehab-panel'});
  const latest=model.latest?.data,today=latest?.date===localDate();
  const options=el('details',{class:'rehab-options',open:optionsOpen},el('summary',{},'訓練調整與不適追蹤'));
  options.append(el('div',{class:'section-title'},el('h3',{},'動作計畫'),button('編輯計畫',onPlan,{class:'quiet'})));
  const cards=el('div',{class:'rehab-cards'});
  for(const item of model.plan?.data.items??[]){
    const card=el('details',{class:'rehab-card','data-plan-item':item.id},el('summary',{},el('strong',{},item.name),el('span',{class:`rehab-status ${item.status}`},PLAN_STATUS[item.status])));
    if(item.dose)card.append(el('p',{},item.dose));
    if(item.cue)card.append(el('p',{class:'muted'},item.cue));
    if(item.next)card.append(el('p',{class:'muted'},item.next));
    if(item.exerciseId&&item.status!=='paused')card.append(button('記錄實際完成',()=>onExercise(item.exerciseId),{class:'quiet'}));
    cards.append(card);
  }
  options.append(cards,el('h3',{},'不適追蹤'),el('p',{class:'muted'},'訓練中的感受可隨該筆訓練記錄；這裡留給隔天、休息日或持續的不適。'),button('記錄不適',onSymptom,{class:'secondary'}));
  if(today)options.append(el('p',{class:'muted'},`今日已記錄${latest.score===null?'':` · 不適 ${latest.score}/10`}`));
  const trend=el('details',{class:'rehab-trend',open:trendOpen},el('summary',{},`位置與反應${model.symptoms.length?` · ${model.symptoms.length} 次`:''}`));
  if(latest)trend.append(el('p',{class:'muted'},`最近紀錄 ${latest.date} · ${latest.locations.map(id=>LOCATIONS.find(([k])=>k===id)[1]).join('、')||'位置未填'}`),painLocation(latest));
  if(model.points.length)trend.append(painChart(model.points));
  else trend.append(el('p',{class:'muted'},'尚無疼痛分數紀錄'));
  trend.append(el('p',{class:'muted'},'只呈現記錄，不推測病因。'));
  if(model.symptoms.length)options.append(trend);
  root.append(options);
  return root;
}
