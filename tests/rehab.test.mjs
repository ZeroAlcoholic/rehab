import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord } from '../src/domain/records.js';
import { makeEvent, project, mergeEvents } from '../src/domain/journal.js';
import { analyze } from '../src/domain/analytics.js';
import { buildBodyInsights } from '../src/domain/body-insights.js';
import {compareSessions} from '../src/domain/comparison.js';

const plan = {type:'plan',date:'2026-09-16',regions:['abs','obliques','lower_back'],items:[{id:'brace',exerciseId:'abdominal_bracing',name:'仰躺輕收腹呼吸',status:'review',dose:'先確認，再少量試做',cue:'自然呼吸',next:'依反應調整'}]};
test('rehab plan stores actionable guidance, rejects embedded medical history and unknown targets',()=>{
  assert.equal(validateRecord('rehab',plan).items[0].status,'review');
  assert.throws(()=>validateRecord('rehab',{...plan,history:'private diagnosis'}));
  assert.throws(()=>validateRecord('rehab',{...plan,regions:['invented']}));
  assert.throws(()=>validateRecord('rehab',{...plan,items:[{...plan.items[0],status:'safe'}]}));
});
test('new symptom entries preserve unknowns rather than importing old negative screens',()=>{
  const r=validateRecord('rehab',{type:'symptom',date:'2026-09-16',locations:['right_ischium'],score:null});
  assert.equal(r.score,null);
  assert.equal(r.radiation,'unknown');
  assert.equal(r.weakness,'unknown');
  assert.equal(r.redFlags.bladder_bowel,'unknown');
  for(const score of [-1,11,NaN]) assert.throws(()=>validateRecord('rehab',{...r,score}));
  assert.throws(()=>validateRecord('rehab',{...r,locations:['sciatica']}));
});
test('rehab journal round-trips and edits without inflating training or InBody counts',()=>{
  const first=makeEvent({id:'p1',kind:'rehab',data:plan});
  const next=makeEvent({id:'p2',recordId:first.recordId,parents:[first.id],kind:'rehab',data:{...plan,items:[{...plan.items[0],status:'paused'}]}});
  const result=project(mergeEvents(JSON.parse(JSON.stringify([first,next]))));
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].data.items[0].status,'paused');
  const analysis=analyze(result.records);
  assert.equal(analysis.trainingCount,0);
  assert.equal(analysis.inbodyCount,0);
  assert.equal(analysis.rehab.plan.data.items[0].status,'paused');
});
test('symptom score trend uses actual scored events and never clears new red flags using earlier negatives',()=>{
  const rec=(id,date,score,extra={})=>({recordId:id,kind:'rehab',data:validateRecord('rehab',{type:'symptom',date,score,locations:['right_ischium'],...extra})});
  const rows=[rec('a','2026-08-24',null,{redFlags:{bladder_bowel:'no'}}),rec('b','2026-09-10',3),rec('c','2026-09-16',5,{redFlags:{bladder_bowel:'yes'}})];
  const m=analyze(rows,{from:'2026-09-01',to:'2026-09-16'}).rehab;
  assert.equal(m.points.length,2);
  assert.equal(m.alert.level,'emergency');
  assert.equal(m.latest.data.radiation,'unknown');
  assert.equal(m.latest.data.locations[0],'right_ischium');
  assert.equal(analyze([rows[0]]).rehab.alert,null);
  const next=rec('d','2026-09-17',1);
  assert.equal(analyze([...rows,next]).rehab.alert.date,'2026-09-16');
  assert.equal(analyze([...rows,{...next,data:{...next.data,redFlags:{...next.data.redFlags,fever:'yes'}}}]).rehab.alert.date,'2026-09-16');
  assert.equal(analyze([...rows,{...next,data:{...next.data,redFlags:{...next.data.redFlags,bladder_bowel:'no'}}}]).rehab.alert,null);
});

test('breathing practice counts do not become a strength progression claim',()=>{
  const d={date:'2026-09-15',exerciseId:'abdominal_bracing',machine:'',unit:'kg',sets:[{load:null,reps:3}],pain:'none',technique:'stable',note:''};
  assert.equal(compareSessions(d,{...d,date:'2026-09-16',sets:[{load:null,reps:5}]}).status,'insufficient');
});
test('restricted regions stay out of fill-gap candidates without altering raw muscle coverage',()=>{
  const data={date:'2026-09-15',exerciseId:'chest_press',machine:'A',unit:'kg',sets:[{load:30,reps:12}],pain:'none',technique:'stable',note:''};
  const ex=analyze([{recordId:'t',kind:'training',data}]).exercises;
  const m=buildBodyInsights(ex,{rehabRegions:['abs','obliques','lower_back']});
  assert.ok(!m.focus.baseline.some(r=>['abs','obliques','lower_back'].includes(r.id)));
  assert.equal(m.regions.find(r=>r.id==='abs').coverage,'none');
  assert.equal(m.focus.adjust.length,3);
});
