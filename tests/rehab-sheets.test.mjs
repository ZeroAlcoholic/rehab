import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheets} from '../src/google/sheets.js';
import {makeEvent} from '../src/domain/journal.js';
const H=['id','record_id','parents_json','created_at','deleted','date','exercise_id','data_json'];
const meta=v=>[['key','value'],['app','rehab-log'],['schemaVersion',v]];
const core=v=>({spreadsheetId:'s',valueRanges:[{values:meta(v)},{values:[H]},{values:[H]}]});
const event=()=>makeEvent({id:'r',kind:'rehab',data:{type:'symptom',date:'2026-09-16',locations:['right_ischium'],score:3}});
const transport=replies=>{const calls=[];return {calls,fetchImpl:async(url,options)=>{calls.push({url:String(url),...options});const r=replies.shift();assert.ok(r,'unexpected network request');return new Response(JSON.stringify(r.body??r),{status:r.status??200});}};};
test('legacy Sheet upgrades atomically before rehab append; v2 reads all three journals',async()=>{
  const e=event();
  const row=[e.id,e.recordId,'[]',e.createdAt,'false',e.data.date,'',JSON.stringify(e.data)];
  const io=transport([core('1'),{spreadsheetId:'s',sheets:[{properties:{title:'_meta',sheetId:7}},{properties:{title:'training_log',sheetId:8}},{properties:{title:'inbody',sheetId:9}}]}, {spreadsheetId:'s'}, {spreadsheetId:'s',updates:{updatedRows:1}},core('2'),{spreadsheetId:'s',valueRanges:[{values:[H,row]}]}]);
  const s=createSheets({getToken:()=> 't',fetchImpl:io.fetchImpl});
  await s.read('s');await s.append('s',[e]);
  const migration=JSON.parse(io.calls[2].body);
  assert.equal(migration.requests[0].addSheet.properties.title,'rehab_log');
  assert.equal(migration.requests.length,3);
  assert.equal(migration.requests[2].updateCells.start.sheetId,7);
  assert.equal(migration.requests[2].updateCells.rows[0].values[0].userEnteredValue.stringValue,'2');
  assert.match(io.calls[3].url,/rehab_log/);
  assert.deepEqual(await s.read('s'),[e]);
});
test('failed upgrade performs no append; missing v2 rehab journal never degrades to an empty log',async()=>{
  const io=transport([core('1'),{spreadsheetId:'s',sheets:[{properties:{title:'_meta',sheetId:0}}]},{status:500,body:{error:'fail'}}]);
  const s=createSheets({getToken:()=> 't',fetchImpl:io.fetchImpl});
  await s.read('s');await assert.rejects(s.append('s',[event()]));
  assert.equal(io.calls.some(c=>c.url.includes(':append')),false);
  const broken=transport([core('2'),{spreadsheetId:'s',valueRanges:[{values:[['wrong']]}]}]);
  await assert.rejects(createSheets({getToken:()=> 't',fetchImpl:broken.fetchImpl}).read('s'));
});

test('v2 secondary read preserves authorization and network failure categories',async()=>{
  for(const [status,code]of [[401,'auth'],[429,'rate-limit'],[403,'remote']]){
    const io=transport([core('2'),{status,body:{error:'test'}}]);
    await assert.rejects(createSheets({getToken:()=> 't',fetchImpl:io.fetchImpl}).read('s'),{code});
  }
});
