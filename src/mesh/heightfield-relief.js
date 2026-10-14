// Heightfield relief: grayscale grid -> watertight mm mesh (solid for STL/3D print).
// Resolution is bounded by MESH_LIMITS (millions of samples), not by the 4–65
// B-spline control grid used by the exact-BRep relief.
import {meshError} from './mesh-contract.js';
import {legacyReliefParams} from '../relief-param-migration.js';
import {MESH_LIMITS} from './mesh-contract.js';
const positive={type:'number',exclusiveMinimum:0};
import {LIMITS} from '../limits.js';
export const HEIGHTFIELD_LIMITS=LIMITS.heightfield;
export const SCULPT_MODES=Object.freeze(['raise','lower','smooth','flatten']);
export const heightfieldReliefExample={version:1,widthMm:20,depthMm:20,baseMm:1,heightMm:1.5,columns:3,rows:3,heights:{encoding:'u8',data:'AAAAAP8AAAAA'},invert:false,gamma:1,smoothing:0,edgeFadeMm:0};
export const heightfieldReliefOperation={description:'高度图浮雕 / Heightfield relief',refs:0,paramsSchema:{type:'object',additionalProperties:false,required:['version','widthMm','depthMm','baseMm','heightMm','columns','rows','heights'],properties:{
 version:{type:'integer',const:1},widthMm:positive,depthMm:positive,baseMm:positive,heightMm:{type:'number',exclusiveMinimum:0,maximum:HEIGHTFIELD_LIMITS.maxHeightMm},
 columns:{type:'integer',minimum:HEIGHTFIELD_LIMITS.minSide,maximum:HEIGHTFIELD_LIMITS.maxSide},rows:{type:'integer',minimum:HEIGHTFIELD_LIMITS.minSide,maximum:HEIGHTFIELD_LIMITS.maxSide},
 heights:{type:'object',additionalProperties:false,required:['encoding'],properties:{encoding:{type:'string',enum:['u8','u16le']},data:{type:'string',maxLength:8*1024*1024},importKey:{type:'string',minLength:1,maxLength:64}}},
 sculpt:{type:'array',maxItems:HEIGHTFIELD_LIMITS.maxStrokes,items:{type:'object',additionalProperties:false,required:['mode','radiusMm','strength','points'],properties:{mode:{type:'string',enum:['raise','lower','smooth','flatten']},radiusMm:positive,strength:{type:'number',minimum:0,maximum:10},targetMm:{type:'number'},points:{type:'array',maxItems:HEIGHTFIELD_LIMITS.maxStrokePoints,items:{type:'number'}}}}},
 invert:{type:'boolean'},gamma:{type:'number',minimum:.2,maximum:5},smoothing:{type:'integer',minimum:0,maximum:HEIGHTFIELD_LIMITS.maxSmoothing},edgeFadeMm:{type:'number',minimum:0}}},
 notes:'Row-major grayscale samples, row 0 = image top (+Y). White is high unless invert. z: back 0, base top baseMm, peak baseMm+heightMm; centered XY. gamma shapes the height curve, smoothing = 3x3 blur passes, edgeFadeMm ramps heights to the base near the border. heights is inline base64 data or importKey of a binary project asset (format heightmap). sculpt: ordered brush strokes {mode raise|lower (strength mm per dab)|smooth|flatten (strength 0–1, flatten to targetMm), radiusMm, points [x,y,...] mm in relief-local XY} replayed deterministically after gamma/fade. Output is a closed, outward-oriented triangle mesh (STL/3D print), not a BRep/STEP. Samples capped at 1.9 M (about 3.8 M triangles).'};
function decodeHeights({encoding,data},count,assetBytes){
 let bytes;if(assetBytes)bytes=assetBytes;else try{bytes=typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(data,'base64')):Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{throw meshError('HEIGHTFIELD_INVALID','heights.data must be base64.');}
 const out=new Float32Array(count);
 if(encoding==='u8'){if(bytes.length!==count)throw meshError('HEIGHTFIELD_INVALID',`Expected ${count} u8 samples, got ${bytes.length}.`);for(let i=0;i<count;i++)out[i]=bytes[i]/255;}
 else{if(bytes.length!==count*2)throw meshError('HEIGHTFIELD_INVALID',`Expected ${count} u16le samples.`);for(let i=0;i<count;i++)out[i]=(bytes[2*i]|bytes[2*i+1]<<8)/65535;}
 return out;
}
function blur(h,c,r){const out=new Float32Array(h.length);
 for(let j=0;j<r;j++)for(let i=0;i<c;i++){let s=0,n=0;for(let dj=-1;dj<=1;dj++){const y=j+dj;if(y<0||y>=r)continue;for(let di=-1;di<=1;di++){const x=i+di;if(x<0||x>=c)continue;s+=h[y*c+x];n++;}}out[j*c+i]=s/n;}
 return out;}
