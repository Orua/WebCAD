import {binaryHash} from '../contracts/operation-schema.js';
import {MESH_LIMITS,meshError,meshScale} from './mesh-contract.js';
export function cloneAssetDocument(value){
 if(!value?.binaryAssets)return structuredClone(value);
 const {binaryAssets,compiledArtifacts,...rest}=value;return {...structuredClone(rest),binaryAssets:{...binaryAssets},...(compiledArtifacts?{compiledArtifacts:{...compiledArtifacts}}:{})};
}
export function meshAssetFormats(document){
 const formats=new Map();for(const item of Object.values(document.imports||{}))if(['stl','mesh'].includes(item.format)){
  if(!/^[a-f0-9]{64}$/.test(item.assetHash||''))throw meshError('MESH_ASSET_CORRUPT','Missing content identity.');
  if(formats.has(item.assetHash)&&formats.get(item.assetHash)!==item.format)throw meshError('MESH_ASSET_CORRUPT','Conflicting asset format.');formats.set(item.assetHash,item.format);if(item.format==='stl')meshScale(item.units);
 }
 // Retained timeline imports are held in imports until history no longer uses
 // them; same content bytes are never embedded in feature/timeline patches.
 return formats;
}
export function validateBinaryAssets(document,{verifyHashes=false}={}){
 const formats=meshAssetFormats(document),assets=document.binaryAssets||{};
 for(const [hash,format] of formats){const bytes=assets[hash],limit=format==='stl'?MESH_LIMITS.maxSourceBytes:MESH_LIMITS.maxAssetBytes;
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>limit||verifyHashes&&binaryHash(bytes).slice(7)!==hash)throw meshError('MESH_ASSET_CORRUPT','Missing, oversized or corrupted full source bytes.');
 }
 for(const [hash,bytes] of Object.entries(assets))if(!formats.has(hash)||!(bytes instanceof Uint8Array))throw meshError('MESH_ASSET_CORRUPT','Unreferenced or untyped source asset.');
 return formats;
}
