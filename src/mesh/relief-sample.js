import {LIMITS} from '../limits.js';
import {meshError,checkedMesh} from './mesh-contract.js';
import {meshGeometryHash} from './relief-edit.js';
const point=n=>({type:'array',minItems:n,maxItems:n,items:{type:'number'}});
export const meshReliefSampleSchema={type:'object',additionalProperties:false,required:['bodyId','inputGeometryHash','support','pointsMm'],properties:{bodyId:{type:'string',minLength:1},inputGeometryHash:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'},support:{type:'object',additionalProperties:false,required:['originMm','xAxis','normal'],properties:{originMm:point(3),xAxis:point(3),normal:point(3)}},pointsMm:{type:'array',minItems:1,maxItems:256,items:point(2)}}};
export function sampleMeshRelief(mesh,p){
 checkedMesh(mesh);const hash=meshGeometryHash(mesh);if(hash!==p.inputGeometryHash)throw meshError('STALE_REFERENCE','Read the current geometry hash.');
 const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),{originMm:o,xAxis:x,normal:n}=p.support||{};
 if(![o,x,n].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||Math.abs(dot(x,x)-1)>1e-10||Math.abs(dot(n,n)-1)>1e-10||Math.abs(dot(x,n))>1e-10)throw meshError('RELIEF_SUPPORT_INVALID','Explicit orthonormal support required.');
 if(!Array.isArray(p.pointsMm)||!p.pointsMm.length||p.pointsMm.length>256||p.pointsMm.some(q=>!Array.isArray(q)||q.length!==2||!q.every(Number.isFinite)))throw meshError('PARAM_SCHEMA_INVALID','Supply 1..256 support UV coordinates in mm.');
 if(p.pointsMm.length*mesh.indices.length/3>LIMITS.meshReliefEdit.maxRayTests)throw meshError('RELIEF_EDIT_CAPACITY','Point count times triangle count exceeds 12000000; split the read-only query.');
 const y=[n[1]*x[2]-n[2]*x[1],n[2]*x[0]-n[0]*x[2],n[0]*x[1]-n[1]*x[0]],vertices=[];
 for(let i=0;i<mesh.positions.length;i+=3){const d=[mesh.positions[i]-o[0],mesh.positions[i+1]-o[1],mesh.positions[i+2]-o[2]];vertices.push([dot(d,x),dot(d,y),dot(d,n)]);}
 const samples=p.pointsMm.map(q=>({uvMm:[...q],heightsMm:[]}));
 for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=Array.from(mesh.indices.subarray(i,i+3),j=>vertices[j]),det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<1e-12)continue;
  for(const row of samples){const [u,v]=row.uvMm,w1=((b[1]-c[1])*(u-c[0])+(c[0]-b[0])*(v-c[1]))/det,w2=((c[1]-a[1])*(u-c[0])+(a[0]-c[0])*(v-c[1]))/det,w3=1-w1-w2;if(Math.min(w1,w2,w3)>=-1e-10)row.heightsMm.push(w1*a[2]+w2*b[2]+w3*c[2]);}
 }
 for(const row of samples){row.heightsMm.sort((a,b)=>a-b);row.heightsMm=row.heightsMm.filter((z,i,a)=>!i||Math.abs(z-a[i-1])>1e-8);row.hit=row.heightsMm.length>0;}
 return {source:'authoritative-mesh-f64',geometryHash:hash,units:'mm',support:p.support,samples,limitations:'Mesh facet intersections, not analytic surface measurements. Distinct coincident heights deduplicated at 1e-8 mm; vertical facets do not yield isolated height hits. Multiple sheets are returned, never silently selected. Empty array means no hit.'};
}
