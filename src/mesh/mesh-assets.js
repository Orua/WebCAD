import {binaryHash} from '../contracts/operation-schema.js';
import {MESH_LIMITS,meshError,meshScale} from './mesh-contract.js';
export const BINARY_SOURCE_FORMATS=Object.freeze(['stl','mesh','step','brep']);
export const exactSourceFormat=format=>format==='step'||format==='brep';
export const binaryAssetByteLimit=format=>format==='mesh'?MESH_LIMITS.maxAssetBytes:MESH_LIMITS.maxSourceBytes;
const assetError=(format,message)=>meshError(exactSourceFormat(format)?'ARTIFACT_CORRUPT':'MESH_ASSET_CORRUPT',message);
export function cloneAssetDocument(value){
 if(!value?.binaryAssets)return structuredClone(value);
 const {binaryAssets,compiledArtifacts,...rest}=value;return {...structuredClone(rest),binaryAssets:{...binaryAssets},...(compiledArtifacts?{compiledArtifacts:{...compiledArtifacts}}:{})};
}
export function meshAssetFormats(document){
 const formats=new Map();for(const item of Object.values(document.imports||{}))if(BINARY_SOURCE_FORMATS.includes(item.format)){
  // Old STEP/BREP imports remain readable. New sources carry only a hash in
  // metadata and one complete byte array in the v4 asset table.
  if(exactSourceFormat(item.format)&&!item.assetHash&&typeof item.data==='string')continue;
  if(!/^[a-f0-9]{64}$/.test(item.assetHash||''))throw assetError(item.format,'Missing content identity.');
  if(exactSourceFormat(item.format)&&item.data!==undefined)throw assetError(item.format,'Exact source bytes must not be duplicated in project metadata.');
  if(formats.has(item.assetHash)&&formats.get(item.assetHash)!==item.format)throw assetError(item.format,'Conflicting asset format.');formats.set(item.assetHash,item.format);if(item.format==='stl')meshScale(item.units);
 }
 // Retained timeline imports are held in imports until history no longer uses
 // them; same content bytes are never embedded in feature/timeline patches.
 return formats;
}
export function validateBinaryAssets(document,{verifyHashes=false}={}){
 const formats=meshAssetFormats(document),assets=document.binaryAssets||{};
 for(const [hash,format] of formats){const bytes=assets[hash],limit=binaryAssetByteLimit(format);
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>limit||verifyHashes&&binaryHash(bytes).slice(7)!==hash)throw assetError(format,'Missing, oversized or corrupted full source bytes.');
 }
 for(const [hash,bytes] of Object.entries(assets))if(!formats.has(hash)||!(bytes instanceof Uint8Array))throw meshError('MESH_ASSET_CORRUPT','Unreferenced or untyped source asset.');
 return formats;
}
