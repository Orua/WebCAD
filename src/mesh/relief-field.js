import {meshError} from './mesh-contract.js';
const positive={type:'number',exclusiveMinimum:0};
export const reliefFieldSchema={type:'object',additionalProperties:false,required:['originMm','sizeMm','heightsMm'],properties:{
 originMm:{type:'array',items:{type:'number'},minItems:2,maxItems:2},
 sizeMm:{type:'array',items:positive,minItems:2,maxItems:2},
 heightsMm:{type:'array',minItems:2,maxItems:257,items:{type:'array',minItems:2,maxItems:257,items:{type:'number'}}}
}};
// Explicit physical target, never normalized or combined with max(old,target).
// Bilinear interpolation has no overshoot; rows run in positive support V.
export function prepareReliefField(field){
 const invalid=message=>{throw meshError('RELIEF_FIELD_INVALID',message);};
 const {originMm:o,sizeMm:size,heightsMm:h}=field||{};
 if(![o,size].every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite))||size.some(v=>v<=0)||!Array.isArray(h)||h.length<2||h.length>257||!Array.isArray(h[0])||h[0].length<2||h[0].length>257||h.some(row=>!Array.isArray(row)||row.length!==h[0].length||!row.every(Number.isFinite)))invalid('A rectangular 2..257 height grid, physical origin and positive size are required.');
 const dx=size[0]/(h[0].length-1),dy=size[1]/(h.length-1);
 return {spacingMm:[dx,dy],sample(u,v){
  const x=(u-o[0])/dx,y=(v-o[1])/dy;
  if(x< -1e-9||y< -1e-9||x>h[0].length-1+1e-9||y>h.length-1+1e-9)invalid('Target field must cover every unprotected editable sample.');
  const i=Math.min(h[0].length-2,Math.max(0,Math.floor(x))),j=Math.min(h.length-2,Math.max(0,Math.floor(y))),a=Math.max(0,Math.min(1,x-i)),b=Math.max(0,Math.min(1,y-j));
  return (h[j][i]*(1-a)+h[j][i+1]*a)*(1-b)+(h[j+1][i]*(1-a)+h[j+1][i+1]*a)*b;
 }};
}
