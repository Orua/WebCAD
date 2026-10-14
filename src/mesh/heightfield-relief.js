// Heightfield relief: grayscale grid -> watertight mm mesh (solid for STL/3D print).
// Resolution is bounded by MESH_LIMITS (millions of samples), not by the 4–65
// B-spline control grid used by the exact-BRep relief.
import {meshError} from './mesh-contract.js';
import {MESH_LIMITS} from './mesh-contract.js';
const positive={type:'number',exclusiveMinimum:0};
export const HEIGHTFIELD_LIMITS=Object.freeze({minSide:2,maxSide:2049,maxSamples:1900000,maxSmoothing:8,maxHeightMm:100});
export const heightfieldReliefExample={version:1,widthMm:20,depthMm:20,baseMm:1,heightMm:1.5,columns:3,rows:3,heights:{encoding:'u8',data:'AAAAAP8AAAAA'},invert:false,gamma:1,smoothing:0,edgeFadeMm:0};
export const heightfieldReliefOperation={description:'高度图浮雕 / Heightfield relief',refs:0,paramsSchema:{type:'object',additionalProperties:false,required:['version','widthMm','depthMm','baseMm','heightMm','columns','rows','heights'],properties:{
 version:{type:'integer',const:1},widthMm:positive,depthMm:positive,baseMm:positive,heightMm:{type:'number',exclusiveMinimum:0,maximum:HEIGHTFIELD_LIMITS.maxHeightMm},
 columns:{type:'integer',minimum:HEIGHTFIELD_LIMITS.minSide,maximum:HEIGHTFIELD_LIMITS.maxSide},rows:{type:'integer',minimum:HEIGHTFIELD_LIMITS.minSide,maximum:HEIGHTFIELD_LIMITS.maxSide},
 heights:{type:'object',additionalProperties:false,required:['encoding','data'],properties:{encoding:{type:'string',enum:['u8','u16le']},data:{type:'string',maxLength:8*1024*1024}}},
 invert:{type:'boolean'},gamma:{type:'number',minimum:.2,maximum:5},smoothing:{type:'integer',minimum:0,maximum:HEIGHTFIELD_LIMITS.maxSmoothing},edgeFadeMm:{type:'number',minimum:0}}},
 notes:'Row-major grayscale samples, row 0 = image top (+Y). White is high unless invert. z: back 0, base top baseMm, peak baseMm+heightMm; centered XY. gamma shapes the height curve, smoothing = 3x3 blur passes, edgeFadeMm ramps heights to the base near the border. Output is a closed, outward-oriented triangle mesh (STL/3D print), not a BRep/STEP. Samples capped at 1.9 M (about 3.8 M triangles).'};
function decodeHeights({encoding,data},count){
 let bytes;try{bytes=typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(data,'base64')):Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{throw meshError('HEIGHTFIELD_INVALID','heights.data must be base64.');}
 const out=new Float32Array(count);
 if(encoding==='u8'){if(bytes.length!==count)throw meshError('HEIGHTFIELD_INVALID',`Expected ${count} u8 samples, got ${bytes.length}.`);for(let i=0;i<count;i++)out[i]=bytes[i]/255;}
 else{if(bytes.length!==count*2)throw meshError('HEIGHTFIELD_INVALID',`Expected ${count} u16le samples.`);for(let i=0;i<count;i++)out[i]=(bytes[2*i]|bytes[2*i+1]<<8)/65535;}
 return out;
}
function blur(h,c,r){const out=new Float32Array(h.length);
 for(let j=0;j<r;j++)for(let i=0;i<c;i++){let s=0,n=0;for(let dj=-1;dj<=1;dj++){const y=j+dj;if(y<0||y>=r)continue;for(let di=-1;di<=1;di++){const x=i+di;if(x<0||x>=c)continue;s+=h[y*c+x];n++;}}out[j*c+i]=s/n;}
 return out;}
export function heightfieldSamples(p){
 const fail=m=>{throw meshError('HEIGHTFIELD_INVALID',m);};
 if(p.version!==1)fail('version must be 1');
 for(const k of ['widthMm','depthMm','baseMm','heightMm'])if(!Number.isFinite(p[k])||p[k]<=0)fail(`${k} must be positive`);
 if(p.heightMm>HEIGHTFIELD_LIMITS.maxHeightMm)fail('heightMm too large');
 const {columns:c,rows:r}=p;if(![c,r].every(n=>Number.isInteger(n)&&n>=HEIGHTFIELD_LIMITS.minSide&&n<=HEIGHTFIELD_LIMITS.maxSide))fail('columns/rows must be integers 2–2049');
 if(c*r>HEIGHTFIELD_LIMITS.maxSamples)throw meshError('RELIEF_EDIT_CAPACITY',`Heightfield exceeds ${HEIGHTFIELD_LIMITS.maxSamples} samples.`);
 const gamma=p.gamma??1,smoothing=p.smoothing??0,fade=p.edgeFadeMm??0;
 if(!(gamma>=.2&&gamma<=5)||!Number.isInteger(smoothing)||smoothing<0||smoothing>HEIGHTFIELD_LIMITS.maxSmoothing||!(fade>=0))fail('gamma 0.2–5, smoothing 0–8, edgeFadeMm ≥ 0');
 let h=decodeHeights(p.heights||{},c*r);
 if(p.invert)for(let i=0;i<h.length;i++)h[i]=1-h[i];
 for(let s=0;s<smoothing;s++)h=blur(h,c,r);
 const dx=p.widthMm/(c-1),dy=p.depthMm/(r-1);
 for(let j=0;j<r;j++)for(let i=0;i<c;i++){const k=j*c+i;let v=gamma===1?h[k]:Math.pow(h[k],gamma);
  if(fade>0){const d=Math.min(i*dx,(c-1-i)*dx,j*dy,(r-1-j)*dy),t=Math.min(1,d/fade);v*=t*t*(3-2*t);}
  h[k]=v*p.heightMm;}
 return h;
}
export function makeHeightfieldRelief(p){
 const h=heightfieldSamples(p),{columns:c,rows:r}=p,top=c*r;
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
