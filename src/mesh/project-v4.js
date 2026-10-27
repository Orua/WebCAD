import {zipSync} from 'three/examples/jsm/libs/fflate.module.js';
import {binaryHash} from '../contracts/operation-schema.js';
import {validateBinaryAssets} from './mesh-assets.js';
import {MESH_LIMITS,meshError} from './mesh-contract.js';
const encoder=new TextEncoder();
export const PROJECT_V4_LIMITS=Object.freeze({maxBytes:MESH_LIMITS.maxProjectBytes,maxEntries:256,maxJsonBytes:20*1024*1024,maxArtifactBytes:20*1024*1024});
export function preflightProjectV4(document,{includeTimeline=true,reserveBytes=0}={}){
 if(document.version!==4)throw meshError('DOCUMENT_VERSION_UNSUPPORTED','Typed source assets require project version 4.');
 const formats=validateBinaryAssets(document),data={...document,...(!includeTimeline?{timeline:undefined}:{}),compiledArtifacts:undefined,binaryAssets:undefined};
 const jsonBytes=encoder.encode(JSON.stringify(data));if(jsonBytes.length>PROJECT_V4_LIMITS.maxJsonBytes)throw meshError('SIZE_LIMIT','Project JSON metadata exceeds its separate 20 MiB budget.');
 let size=jsonBytes.length+65536;const entries=2+formats.size+Object.keys(document.compiledArtifacts||{}).length;
 for(const bytes of Object.values(document.binaryAssets||{}))size+=bytes.length;
 for(const bytes of Object.values(document.compiledArtifacts||{})){if(!(bytes instanceof Uint8Array))throw meshError('ARTIFACT_CORRUPT','Typed BRep artifact bytes required.');if(bytes.length>PROJECT_V4_LIMITS.maxArtifactBytes)throw meshError('SIZE_LIMIT','Services BRep checkpoints retain their separate 20 MiB client capacity gate.');size+=bytes.length;}
 if(entries>PROJECT_V4_LIMITS.maxEntries||size>PROJECT_V4_LIMITS.maxBytes-reserveBytes)throw meshError('SIZE_LIMIT','Self-contained project exceeds the 1024 MiB unpacked budget; current document is retained.');
 return {bytes:size,entries,formats,jsonBytes};
}
export function encodeProjectV4(document,options={}){
 const {formats,jsonBytes}=preflightProjectV4(document,options);validateBinaryAssets(document,{verifyHashes:true});
 const files={'document.json':jsonBytes},artifacts=[],binaryAssets=[];
 for(const [hash,bytes] of Object.entries(document.compiledArtifacts||{})){
  if(!/^[a-f0-9]{64}$/.test(hash)||binaryHash(bytes).slice(7)!==hash)throw meshError('ARTIFACT_CORRUPT','Invalid BRep checkpoint identity.');
  files[`artifacts/${hash}.brep`]=[bytes,{level:0}];artifacts.push({sha256:hash,bytes:bytes.length,format:'occt-text-brep-v1',brepVersion:3});
 }
 for(const [hash,format] of formats){const bytes=document.binaryAssets[hash];files[`assets/${hash}.${format}`]=[bytes,{level:0}];binaryAssets.push({sha256:hash,bytes:bytes.length,format});}
 // Large sources use stored ZIP entries. Full byte arrays are packaged in the
 // computation Worker; no giant base64/JSON payload is returned to an Agent.
 files['manifest.json']=encoder.encode(JSON.stringify({type:'webcad-project',version:4,documentSha256:binaryHash(jsonBytes).slice(7),artifacts,binaryAssets}));
 const bytes=zipSync(files,{level:0});if(bytes.length>PROJECT_V4_LIMITS.maxBytes)throw meshError('SIZE_LIMIT','Project ZIP exceeds its declared budget.');return bytes;
}
