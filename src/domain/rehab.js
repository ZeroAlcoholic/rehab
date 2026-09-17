import { BODY_REGIONS } from './muscles.js';
import { EXERCISES } from './catalog.js';

export const LOCATIONS = Object.freeze([
  ['lumbar_center','腰中央'],['left_lumbar','左腰'],['right_lumbar','右腰'],
  ['left_glute','左臀'],['right_glute','右臀'],['left_ischium','左坐骨附近'],['right_ischium','右坐骨附近'],
]);
export const TRIGGERS = Object.freeze([
  ['sitting','久坐'],['walking','走路／站立'],['travel','旅遊疲勞'],['cough','咳嗽／打噴嚏'],
  ['squat','深蹲'],['hinge','髖鉸鏈'],['unilateral','單側動作'],['rotation','旋轉／側彎'],['other','其他'],
]);
export const RED_FLAGS = Object.freeze([
  ['bladder_bowel','新出現排尿／大小便控制改變'],['saddle','新出現胯下／肛門周圍麻木'],
  ['bilateral_legs','新出現雙腿麻木／無力'],['sudden_weakness','新出現突然或加劇的腿無力'],
  ['fever','發燒／畏寒或全身不適'],['chest_breathing','胸痛／呼吸困難'],
]);
export const PLAN_STATUS = {review:'待確認',ready:'已確認',paused:'暫緩'};

export function validateRehab(data, v) {
  const common=['type','date','time'];
  const timestamp=()=>{
    const out={date:v.date(data.date)};
    if(data.time!==undefined){
      if(typeof data.time!=='string'||(data.time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time))) throw new Error('時間格式不正確');
      out.time=data.time;
    }
    return out;
  };
  const ids=(values,allowed,label)=>{
    if(!Array.isArray(values)||values.length>allowed.length||new Set(values).size!==values.length||values.some(x=>!allowed.includes(x))) throw new Error(`${label}不正確`);
    return [...values];
  };
  if(data?.type==='plan'){
    v.object(data,[...common,'regions','items'],'訓練調整');
    if(!Array.isArray(data.items)||data.items.length>20) throw new Error('動作卡最多 20 項');
    const items=data.items.map(item=>{
      v.object(item,['id','exerciseId','name','status','dose','cue','next'],'動作卡');
      const id=v.text(item.id,'動作卡 ID',100), name=v.text(item.name,'動作名稱',100);
      if(!id||!name) throw new Error('動作名稱與 ID 不可空白');
      return {id,name,exerciseId:v.option(item.exerciseId,['',...EXERCISES.map(e=>e.id)],'動作',''),status:v.option(item.status,Object.keys(PLAN_STATUS),'計畫狀態','review'),dose:v.text(item.dose,'起步方式',500),cue:v.text(item.cue,'動作提示',500),next:v.text(item.next,'下一步',500)};
    });
    if(new Set(items.map(i=>i.id)).size!==items.length) throw new Error('動作卡 ID 重複');
    return {type:'plan',...timestamp(),regions:ids(data.regions??[],BODY_REGIONS.map(r=>r.id),'調整部位'),items};
  }
  if(data?.type==='symptom'){
    v.object(data,[...common,'locations','score','activity','training','qualities','radiation','numbness','weakness','deviation','direction','triggers','recovery','nextDay','note','redFlags'],'身體狀況');
    v.object(data.redFlags??{},RED_FLAGS.map(([id])=>id),'警訊');
    const yesNo=(value)=>v.option(value,['unknown','no','yes'],'症狀狀態','unknown');
    return {
      type:'symptom',...timestamp(),locations:ids(data.locations??[],LOCATIONS.map(([id])=>id),'位置'),
      score:data.score==null?null:v.number(data.score,'疼痛分數',{max:10}),
      activity:v.text(data.activity,'活動',1000),training:v.text(data.training,'訓練內容',1000),
      qualities:ids(data.qualities??[],['酸','緊','抽痛','刺痛','電到／放射','卡住'],'型態'),
      radiation:yesNo(data.radiation),numbness:yesNo(data.numbness),weakness:yesNo(data.weakness),
      deviation:yesNo(data.deviation),direction:v.option(data.direction,['unknown','left','right'],'偏向','unknown'),
      triggers:ids(data.triggers??[],TRIGGERS.map(([id])=>id),'可能誘因'),
      recovery:v.text(data.recovery,'改善時間',1000),nextDay:yesNo(data.nextDay),note:v.text(data.note,'備註',2000),
      redFlags:Object.fromEntries(RED_FLAGS.map(([id])=>[id,yesNo(data.redFlags?.[id])])),
    };
  }
  throw new Error('未知身體狀況類型');
}
