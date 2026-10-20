import {rasterDimensions} from './relief-image.js';
// Persistent metadata only. Original bytes live once in the v4 binary asset table.
export const RELIEF_REFERENCE_LIMIT=20*1024*1024;
export const RELIEF_REFERENCE_MIMES=Object.freeze(['image/png','image/jpeg','image/webp']);
const fail=message=>{throw Object.assign(new Error(message),{code:'RELIEF_REFERENCE_INVALID'});};
export function validateReliefReference(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['importKey','assetHash','name','mime','sizeBytes','width','height'].includes(k)))fail('Invalid reference metadata fields');
 if(typeof value.importKey!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.importKey)||['__proto__','prototype','constructor'].includes(value.importKey)||typeof value.assetHash!=='string'||!/^[a-f0-9]{64}$/.test(value.assetHash))fail('Reference needs a durable import key and SHA256 identity');
 if(typeof value.name!=='string'||!value.name||value.name.length>255||/[\\/\x00-\x1f]/.test(value.name)||!RELIEF_REFERENCE_MIMES.includes(value.mime))fail('Reference needs a PNG/JPEG/WebP file name and MIME');
 if(!Number.isSafeInteger(value.sizeBytes)||value.sizeBytes<1||value.sizeBytes>RELIEF_REFERENCE_LIMIT)fail('Reference exceeds the 20 MiB source budget');
 if(![value.width,value.height].every(v=>Number.isSafeInteger(v)&&v>0)||value.width*value.height>16777216||value.width/value.height<1/64||value.width/value.height>64)fail('Reference exceeds the existing 16M pixel / 64:1 image budget');
 return {...value};
}
export function validateReliefReferenceBindings(snapshot,imports=snapshot.imports||{}){
 for(const entry of snapshot.reliefDesigns||[]){const ref=entry.draft?.reference;if(!ref)continue;validateReliefReference(ref);const item=imports[ref.importKey];
  if(!Object.hasOwn(imports,ref.importKey)||!item||item.format!=='reference-image'||item.assetHash!==ref.assetHash||item.mime!==ref.mime||item.sizeBytes!==ref.sizeBytes||item.width!==ref.width||item.height!==ref.height)fail('Reference metadata does not match its original project import');
 }
}

const imageFail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function referenceImageHeader(bytes,mime){
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>RELIEF_REFERENCE_LIMIT)imageFail('SIZE_LIMIT','Reference must contain 1 byte–20 MiB');
 let format;
 if(bytes[0]===137&&bytes[1]===80)format='png';else if(bytes[0]===255&&bytes[1]===216)format='jpg';else if(String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')format='webp';else imageFail('RELIEF_REFERENCE_INVALID','Reference bytes are not PNG/JPEG/WebP');
 const actualMime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[format];
 if(mime&&mime!=='application/octet-stream'&&mime!==actualMime)imageFail('RELIEF_REFERENCE_INVALID','Reference MIME does not match the actual image signature');
 if(format!=='webp')return {mime:actualMime,...rasterDimensions(bytes,format)};
 const type=String.fromCharCode(...bytes.subarray(12,16));let width,height;
 if(type==='VP8X'&&bytes.length>=30){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
 else if(type==='VP8L'&&bytes.length>=25&&bytes[20]===47){width=1+bytes[21]+((bytes[22]&63)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10);}
 else if(type==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=(bytes[26]|bytes[27]<<8)&16383;height=(bytes[28]|bytes[29]<<8)&16383;}
 else imageFail('RELIEF_REFERENCE_INVALID','Unsupported or invalid WebP header');
 if(!width||!height||width*height>16777216||width/height<1/64||width/height>64)imageFail('RELIEF_LIMIT','Reference exceeds existing image pixel/aspect limits');
 return {mime:actualMime,width,height};
}
