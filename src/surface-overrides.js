// Per-body display appearance. Texture bytes live once in v4 binaryAssets, outside history patches.
export const SURFACE_FIELDS=Object.freeze(['roughness','opacity','transmission','ior','thicknessMm','texture']);
export const MAX_TEXTURE_DATA_CHARS=6*1024*1024;
export const TEXTURE_SCHEMA={type:['object','null'],additionalProperties:false,properties:{dataUrl:{type:'string',maxLength:MAX_TEXTURE_DATA_CHARS,pattern:'^data:image/(png|jpeg|webp);base64,'},assetHash:{type:'string',pattern:'^[a-f0-9]{64}$'},mime:{enum:['image/png','image/jpeg','image/webp']},mapping:{enum:['box','xy','xz','yz']},sizeMm:{type:'array',minItems:2,maxItems:2,items:{type:'number',exclusiveMinimum:0,maximum:1000000}},offsetMm:{type:'array',minItems:2,maxItems:2,items:{type:'number'}},rotationDeg:{type:'number',minimum:-36000,maximum:36000}}};
const fail=message=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID'});};
export function normalizeSurfaceTexture(value){
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(TEXTURE_SCHEMA.properties,k)))fail('贴图字段无效。');
 const embedded=typeof value.dataUrl==='string',hashed=typeof value.assetHash==='string';
 if(embedded===hashed)fail('贴图需要图片 dataUrl 或当前工程中的 assetHash，二选一。');
 if(embedded&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)||value.dataUrl.length>MAX_TEXTURE_DATA_CHARS))fail('贴图须为不超过约 4.5 MiB 的 PNG/JPEG/WebP 内嵌图片。');
 if(hashed&&(!/^[a-f0-9]{64}$/.test(value.assetHash)||!['image/png','image/jpeg','image/webp'].includes(value.mime)))fail('贴图资产身份或 MIME 无效。');
 const mapping=value.mapping??'box',sizeMm=value.sizeMm??[20,20],offsetMm=value.offsetMm??[0,0],rotationDeg=value.rotationDeg??0;
 if(!['box','xy','xz','yz'].includes(mapping)||!Array.isArray(sizeMm)||sizeMm.length!==2||!sizeMm.every(v=>Number.isFinite(v)&&v>0&&v<=1000000)||!Array.isArray(offsetMm)||offsetMm.length!==2||!offsetMm.every(Number.isFinite)||!Number.isFinite(rotationDeg)||Math.abs(rotationDeg)>36000)fail('贴图投射参数需要有效毫米尺寸、偏移与角度。');
 return {...(embedded?{dataUrl:value.dataUrl}:{assetHash:value.assetHash,mime:value.mime}),mapping,sizeMm:[...sizeMm],offsetMm:[...offsetMm],rotationDeg};
}
export function validateSurfacePatch(patch){
 for(const [key,min,max]of [['roughness',0,1],['opacity',0,1],['transmission',0,1],['ior',1,2.5],['thicknessMm',0,10000]])if(patch[key]!==undefined&&patch[key]!==null&&!(typeof patch[key]==='number'&&Number.isFinite(patch[key])&&patch[key]>=min&&patch[key]<=max))fail(`${key} 需要 ${min}–${max} 或 null。`);
 if(patch.texture!==undefined)normalizeSurfaceTexture(patch.texture);
 return patch;
}
export function mergeSurfaceOverride(previous,patch){
 validateSurfacePatch(patch);const result={...previous};
 for(const key of SURFACE_FIELDS)if(patch[key]!==undefined){if(patch[key]===null)delete result[key];else result[key]=key==='texture'?normalizeSurfaceTexture(patch[key]):patch[key];}
 return result;
}
export function sanitizeSurface(surface){
 if(!surface||typeof surface!=='object'||Array.isArray(surface))return {};
 return Object.fromEntries(Object.entries(surface).flatMap(([id,value])=>{try{if(!value||typeof value!=='object'||Array.isArray(value))return [];const clean=mergeSurfaceOverride({},value);return Object.keys(clean).length?[[id,clean]]:[];}catch{return [];}}));
}
export function applyDesignSurface(material,finishKey,override){
 if(!material)return false;let changed=false;
 if(finishKey==='design'&&Number.isFinite(override?.roughness)){material.roughness=override.roughness;changed=true;}
 if('opacity' in material||['opacity','transmission','ior','thicknessMm'].some(k=>override?.[k]!==undefined)){
  material.userData??={};material.userData.surfaceOpacity=override?.opacity??1;
  const transmission=override?.transmission??0;if((material.transmission>0)!==(transmission>0))material.needsUpdate=true;
  material.opacity=material.userData.surfaceOpacity;material.transmission=transmission;material.ior=override?.ior??1.5;material.thickness=override?.thicknessMm??1;
  if(transmission>0)material.metalness=0;changed=true;
 }
 return changed;
}

// R7-010: one visible non-design finish switches the whole scene to metal
// lighting (ACES + metal light levels). Report it instead of hiding it.
export function sceneLightingState(globalKey, partFinishes = {}, ids = []) {
  const finishes = ids.map(id => partFinishes[id] || globalKey);
  const metal = globalKey !== 'design' || finishes.some(finish => finish !== 'design');
  const designBodies = finishes.filter(finish => finish === 'design').length;
  return { mode: metal ? 'metal-global' : 'design', designBodiesUnderMetalLighting: metal ? designBodies : 0 };
}
