import {decodeBinarySTL,exportBinarySTL} from './stl-source.js';
import {meshGeometryHash} from './relief-edit.js';
import {decodeMesh} from './mesh-codec.js';
import {meshError} from './mesh-contract.js';
import {binaryHash} from '../contracts/operation-schema.js';
import {indexedDisplayMesh} from './display-mesh.js';
import {createDisplayPatches} from './display-lod.js';
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{let v=0;const row=i%4,col=Math.floor(i/4);for(let j=0;j<4;j++)v+=a[j*4+row]*b[col*4+j];return v;});
export class MeshShape{
 constructor(mesh,{sourceBytes,sourceHash,units='mm',sourceFormat='mesh',matrix=identity(),report={}}={}){this.geometryType='mesh';this.mesh=mesh;this.sourceBytes=sourceBytes;this.sourceHash=sourceHash;this.units=units;this.sourceFormat=sourceFormat;this.matrix=matrix;this.report=report;}
 static fromAsset(item,bytes){
  if(!(bytes instanceof Uint8Array)||binaryHash(bytes).slice(7)!==item.assetHash)throw meshError('MESH_ASSET_CORRUPT','Original mesh source hash mismatch.');
  const mesh=item.format==='stl'?decodeBinarySTL(bytes,item.units):decodeMesh(bytes);
  return new MeshShape(mesh,{sourceBytes:bytes,sourceHash:item.assetHash,units:item.units,sourceFormat:item.format,report:mesh.report??{geometryType:'rawMesh',solidEligibility:'not-checked'}});
 }
 clone(){return new MeshShape(this.mesh,{sourceBytes:this.sourceBytes,sourceHash:this.sourceHash,units:this.units,sourceFormat:this.sourceFormat,matrix:[...this.matrix],report:this.report});}
 serialize(){throw meshError('MESH_BREP_UNAVAILABLE','Raw mesh is not an exact BRep; choose full STL or the typed mesh asset.');}
 get boundingBox(){const {min,max}=this.metrics().bounds;return {bounds:[min,max],delete(){}};}
 delete(){} // Immutable source is shared by retained feature/history references.
 translate(x,y,z){const v=Array.isArray(x)?x:[x,y,z];if(v.length!==3||v.some(n=>!Number.isFinite(n)))throw meshError('MESH_TRANSFORM_INVALID','Finite translation vector required.');const m=identity();m[12]=v[0];m[13]=v[1];m[14]=v[2];this.matrix=multiply(m,this.matrix);delete this.cachedMetrics;return this;}
 rotate(angle,origin=[0,0,0],direction=[0,0,1]){
  if(!Number.isFinite(angle)||origin.some(x=>!Number.isFinite(x))||direction.some(x=>!Number.isFinite(x)))throw meshError('MESH_TRANSFORM_INVALID','Finite rotation and axis required.');
  const norm=Math.hypot(...direction);if(norm<1e-12)throw meshError('MESH_TRANSFORM_INVALID','Rotation axis is zero.');
  const [x,y,z]=direction.map(v=>v/norm),c=Math.cos(angle*Math.PI/180),s=Math.sin(angle*Math.PI/180),t=1-c;
  const m=[t*x*x+c,t*x*y+s*z,t*x*z-s*y,0,t*x*y-s*z,t*y*y+c,t*y*z+s*x,0,t*x*z+s*y,t*y*z-s*x,t*z*z+c,0,0,0,0,1];
  this.translate(origin.map(x=>-x));this.matrix=multiply(m,this.matrix);this.translate(origin);return this;
 }
 transformed(){const p=this.mesh.positions,m=this.matrix,out=new Float64Array(p.length);for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=p[i+2];for(let j=0;j<3;j++)out[i+j]=m[j]*x+m[4+j]*y+m[8+j]*z+m[12+j];}return {positions:out,indices:this.mesh.indices};}
 metrics(){
  if(this.cachedMetrics)return this.cachedMetrics;const mesh=this.transformed(),p=mesh.positions,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i++){min[i%3]=Math.min(min[i%3],p[i]);max[i%3]=Math.max(max[i%3],p[i]);}
  let area=0;for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.indices[i]*3,b=mesh.indices[i+1]*3,c=mesh.indices[i+2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];area+=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2;}
  return this.cachedMetrics={source:'authoritative-mesh',bounds:{min,max},area,volume:null,solidCount:0,shellCount:0,faceCount:0,edgeCount:0,triangleCount:mesh.indices.length/3,vertexCount:p.length/3,geometryType:'rawMesh',meshReport:{...this.report,sourceHash:this.sourceHash,geometryHash:meshGeometryHash(mesh),topologyEpoch:0,matrix:[...this.matrix],formalPrecision:'Float64',displayPrecision:'Float32',solidEligibility:'not-checked',selfIntersection:'not-checked'}};
 }
 describe(feature){const formal=this.transformed(),mesh=indexedDisplayMesh(formal),metrics=this.metrics(),previewOrigin=metrics.bounds.min.map((v,i)=>(v+metrics.bounds.max[i])/2),positions=new Float32Array(mesh.positions.length);let maxPreviewErrorMm=0;
  for(let i=0;i<positions.length;i++){const local=mesh.positions[i]-previewOrigin[i%3];positions[i]=local;maxPreviewErrorMm=Math.max(maxPreviewErrorMm,Math.abs(local-positions[i]));}
  if(!Number.isFinite(maxPreviewErrorMm)||maxPreviewErrorMm>.005)throw meshError('MESH_DISPLAY_CAPACITY','Source range exceeds the tested Float32 preview precision; original document retained.');
  return {id:feature.id,name:feature.name||feature.id,...metrics,positions,previewOrigin,indices:mesh.indices,displayPatches:createDisplayPatches(positions,mesh.indices),faceGroups:[],edges:[],meshReport:{...metrics.meshReport,previewOrigin,maxPreviewErrorMm,displayLOD:'full; exact-coordinate index reuse; no face reduction',displayVertexCount:mesh.positions.length/3,formalTriangleCount:formal.indices.length/3}};
 }
 exportSTL(){const unchanged=this.matrix.every((x,i)=>x===identity()[i]);if(unchanged&&this.sourceFormat==='stl'&&this.units==='mm')return {data:this.sourceBytes,mime:'model/stl',extension:'stl',meshReport:{sourceBytesUnchanged:true,sourceHash:this.sourceHash}};const result=exportBinarySTL(this.transformed());return {data:result.bytes,mime:'model/stl',extension:'stl',meshReport:result.report};}
}