export function heightfieldSamples(p,assetBytes){
 p=legacyReliefParams('meshHeightfieldRelief',p);
 const fail=m=>{throw meshError('HEIGHTFIELD_INVALID',m);};
 if(p.version!==1)fail('version must be 1');
 for(const k of ['widthMm','depthMm','baseMm','heightMm'])if(!Number.isFinite(p[k])||p[k]<=0)fail(`${k} must be positive`);
 if(p.heightMm>HEIGHTFIELD_LIMITS.maxHeightMm)fail('heightMm too large');
 const {columns:c,rows:r}=p;if(![c,r].every(n=>Number.isInteger(n)&&n>=HEIGHTFIELD_LIMITS.minSide&&n<=HEIGHTFIELD_LIMITS.maxSide))fail('columns/rows must be integers 2–2049');
 if(c*r>HEIGHTFIELD_LIMITS.maxSamples)throw meshError('RELIEF_EDIT_CAPACITY',`Heightfield exceeds ${HEIGHTFIELD_LIMITS.maxSamples} samples.`);
 const gamma=p.gamma??1,smoothing=p.smoothing??0,fade=p.edgeFadeMm??0;
 if(!(gamma>=.2&&gamma<=5)||!Number.isInteger(smoothing)||smoothing<0||smoothing>HEIGHTFIELD_LIMITS.maxSmoothing||!(fade>=0))fail('gamma 0.2–5, smoothing 0–8, edgeFadeMm ≥ 0');
 if(!assetBytes&&typeof p.heights?.data!=='string')fail('heights.data or a heightmap asset is required');
 let h=decodeHeights(p.heights||{},c*r,assetBytes);
 if(p.invert)for(let i=0;i<h.length;i++)h[i]=1-h[i];
 for(let s=0;s<smoothing;s++)h=blur(h,c,r);
 const dx=p.widthMm/(c-1),dy=p.depthMm/(r-1);
 for(let j=0;j<r;j++)for(let i=0;i<c;i++){const k=j*c+i;let v=gamma===1?h[k]:Math.pow(h[k],gamma);
  if(fade>0){const d=Math.min(i*dx,(c-1-i)*dx,j*dy,(r-1-j)*dy),t=Math.min(1,d/fade);v*=t*t*(3-2*t);}
  h[k]=v*p.heightMm;}
 if(p.sculpt?.length)applySculpt(h,p);
 return h;
}
export function makeHeightfieldRelief(p,assetBytes){
 p=legacyReliefParams('meshHeightfieldRelief',p);
 const h=heightfieldSamples(p,assetBytes),{columns:c,rows:r}=p,top=c*r;
 const rim=[];for(let i=0;i<c-1;i++)rim.push(i);for(let j=0;j<r-1;j++)rim.push(j*c+c-1);for(let i=c-1;i>0;i--)rim.push((r-1)*c+i);for(let j=r-1;j>0;j--)rim.push(j*c);
 const vertexCount=top+rim.length+1,triangles=2*(c-1)*(r-1)+3*rim.length;
 if(triangles>MESH_LIMITS.maxResultTriangles)throw meshError('RELIEF_EDIT_CAPACITY','Heightfield mesh exceeds the result triangle limit.');
 const positions=new Float64Array(vertexCount*3),indices=new Uint32Array(triangles*3);let t=0;
 const x0=-p.widthMm/2,y0=p.depthMm/2,dx=p.widthMm/(c-1),dy=p.depthMm/(r-1);
 for(let j=0;j<r;j++)for(let i=0;i<c;i++){const k=j*c+i;positions[k*3]=x0+i*dx;positions[k*3+1]=y0-j*dy;positions[k*3+2]=p.baseMm+h[k];}
 // Row j increases toward -Y, so (a,c,b) winding faces +Z.
 for(let j=0;j<r-1;j++)for(let i=0;i<c-1;i++){const a=j*c+i,b=a+1,d=a+c,e=d+1;
  // Split along the diagonal with the smaller height jump to keep ridges crisp.
  if(Math.abs(h[a]-h[e])<=Math.abs(h[b]-h[d])){indices.set([a,d,e,a,e,b],t);}else{indices.set([a,d,b,b,d,e],t);}t+=6;}
 rim.forEach((k,n)=>{const v=top+n;positions[v*3]=positions[k*3];positions[v*3+1]=positions[k*3+1];positions[v*3+2]=0;});
 const center=top+rim.length;positions[center*3]=0;positions[center*3+1]=0;positions[center*3+2]=0;
 // Rim runs clockwise seen from +Z (top edge left->right is +X at +Y), so walls use (a,b,bb) and the bottom fan (center,aa,bb) faces -Z.
 for(let n=0;n<rim.length;n++){const m=(n+1)%rim.length,a=rim[n],b=rim[m],aa=top+n,bb=top+m;indices.set([a,bb,aa,a,b,bb],t);t+=6;indices.set([center,aa,bb],t);t+=3;}
 return {positions,indices};
}

