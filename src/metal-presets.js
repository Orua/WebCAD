// The single editable material list. RGB values are LINEAR reflectance, not sRGB.
// A style is a safe parameter bundle, never executable shader code.
export const DEFAULT_METAL_CONFIG={version:1,styles:{
  mirror:{environmentMode:'studio',roughness:0.055,reflectionStrength:1.08,metalBodyTint:0.015,studioReflection:'polished',coat:0,hueKeep:0,depth:0},
  satin:{environmentMode:'studio',roughness:0.58,reflectionStrength:0.65,anisotropy:0.35,coat:0},
  antique:{environmentMode:'studio',roughness:0.5,reflectionStrength:0.6},
  hdr:{environmentMode:'hdr',roughness:0.12,reflectionStrength:1.08,coat:0},
},materials:[
  {id:'design',label:'设计原色',style:'hdr',metalness:0.15,roughness:0.42,reflectionStrength:0},
  {id:'light-gold',label:'浅金',style:'mirror',color:[1,0.66,0.23]},
  {id:'nickel',label:'亮镍',style:'mirror',color:[0.76,0.76,0.76]},
  {id:'24k-gold',label:'24K 金',style:'mirror',color:[0.90,0.42,0.025]},
  {id:'gunmetal',label:'枪色',style:'mirror',color:[0.18,0.21,0.24]},
  {id:'matt-nickel',label:'哑镍',style:'satin',color:[0.70,0.72,0.74],roughness:0.54,reflectionStrength:0.74},
  {id:'rose-gold',label:'玫瑰金',style:'mirror',color:[0.474,0.156,0.191],roughness:0.2,reflectionStrength:0.98,metalBodyTint:0.1,coat:0.28},
  {id:'silver-925',label:'925 银',style:'mirror',color:[0.82,0.83,0.84],roughness:0.2,coat:0.12},
  {id:'white-gold-18k',label:'18K 白金',style:'mirror',color:[0.88,0.86,0.79],roughness:0.19,reflectionStrength:1.04,coat:0.2},
  {id:'matt-light-gold',label:'哑浅金',style:'satin',color:[0.70,0.48,0.21],roughness:0.59,reflectionStrength:0.50},
  {id:'matt-24k-gold',label:'哑 24K 金',style:'satin',color:[1,0.72,0.27],reflectionStrength:0.78,hueKeep:0.6,depth:0.5},
  {id:'matt-gunmetal',label:'哑枪色',style:'satin',color:[0.15,0.17,0.19],roughness:0.62,reflectionStrength:0.46},
  {id:'antique-brass',label:'仿古黄铜',style:'antique',color:[0.50,0.32,0.09],roughness:0.60,reflectionStrength:0.36,antiqueStrength:0.97,patinaColor:[0.055,0.035,0.015],antiqueAtlasOffset:0,antiqueTextureScale:1.35,antiquePitStrength:0.82},
  {id:'antique-silver',label:'仿古银',style:'antique',color:[0.88,0.86,0.83],roughness:0.46,reflectionStrength:0.72,antiqueStrength:0.55,patinaColor:[0.014,0.012,0.011],antiqueAtlasOffset:0.5,antiqueTextureScale:2.1,antiquePitStrength:0.72},
]};
const keyPattern=/^[a-z0-9][a-z0-9-]{0,47}$/;
const ranges={metalness:[0,1],roughness:[0,1],reflectionStrength:[0,3],metalBodyTint:[0,0.5],coat:[0,1],hueKeep:[0,1],depth:[0,3],anisotropy:[0,1],antiqueStrength:[0,1],antiqueAtlasOffset:[0,0.5],antiqueTextureScale:[0.1,10],antiquePitStrength:[0,1]};
const fail=message=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID'});};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function validateMetalMaterials(value){
  if(!plain(value)||value.version!==1||Object.keys(value).some(k=>!['version','styles','materials'].includes(k))||!plain(value.styles)||!Array.isArray(value.materials)||value.materials.length>64)fail('材质配置需要 version:1、styles 对象及最多64项 materials 列表');
  const styles=Object.entries(value.styles);if(!styles.length||styles.length>16)fail('渲染方式须有1–16项');
  function parameters(p,material=false){
    if(!plain(p))fail('材质参数必须是对象');
    for(const [key,v]of Object.entries(p)){
      if(material&&['id','label','style'].includes(key))continue;
      if(key==='color'||key==='patinaColor'){if(!Array.isArray(v)||v.length!==3||v.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))fail('底色须为三个0–1的线性RGB数值');}
      else if(key==='environmentMode'){if(!['studio','hdr','inherit'].includes(v))fail('反射环境无效');}
      else if(key==='studioReflection'){if(!['polished','environment'].includes(v))fail('摄影棚反射方式无效');}
      else {const range=ranges[key];if(!range||typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1])fail('无效的材质参数：'+key);}
    }
  }
  for(const [id,style]of styles){if(!keyPattern.test(id))fail('渲染方式ID无效');parameters(style);}
  const ids=new Set();
  for(const m of value.materials){
    if(!plain(m)||!keyPattern.test(m.id)||ids.has(m.id)||typeof m.label!=='string'||!m.label.trim()||m.label.length>40||!Object.hasOwn(value.styles,m.style))fail('材质ID、名称或渲染方式无效/重复');
    if(m.id!=='design'&&!m.color)fail('金属材质必须提供底色');
    const resolved={...value.styles[m.style],...m};
    for(const key of ['roughness','reflectionStrength'])if(typeof resolved[key]!=='number')fail('材质渲染方式缺少参数：'+key);
    parameters(m,true);ids.add(m.id);
  }
  for(const m of DEFAULT_METAL_CONFIG.materials)if(!ids.has(m.id))fail('内置材质不能删除：'+m.id+'；可修改其参数或删除自定义材质');
  return structuredClone(value);
}
export const METAL_FINISHES=Object.create(null);
export const FINISH_KEYS=[];
let configuration;
export function getMetalMaterials(){return structuredClone(configuration);}
export function setMetalMaterialRegistry(value){
  const next=validateMetalMaterials(value),resolved=Object.create(null);
  for(const m of next.materials){const {id,style,...parameters}=m;resolved[id]={...next.styles[style],...parameters};}
  for(const id of Object.keys(METAL_FINISHES))delete METAL_FINISHES[id];
  Object.assign(METAL_FINISHES,resolved);FINISH_KEYS.splice(0,FINISH_KEYS.length,...Object.keys(resolved));configuration=next;
  return getMetalMaterials();
}
export function loadMetalMaterials(){try{return validateMetalMaterials(JSON.parse(localStorage.getItem('webcad.metal-materials.v1')));}catch{return structuredClone(DEFAULT_METAL_CONFIG);}}
export function rememberMetalMaterials(value){try{localStorage.setItem('webcad.metal-materials.v1',JSON.stringify(value));return true;}catch{return false;}}
setMetalMaterialRegistry(loadMetalMaterials());
