import {MESH_LIMITS,checkedMesh,meshError} from './mesh-contract.js';
// Exactly 64 bytes; little-endian. No executable metadata or unbounded JSON.
const HEADER=64,MAGIC=[87,67,77,69,83,72,49,0];
export function encodeMesh(mesh){
 checkedMesh(mesh);const size=HEADER+mesh.positions.byteLength+mesh.indices.byteLength;
 if(size>MESH_LIMITS.maxAssetBytes)throw meshError('MESH_SIZE_LIMIT','Mesh asset byte budget exceeded.');
 const out=new Uint8Array(size),v=new DataView(out.buffer);out.set(MAGIC);v.setUint32(8,1,true);v.setUint32(12,HEADER,true);v.setUint32(16,mesh.positions.length/3,true);v.setUint32(20,mesh.indices.length/3,true);
 v.setUint32(24,8,true);v.setUint32(28,4,true);v.setUint32(32,1,true); // mm
 let at=HEADER;for(const p of mesh.positions){v.setFloat64(at,p,true);at+=8;}for(const i of mesh.indices){v.setUint32(at,i,true);at+=4;}return out;
}
export function decodeMesh(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<HEADER||bytes.length>MESH_LIMITS.maxAssetBytes)throw meshError('MESH_CODEC_INVALID','Invalid mesh asset length.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(MAGIC.some((p,i)=>p!==bytes[i])||v.getUint32(8,true)!==1||v.getUint32(12,true)!==HEADER||v.getUint32(24,true)!==8||v.getUint32(28,true)!==4||v.getUint32(32,true)!==1||bytes.subarray(36,HEADER).some(x=>x!==0))throw meshError('MESH_CODEC_INVALID','Unsupported mesh header, units or reserved bits.');
 const verts=v.getUint32(16,true),faces=v.getUint32(20,true);if(verts>MESH_LIMITS.maxVertices||faces>MESH_LIMITS.maxResultTriangles||HEADER+verts*24+faces*12!==bytes.length)throw meshError('MESH_CODEC_INVALID','Declared geometry exceeds its actual length/budget.');
 const positions=new Float64Array(verts*3),indices=new Uint32Array(faces*3);let at=HEADER;for(let i=0;i<positions.length;i++,at+=8)positions[i]=v.getFloat64(at,true);for(let i=0;i<indices.length;i++,at+=4)indices[i]=v.getUint32(at,true);
 return checkedMesh({positions,indices});
}
