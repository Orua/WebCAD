import {LIMITS} from '../limits.js';
import {meshError} from './mesh-contract.js';
import {legacyReliefParams} from '../relief-param-migration.js';
const point2={type:'array',items:{type:'number'},minItems:2,maxItems:2};
const positive={type:'number',exclusiveMinimum:0};
export const reliefPlateExample={version:1,widthMm:30,depthMm:20,thicknessMm:2,spacingMm:.25,bumps:[{centerMm:[0,0],heightMm:1,plateauRadiusMm:1,outerRadiusMm:3}]};
export const reliefPlateOperation={description:'浮雕网格底板 / Relief mesh plate',refs:0,paramsSchema:{type:'object',additionalProperties:false,required:['version','widthMm','depthMm','thicknessMm','spacingMm','bumps'],properties:{version:{type:'integer',const:1},widthMm:positive,depthMm:positive,thicknessMm:positive,spacingMm:positive,bumps:{type:'array',maxItems:64,items:{type:'object',additionalProperties:false,required:['centerMm','heightMm','plateauRadiusMm','outerRadiusMm'],properties:{centerMm:point2,heightMm:{type:'number'},plateauRadiusMm:{type:'number',minimum:0},outerRadiusMm:positive}}}}},notes:'Centered XY plate, support z=0 and back z=-thicknessMm. Explicit radial profiles use plateau plus cubic smoothstep shoulder, add signed heights; overlapping contributions add. Float64 regular triangulated surface; spacing is physical maximum cell size, not precision guarantee. No hidden normalization. Preserve this recipe in native project; output mesh, not BRep or STEP. Bumps must remain inside the plate, height must leave positive material, and total mesh is capped at 200000 triangles. New object placement uses the normal shared creation frame.'};
export function makeReliefPlate(p){
 p=legacyReliefParams('meshReliefPlate',p);
 if(p.version!==1||['widthMm','depthMm','thicknessMm','spacingMm'].some(k=>!Number.isFinite(p[k])||p[k]<=0)||!Array.isArray(p.bumps)||p.bumps.length>64)throw meshError('RELIEF_PLATE_INVALID','Explicit positive plate dimensions, spacing and version 1 required.');
 const nx=Math.ceil(p.widthMm/p.spacingMm),ny=Math.ceil(p.depthMm/p.spacingMm);
 if(nx<1||ny<1||nx*ny*4+4*(nx+ny)>LIMITS.meshReliefPlate.maxTriangles)throw meshError('RELIEF_EDIT_CAPACITY','Plate resolution exceeds 200000 triangles.');
 for(const b of p.bumps)if(!Array.isArray(b.centerMm)||b.centerMm.length!==2||!b.centerMm.every(Number.isFinite)||!Number.isFinite(b.heightMm)||!Number.isFinite(b.plateauRadiusMm)||b.plateauRadiusMm<0||!Number.isFinite(b.outerRadiusMm)||b.outerRadiusMm<=b.plateauRadiusMm||Math.abs(b.centerMm[0])+b.outerRadiusMm>p.widthMm/2||Math.abs(b.centerMm[1])+b.outerRadiusMm>p.depthMm/2)throw meshError('RELIEF_PLATE_INVALID','Radial profiles require a finite center, outer radius above plateau radius, and room inside the plate.');
 const row=nx+1,count=row*(ny+1),positions=new Float64Array(count*6),indices=[];
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=-p.widthMm/2+p.widthMm*i/nx,y=-p.depthMm/2+p.depthMm*j/ny;let z=0;
  for(const b of p.bumps){const r=Math.hypot(x-b.centerMm[0],y-b.centerMm[1]),t=Math.max(0,Math.min(1,(r-b.plateauRadiusMm)/(b.outerRadiusMm-b.plateauRadiusMm)));z+=b.heightMm*(1-t*t*(3-2*t));}
  if(z<=-p.thicknessMm+1e-8)throw meshError('RELIEF_THICKNESS','Profile crosses the back of the plate.');const k=j*row+i;positions.set([x,y,z],k*3);positions.set([x,y,-p.thicknessMm],(count+k)*3);
 }
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*row+i,b=a+1,c=a+row,d=c+1;indices.push(a,b,d,a,d,c,count+a,count+d,count+b,count+a,count+c,count+d);}
 const rim=[];for(let i=0;i<nx;i++)rim.push(i);for(let j=0;j<ny;j++)rim.push(j*row+nx);for(let i=nx;i>0;i--)rim.push(ny*row+i);for(let j=ny;j>0;j--)rim.push(j*row);
 for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];indices.push(a,count+a,count+b,a,count+b,b);}
 return {positions,indices:new Uint32Array(indices)};
}
