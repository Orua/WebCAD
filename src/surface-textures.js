import {binaryHash} from './contracts/operation-schema.js';
import {referenceImageHeader} from './relief-design-reference-contract.js';
import {normalizeSurfaceTexture} from './surface-overrides.js';
const decodedImages=new Map();
export function prepareSurfaceTexture(document,input){
 const texture=normalizeSurfaceTexture(input);let bytes,mime;
 if(texture.dataUrl){const match=/^data:([^;]+);base64,(.*)$/.exec(texture.dataUrl);mime=match[1];try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));}catch{throw Object.assign(new Error('贴图图片编码无效。'),{code:'TEXTURE_INVALID'});}}
 else {bytes=document.binaryAssets?.[texture.assetHash];mime=texture.mime;}
 const header=referenceImageHeader(bytes,mime);
 if(header.width>4096||header.height>4096||bytes.length>4.5*1024*1024)throw Object.assign(new Error('贴图最大 4096×4096，文件不超过 4.5 MiB。'),{code:'SIZE_LIMIT'});
 const assetHash=binaryHash(bytes).slice(7),{dataUrl,...mapping}=texture;
 if(texture.assetHash&&texture.assetHash!==assetHash)throw Object.assign(new Error('贴图图片哈希不匹配。'),{code:'ARTIFACT_CORRUPT'});
 return {texture:{...mapping,assetHash,mime:header.mime},bytes,importKey:'texture-'+assetHash,importEntry:{format:'reference-image',assetHash,name:'surface-texture.'+header.mime.split('/')[1],mime:header.mime,sizeBytes:bytes.length,width:header.width,height:header.height}};
}
export function loadSurfaceImage(texture,bytes){
 if(decodedImages.has(texture.assetHash))return decodedImages.get(texture.assetHash);
 const pending=new Promise((resolve,reject)=>{
  const image=new Image(),url=URL.createObjectURL(new Blob([bytes],{type:texture.mime}));
  const timer=setTimeout(()=>done(new Error('贴图图片解码超时。')),10000);
  function done(error){clearTimeout(timer);image.onload=image.onerror=null;URL.revokeObjectURL(url);if(error)reject(Object.assign(error,{code:'TEXTURE_INVALID'}));else resolve(image);}
  image.onload=()=>done();image.onerror=()=>done(new Error('浏览器无法解码贴图图片。'));image.src=url;
 });
 decodedImages.set(texture.assetHash,pending);pending.catch(()=>decodedImages.delete(texture.assetHash));
 while(decodedImages.size>2)decodedImages.delete(decodedImages.keys().next().value);
 return pending;
}
export function validateSurfaceAssets(document){
 for(const value of Object.values(document.surface||{})){const texture=value?.texture;if(!texture)continue;
  if(texture.dataUrl)throw Object.assign(new Error('工程贴图必须使用持久化图片资产。'),{code:'ARTIFACT_CORRUPT'});
  const item=document.imports?.['texture-'+texture.assetHash];
  if(item?.format!=='reference-image'||item.assetHash!==texture.assetHash||item.mime!==texture.mime||!(document.binaryAssets?.[texture.assetHash] instanceof Uint8Array))throw Object.assign(new Error('工程缺少贴图原始图片。'),{code:'ARTIFACT_CORRUPT'});
 }
}
