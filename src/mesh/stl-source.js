import {checkedSourceBytes,MESH_LIMITS,meshError,meshScale,checkedMesh} from './mesh-contract.js';
// Raw bytes remain authoritative. No welding, deletion, orientation repair,
// normal rewriting or watertightness assumption takes place on import.
export function decodeBinarySTL(bytes,units){
 checkedSourceBytes(bytes);const scale=meshScale(units);
 if(bytes.length<84)throw meshError('MESH_SOURCE_INVALID','STL is shorter than its binary header.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=v.getUint32(80,true);
 if(!count||count>MESH_LIMITS.maxInputTriangles||84+count*50!==bytes.length)throw meshError('MESH_SOURCE_INVALID','Only complete bounded binary STL is supported; ASCII/trailing data is not guessed.');
 const positions=new Float64Array(count*9),indices=new Uint32Array(count*3);let degenerateTriangles=0;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let face=0;face<count;face++){
  for(let j=0;j<9;j++){const p=v.getFloat32(84+face*50+12+j*4,true)*scale;if(!Number.isFinite(p))throw meshError('MESH_NONFINITE','STL contains nonfinite coordinates.');positions[face*9+j]=p;min[j%3]=Math.min(min[j%3],p);max[j%3]=Math.max(max[j%3],p);}
  for(let j=0;j<3;j++)indices[face*3+j]=face*3+j;
  const at=face*9,a=positions.subarray(at,at+3),b=positions.subarray(at+3,at+6),c=positions.subarray(at+6,at+9),ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])===0)degenerateTriangles++;
 }
 return {positions,indices,bounds:{min,max},report:{geometryType:'rawMesh',sourceFormat:'binary-stl',unitsDeclared:units,scaleMm:scale,triangleCount:count,vertexCount:count*3,degenerateTriangles,rawBytesChanged:false,topology:'not-checked',selfIntersection:'not-checked',solidEligibility:'not-checked'}};
}
export function exportBinarySTL(mesh){
 checkedMesh(mesh);const count=mesh.indices.length/3,bytes=new Uint8Array(84+count*50),view=new DataView(bytes.buffer);view.setUint32(80,count,true);let maxQuantizationErrorMm=0;
 for(let f=0;f<count;f++){
  const points=[];for(let j=0;j<3;j++){const at=mesh.indices[f*3+j]*3,p=Array.from(mesh.positions.subarray(at,at+3));points.push(p);for(let k=0;k<3;k++){const value=Math.fround(p[k]);if(!Number.isFinite(value))throw meshError('MESH_EXPORT_PRECISION','Coordinates exceed STL float range.');maxQuantizationErrorMm=Math.max(maxQuantizationErrorMm,Math.abs(p[k]-value));view.setFloat32(84+f*50+12+(j*3+k)*4,value,true);}}
  const [a,b,c]=points,u=b.map((x,i)=>x-a[i]),w=c.map((x,i)=>x-a[i]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...n);for(let k=0;k<3;k++)view.setFloat32(84+f*50+k*4,length?n[k]/length:0,true);
 }
 if(maxQuantizationErrorMm>.005)throw meshError('MESH_EXPORT_PRECISION','STL quantization exceeds 0.005 mm; use the Float64 mesh asset.');
 return {bytes,report:{maxQuantizationErrorMm,triangleCount:count,source:'authoritative-mesh',units:'mm'}};
}
