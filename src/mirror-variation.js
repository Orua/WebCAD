const error=message=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID'});};
export function mirrorVariation(input={}){
  if(typeof input.seed!=='string'||!input.seed||input.seed.length>200)error('变化镜像需要1–200字的seed');
  let state=2166136261;for(const ch of input.seed){state^=ch.charCodeAt(0);state=Math.imul(state,16777619);}state>>>=0;
  const random=()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const range=(key)=>{const values=input[key]??[0,0,0];if(!Array.isArray(values)||values.length!==3||values.some(v=>!Number.isFinite(v)||v<0))error(key+'必须为三个非负扰动上限');return values.map(v=>(random()*2-1)*v);};
  const translateMm=range('translateMm'),rotateDeg=range('rotateDeg'),scale=input.scale??[1,1];
  if(!Array.isArray(scale)||scale.length!==2||!scale.every(Number.isFinite)||scale[0]<=0||scale[1]<scale[0])error('scale必须为正数区间[min,max]');
  return {seed:input.seed,translateMm,rotateDeg,scale:scale[0]+random()*(scale[1]-scale[0])};
}
export function overriddenParams(params,overrides){
  const out=structuredClone(params);
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).length>100)error('linkedOverrides需要最多100项路径覆盖');
  for(const [path,value] of Object.entries(overrides)){
    if(!/^[a-zA-Z][a-zA-Z0-9]*(?:\[\d+\]|\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(path)||/(__proto__|constructor|prototype)/.test(path)||typeof value!=='number'||!Number.isFinite(value))error('覆盖路径无效：'+path);
    const keys=path.replace(/\[(\d+)\]/g,'.$1').split('.');let target=out;
    for(const key of keys.slice(0,-1)){if(!target||typeof target!=='object'||!Object.hasOwn(target,key))error('覆盖字段不存在：'+path);target=target[key];}
    if(!target||typeof target!=='object'||!Object.hasOwn(target,keys.at(-1)))error('覆盖字段不存在：'+path);target[keys.at(-1)]=value;
  }
  return out;
}
export function applyMirrorVariation(shape,input){
  const report=mirrorVariation(input);let result=shape;
  const box=shape.boundingBox;let center;
  try{const [min,max]=box.bounds;center=min.map((v,i)=>(v+max[i])/2);}finally{box.delete();}
  const replace=next=>{const old=result;result=next;if(old!==shape)old.delete();};
  try{
    if(report.scale!==1)replace(result.scale(report.scale,center));
    for(let i=0;i<3;i++)if(report.rotateDeg[i])replace(result.rotate(report.rotateDeg[i],center,[[1,0,0],[0,1,0],[0,0,1]][i]));
    if(report.translateMm.some(v=>v!==0))replace(result.translate(...report.translateMm));
    if(result===shape)result=shape.clone();result.variationReport=report;return result;
  }catch(error){if(result!==shape)result.delete();throw error;}
}
