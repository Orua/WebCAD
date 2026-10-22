// Reference bulk densities; use the actual alloy/supplier value when known.
export const METAL_DENSITIES=Object.freeze({zincAlloy:{name:'锌合金（Zamak3参考）',density:6.6},copper:{name:'铜',density:8.94},iron:{name:'铁',density:7.87},steel:{name:'碳钢',density:7.85},brass:{name:'黄铜',density:8.5},stainless:{name:'不锈钢',density:7.9},aluminum:{name:'铝合金',density:2.7}});
export const defaultMaterialSettings=()=>({version:1,defaultMaterial:'zincAlloy',densities:Object.fromEntries(Object.entries(METAL_DENSITIES).map(([id,m])=>[id,m.density])),bodyMaterials:{}});
export function validateMaterialSettings(value){
 const fail=message=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID'});};
 const s=value??defaultMaterialSettings();
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['version','defaultMaterial','densities','bodyMaterials'].includes(k))||s.version!==1||!Object.hasOwn(METAL_DENSITIES,s.defaultMaterial))fail('材料配置版本或默认材料无效。');
 if(!s.densities||typeof s.densities!=='object'||Array.isArray(s.densities)||Object.keys(s.densities).some(k=>!Object.hasOwn(METAL_DENSITIES,k)))fail('密度材料编号无效。');
 for(const key of Object.keys(METAL_DENSITIES))if(typeof s.densities[key]!=='number'||!Number.isFinite(s.densities[key])||s.densities[key]<=0||s.densities[key]>30)fail('材料密度须为大于0且不超过30 g/cm³的有限数值。');
 if(!s.bodyMaterials||typeof s.bodyMaterials!=='object'||Array.isArray(s.bodyMaterials)||Object.keys(s.bodyMaterials).length>2000||Object.entries(s.bodyMaterials).some(([id,key])=>!id||id.length>150||['__proto__','constructor','prototype'].includes(id)||!Object.hasOwn(METAL_DENSITIES,key)))fail('对象材料配置无效。');
 return structuredClone(s);
}
export function loadMaterialSettings(){try{const value=JSON.parse(decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith('webcad.materials.v1='))?.split('=').slice(1).join('=')||'null'));return validateMaterialSettings(value);}catch{return defaultMaterialSettings();}}
export function rememberMaterialSettings(settings){const s=validateMaterialSettings(settings);s.bodyMaterials={};try{document.cookie='webcad.materials.v1='+encodeURIComponent(JSON.stringify(s))+'; Max-Age=31536000; Path=/; SameSite=Lax';}catch{}}
export function materialWeight(volumeMm3,settings,bodyId,materialId){
 const s=validateMaterialSettings(settings),id=materialId??s.bodyMaterials[bodyId]??s.defaultMaterial;
 if(!Object.hasOwn(METAL_DENSITIES,id))throw Object.assign(new Error('未知材料编号。'),{code:'PARAM_SCHEMA_INVALID'});
 const valid=typeof volumeMm3==='number'&&Number.isFinite(volumeMm3)&&volumeMm3>0;
 return {materialId:id,materialName:METAL_DENSITIES[id].name,densityGcm3:s.densities[id],volumeMm3:valid?volumeMm3:null,massGrams:valid?volumeMm3*s.densities[id]/1000:null,estimated:true,reason:valid?null:'VOLUME_UNAVAILABLE'};
}
export function inheritBodyMaterials(settings,features,bodyIds){
 const s=validateMaterialSettings(settings),graph=new Map(features.map(f=>[f.id,f]));
 const find=(id,seen=new Set())=>{if(seen.has(id))return;seen.add(id);return s.bodyMaterials[id]||(graph.get(id)?.refs||[]).map(ref=>find(ref,seen)).find(Boolean);};
 for(const id of bodyIds)if(!s.bodyMaterials[id]){const material=find(id);if(material)s.bodyMaterials[id]=material;}return s;
}
