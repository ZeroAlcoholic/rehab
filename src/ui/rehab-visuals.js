import {BODY_OUTLINE} from './body-geometry.js';
import {LOCATIONS} from '../domain/rehab.js';
const NS='http://www.w3.org/2000/svg';
function node(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
export function painLocation(data){
  const svg=node('svg',{viewBox:'60 155 120 150',role:'img','aria-label':'所記錄不適位置，背面示意',class:'pain-location'});
  for(const {tag='path',...attrs}of BODY_OUTLINE)svg.append(node(tag,{...attrs,fill:'var(--surface-soft)',stroke:'var(--anatomy-line)','stroke-width':1}));
  const coords={lumbar_center:[120,205],left_lumbar:[105,205],right_lumbar:[135,205],left_glute:[101,256],right_glute:[139,256],left_ischium:[107,279],right_ischium:[133,279]};
  svg.append(node('path',{d:'M120 166V227 M93 233Q120 242 147 233 M120 245V277',stroke:'var(--anatomy-line)',fill:'none'}));
  for(const id of data.locations){const [cx,cy]=coords[id];const circle=node('circle',{cx,cy,r:6,fill:'var(--danger)',stroke:'var(--surface)','stroke-width':2,'data-pain-location':id});circle.append(node('title',{},LOCATIONS.find(([k])=>k===id)[1]));svg.append(circle);}
  svg.append(node('text',{x:70,y:173,'font-size':10,fill:'var(--muted)'},'左'),node('text',{x:161,y:173,'font-size':10,fill:'var(--muted)'},'右'));
  return svg;
}
export function painChart(points){
  const svg=node('svg',{viewBox:'0 0 320 120',role:'img','aria-label':'疼痛分數，0 至 10 分，依實際日期',class:'pain-chart'});
  const first=Date.parse(points[0].date),duration=Date.parse(points.at(-1).date)-first||1;
  const coords=points.map(p=>[28+(Date.parse(p.date)-first)/duration*272,94-p.value*7.5]);
  for(const value of [0,5,10]){const y=94-value*7.5;svg.append(node('path',{d:`M24 ${y}H307`,stroke:'var(--line)'}),node('text',{x:4,y:y+4,'font-size':10,fill:'var(--muted)'},String(value)));}
  if(points.length>1)svg.append(node('polyline',{points:coords.map(c=>c.join(',')).join(' '),fill:'none',stroke:'var(--danger)','stroke-width':2}));
  coords.forEach(([cx,cy],i)=>{const dot=node('circle',{cx,cy,r:4,fill:'var(--danger)'});dot.append(node('title',{},`${points[i].date} ${points[i].time} · ${points[i].value}/10`));svg.append(dot);});
  svg.append(node('text',{x:28,y:115,'font-size':10,fill:'var(--muted)'},points[0].date),node('text',{x:305,y:115,'font-size':10,'text-anchor':'end',fill:'var(--muted)'},points.at(-1).date));
  return svg;
}
