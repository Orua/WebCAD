import { FINISH_KEYS } from '../../editor-actions.js';

export const DISPLAY_DEFAULTS=Object.freeze({themeColor:'#2563eb',snapThresholdMm:0.2,defaultColor:'#aac4d9',defaultFinish:'design',background:'#eef1f5',environmentMode:'studio',exposure:1,environmentIntensity:0.8,environmentRotation:0,roughnessOffset:0.08,lightAzimuth:-60,lightElevation:55,keyIntensity:1.3,fillIntensity:0.6,ambientIntensity:0.7});
export const DISPLAY_PRESETS=Object.freeze({studio:{...DISPLAY_DEFAULTS},soft:{...DISPLAY_DEFAULTS,roughnessOffset:0.2,environmentIntensity:0.65,keyIntensity:0.8,fillIntensity:0.8},contrast:{...DISPLAY_DEFAULTS,roughnessOffset:0.04,environmentIntensity:1,keyIntensity:1.8,fillIntensity:0.3,ambientIntensity:0.4}});
export const DISPLAY_RANGES=Object.freeze({snapThresholdMm:[0,10],exposure:[0.1,3],environmentIntensity:[0,3],environmentRotation:[-180,180],roughnessOffset:[0,0.6],lightAzimuth:[-180,180],lightElevation:[-89,89],keyIntensity:[0,6],fillIntensity:[0,6],ambientIntensity:[0,6]});
const cookieName='webcad.display.v1';
export function validateDisplayPreferences(patch){
  const fail=()=>{throw Object.assign(new Error('全局显示参数无效，请按工具文档提供颜色、材质或范围内的数值'),{code:'PARAM_SCHEMA_INVALID'});};
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!Object.hasOwn(DISPLAY_DEFAULTS,k)))fail();
  for(const [key,value]of Object.entries(patch)){
    if(key==='defaultFinish'){if(!FINISH_KEYS.includes(value))fail();}
    else if(key==='environmentMode'){if(!['studio','hdr'].includes(value))fail();}
    else if(key==='defaultColor'||key==='background'||key==='themeColor'){if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))fail();}
    else {const [min,max]=DISPLAY_RANGES[key];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail();}
  }
  return {...patch};
}
export function loadDisplayPreferences(){
  try{const raw=document.cookie.split('; ').find(v=>v.startsWith(cookieName+'='));if(raw){const parsed=JSON.parse(decodeURIComponent(raw.slice(cookieName.length+1)));return {...DISPLAY_DEFAULTS,...validateDisplayPreferences(parsed)};}}catch{}
  return {...DISPLAY_DEFAULTS};
}
export function saveDisplayPreferences(value){
  try{document.cookie=`${cookieName}=${encodeURIComponent(JSON.stringify(value))}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;return JSON.stringify(loadDisplayPreferences())===JSON.stringify(value);}catch{return false;}
}
