export const MESH_CODEC='webcad-mesh-f64-u32-v1';
export const MESH_LIMITS=Object.freeze({maxSourceBytes:128*1024*1024,maxAssetBytes:384*1024*1024,maxProjectBytes:512*1024*1024,maxInputTriangles:2000000,maxResultTriangles:4000000,maxVertices:12000000});
export const MESH_TYPES=Object.freeze(['rawMesh','solidMesh','displayMesh']);
export const MESH_UNITS=Object.freeze({mm:1,cm:10,m:1000,in:25.4});
export function meshError(code,message){return Object.assign(new Error(message),{code});}
export function meshScale(units){if(!Object.hasOwn(MESH_UNITS,units))throw meshError('MESH_UNITS_REQUIRED','STL has no units: explicitly select mm/cm/m/in.');return MESH_UNITS[units];}
export function checkedSourceBytes(bytes){if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MESH_LIMITS.maxSourceBytes)throw meshError('MESH_SIZE_LIMIT','Source must be nonempty and within 128 MiB.');return bytes;}
export function checkedMesh(mesh){
 const {positions,indices}=mesh;
 if(!(positions instanceof Float64Array)||positions.length%3||positions.length/3>MESH_LIMITS.maxVertices||!(indices instanceof Uint32Array)||indices.length%3||!indices.length||indices.length/3>MESH_LIMITS.maxResultTriangles)throw meshError('MESH_CODEC_INVALID','Bounded Float64 positions and Uint32 triangle indices required.');
 for(const p of positions)if(!Number.isFinite(p))throw meshError('MESH_NONFINITE','Nonfinite mesh coordinates.');
 for(const i of indices)if(i>=positions.length/3)throw meshError('MESH_INDEX_INVALID','Triangle index outside position buffer.');
 return mesh;
}