// Deterministic brush replay on the sample grid. Each point is one dab with a
// smooth (1-(d/r)^2)^2 falloff; smooth/flatten blend toward a local average or
// targetMm. Heights stay above -0.9*baseMm so the back is never pierced.
export function applySculpt(h,p){
 const fail=m=>{throw meshError('HEIGHTFIELD_SCULPT_INVALID',m);};
 const {columns:c,rows:r}=p,dx=p.widthMm/(c-1),dy=p.depthMm/(r-1),floor=-.9*p.baseMm,ceil=HEIGHTFIELD_LIMITS.maxHeightMm;
 if(!Array.isArray(p.sculpt)||p.sculpt.length>HEIGHTFIELD_LIMITS.maxStrokes)fail(`At most ${HEIGHTFIELD_LIMITS.maxStrokes} strokes`);
 let total=0;
 for(const s of p.sculpt){
  if(!SCULPT_MODES.includes(s.mode)||!(s.radiusMm>0)||!(s.strength>=0&&s.strength<=10)||!Array.isArray(s.points)||s.points.length%2||!s.points.every(Number.isFinite))fail('Invalid stroke');
  if(s.mode==='flatten'&&!Number.isFinite(s.targetMm))fail('flatten needs targetMm');
  if((total+=s.points.length/2)>HEIGHTFIELD_LIMITS.maxStrokePoints)fail(`At most ${HEIGHTFIELD_LIMITS.maxStrokePoints} stroke points`);
  const blend=Math.min(1,s.strength);
  for(let n=0;n<s.points.length;n+=2){
   const ci=(s.points[n]+p.widthMm/2)/dx,cj=(p.depthMm/2-s.points[n+1])/dy,ri=s.radiusMm/dx,rj=s.radiusMm/dy;
   const i0=Math.max(0,Math.ceil(ci-ri)),i1=Math.min(c-1,Math.floor(ci+ri)),j0=Math.max(0,Math.ceil(cj-rj)),j1=Math.min(r-1,Math.floor(cj+rj));
   if(i0>i1||j0>j1)continue;
   let avg=0;if(s.mode==='smooth'){let sum=0,wsum=0;for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const w=weight(i,j);sum+=w*h[j*c+i];wsum+=w;}avg=wsum?sum/wsum:0;}
   function weight(i,j){const q=(((i-ci)*dx)**2+((j-cj)*dy)**2)/(s.radiusMm**2);return q>=1?0:(1-q)**2;}
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const w=weight(i,j);if(!w)continue;const k=j*c+i;let v=h[k];
    if(s.mode==='raise')v+=s.strength*w;else if(s.mode==='lower')v-=s.strength*w;else v+=((s.mode==='smooth'?avg:s.targetMm)-v)*blend*w;
    h[k]=Math.min(ceil,Math.max(floor,v));}
  }
 }
 return h;
}

import {sourceOperationContract as declaredSourceContract} from '../operation-contracts.js';
Object.defineProperty(heightfieldReliefOperation,'contract',{get(){const source=heightfieldReliefOperation;return declaredSourceContract('meshHeightfieldRelief',{description:source.description,refs:source.refs,notes:source.notes,paramsSchema:source.paramsSchema},{exampleParams:heightfieldReliefExample});}});
