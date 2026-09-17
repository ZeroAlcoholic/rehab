import { compareRecordOrder } from './records.js';

export function analyzeRehab(records, to=null) {
  const rows=records.filter(r=>r.kind==='rehab'&&(!to||r.data.date<=to)).slice().sort(compareRecordOrder);
  const plan=rows.filter(r=>r.data.type==='plan').at(-1)??null;
  const symptoms=rows.filter(r=>r.data.type==='symptom');
  const latest=symptoms.at(-1)??null;
  // A blank follow-up cannot clear a previously reported warning.
  const known=(key)=>symptoms.slice().reverse().find(r=>(key==='weakness'?r.data.weakness:r.data.redFlags[key])!=='unknown');
  const fields=['bladder_bowel','saddle','bilateral_legs','chest_breathing','sudden_weakness','fever','weakness'];
  const observations=Object.fromEntries(fields.map(k=>[k,known(k)]));
  const flags=Object.fromEntries(fields.map(k=>[k,k==='weakness'?observations[k]?.data.weakness:observations[k]?.data.redFlags[k]]));
  const emergency=['bladder_bowel','saddle','bilateral_legs','chest_breathing'].some(k=>flags[k]==='yes');
  const urgent=flags.sudden_weakness==='yes'||flags.fever==='yes'||flags.weakness==='yes';
  const alert=emergency?{level:'emergency',text:'這筆紀錄有就醫警訊，請立即就醫。'}:urgent?{level:'urgent',text:'這筆紀錄需儘速接受醫療評估。'}:null;
  const alertFields=emergency?['bladder_bowel','saddle','bilateral_legs','chest_breathing']:['sudden_weakness','fever','weakness'];
  if(alert)alert.date=alertFields.filter(k=>flags[k]==='yes').map(k=>observations[k]).sort(compareRecordOrder).at(-1).data.date;
  return {plan,symptoms,latest,alert,regions:plan?.data.regions??[],points:symptoms.filter(r=>r.data.score!==null).map(r=>({date:r.data.date,time:r.data.time??'',value:r.data.score,recordId:r.recordId}))};
}
