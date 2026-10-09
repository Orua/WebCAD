import polygonClipping from 'polygon-clipping';
import {strokeOutline} from './relief-curves.js';

// Join intersections in the editable 2D pattern, before creating BRep solids.
// Independent overlapping 3D cutters can leave coincident internal faces.
export function mergeStrokeRegions(regions,strokes,widthMm,heightMm,snapMm=0){
 if(!strokes?.length&&!snapMm)return regions;
 const scaled=ring=>ring.map(([x,y])=>[x*widthMm,y*heightMm]);
 const polygons=regions.map(r=>[scaled(r.outer),...r.holes.map(scaled)]);
 for(const stroke of strokes??[]){
  const points=stroke.points.map(([x,y])=>[x*widthMm,y*heightMm,0]);
  const ring=strokeOutline(points,[0,0,1],stroke.widthMm).map(p=>p.slice(0,2));
  polygons.push([ring]);
 }
 const cleanRing=ring=>{
  const snap=(n,extent)=>{const q=Math.round(n/snapMm)*snapMm;return Math.abs(n)<=extent?Math.max(-extent,Math.min(extent,q)):q;};
  const rounded=ring.map(([x,y])=>[snap(x,widthMm/2),snap(y,heightMm/2)]);
  return rounded.filter((p,i)=>!i||p.some((v,k)=>v!==rounded[i-1][k]));
 };
 const input=snapMm?polygons.map(([outer,...holes])=>{
  outer=cleanRing(outer);if(new Set(outer.map(p=>p.join(','))).size<3)throw new Error('清理精度大于某个图案尺寸，请减小精度');
  return[outer,...holes.map(cleanRing).filter(r=>new Set(r.map(p=>p.join(','))).size>=3)];
 }):polygons;
 const merged=polygonClipping.union(...input);
 const normalize=ring=>ring.slice(0,-1).map(([x,y])=>[x/widthMm,y/heightMm]);
 const count=merged.reduce((sum,p)=>sum+p.reduce((s,r)=>s+r.length,0),0);
 if(count>64000||merged.length>1024)throw new Error('合并后的刻线超过 1024 区或 64000 点，请分层处理');
 return merged.map(([outer,...holes])=>({outer:normalize(outer),holes:holes.map(normalize)}));
}
