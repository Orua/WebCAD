import {validateReliefReference} from './relief-design-reference-contract.js';
import {validateReliefHeightSource} from './relief-source/source.js';
// Authored design intent only: no inferred image heights, sampled surface or CAD result.
const fail=(path,message,code='PARAM_SCHEMA_INVALID')=>{throw Object.assign(new Error(message),{code,path});};
function object(value,keys,path){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail(path,'需要普通对象');
 for(const key of Object.keys(value))if(!keys.includes(key))fail(`${path}.${key}`,'不支持的设计草稿字段');
}
function number(value,path,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(path,`需要 ${min}–${max} 范围内的有限数值`,'PARAM_RANGE_INVALID');return value;}
function text(value,path,max=120){if(typeof value!=='string'||!value.trim()||value.length>max)fail(path,`需要 1–${max} 字符`);return value.trim();}
function xy(value,path){if(!Array.isArray(value)||value.length!==2)fail(path,'需要 [x,y] 毫米坐标');return value.map((v,i)=>number(v,`${path}[${i}]`,-10000,10000));}
export function validateDesignRegion(value,path='region'){
 object(value,value?.kind==='circle'?['kind','centerMm','radiusMm']:['kind','centerMm','widthMm','heightMm'],path);
 const centerMm=xy(value.centerMm,`${path}.centerMm`);
 if(value.kind==='circle')return {kind:'circle',centerMm,radiusMm:number(value.radiusMm,`${path}.radiusMm`,0.001,10000)};
 if(value.kind==='rect')return {kind:'rect',centerMm,widthMm:number(value.widthMm,`${path}.widthMm`,0.001,10000),heightMm:number(value.heightMm,`${path}.heightMm`,0.001,10000)};
 fail(`${path}.kind`,'当前设计区域支持 circle 或 rect');
}
function inside(shape,[x,y]){
 const dx=Math.abs(x-shape.centerMm[0]),dy=Math.abs(y-shape.centerMm[1]);
 return shape.kind==='circle'?Math.hypot(dx,dy)<=shape.radiusMm:dx<=shape.widthMm/2&&dy<=shape.heightMm/2;
}
export function validateReliefDesign(input,path='draft'){
 object(input,['schemaVersion','name','support','throughHoles','protectedZones','heightRangeMm','points','fieldSettings','reference','heightSource'],path);
 if(input.schemaVersion!==1)fail(`${path}.schemaVersion`,'需要设计草稿 schemaVersion:1');
 const name=text(input.name,`${path}.name`),support=validateDesignRegion(input.support,`${path}.support`);
 const regions=key=>{const values=input[key];if(!Array.isArray(values)||values.length>32)fail(`${path}.${key}`,'需要最多32项的区域数组');return values.map((v,i)=>validateDesignRegion(v,`${path}.${key}[${i}]`));};
 const throughHoles=regions('throughHoles'),protectedZones=regions('protectedZones');
 if(!Array.isArray(input.heightRangeMm)||input.heightRangeMm.length!==2)fail(`${path}.heightRangeMm`,'需要 [最低高度,最高高度] mm');
 const heightRangeMm=input.heightRangeMm.map((v,i)=>number(v,`${path}.heightRangeMm[${i}]`,-100,100));
 if(heightRangeMm[0]>heightRangeMm[1])fail(`${path}.heightRangeMm`,'最低高度不能高于最高高度');
 if(!Array.isArray(input.points)||input.points.length>256)fail(`${path}.points`,'高度点最多256项');
 const seen=new Set();
 const points=input.points.map((point,i)=>{
  const p=`${path}.points[${i}]`;object(point,['id','pointMm','heightMm'],p);
  const id=text(point.id,`${p}.id`,64);if(seen.has(id))fail(`${p}.id`,'高度点 ID 重复');seen.add(id);
  const pointMm=xy(point.pointMm,`${p}.pointMm`),heightMm=number(point.heightMm,`${p}.heightMm`,...heightRangeMm);
  if(!inside(support,pointMm)||throughHoles.some(s=>inside(s,pointMm)))fail(`${p}.pointMm`,'高度点必须在支撑范围内且避开孔','RELIEF_DESIGN_OUTSIDE');
  if(protectedZones.some(s=>inside(s,pointMm)))fail(`${p}.pointMm`,'高度点位于保护区；请移到保护区外','RELIEF_DESIGN_PROTECTED');
  return {id,pointMm,heightMm};
 });
 let fieldSettings;
 if(input.fieldSettings!==undefined){
  const p=path+'.fieldSettings',v=input.fieldSettings;object(v,['columns','rows','smoothWeight','maxIterations','toleranceMm','edits','machiningPrecisionMm'],p);fieldSettings={};
  for(const [key,min,max,integer]of [['columns',9,129,true],['rows',9,129,true],['smoothWeight',0,100000,false],['maxIterations',1,20000,true],['toleranceMm',1e-10,1,false],['machiningPrecisionMm',.01,.5,false]])if(v[key]!==undefined){fieldSettings[key]=number(v[key],p+'.'+key,min,max);if(integer&&!Number.isInteger(v[key]))fail(p+'.'+key,'需要整数');}
  if(v.edits!==undefined){if(!Array.isArray(v.edits)||v.edits.length>256)fail(p+'.edits','最多256笔');fieldSettings.edits=v.edits.map((e,i)=>{const q=p+'.edits['+i+']';object(e,['mode','centerMm','radiusMm','strength','amountMm','targetMm'],q);if(!['raise','lower','flatten','smooth'].includes(e.mode))fail(q+'.mode','不支持的笔刷');const r={mode:e.mode,centerMm:xy(e.centerMm,q+'.centerMm'),radiusMm:number(e.radiusMm,q+'.radiusMm',.001,10000)};for(const [k,a,b]of [['strength',0,1],['amountMm',0,100],['targetMm',-100,100]])if(e[k]!==undefined)r[k]=number(e[k],q+'.'+k,a,b);return r;});}
 }
 // Optional imported height map: covers the support bounding box, maps 0..1 to baseline..baseline+depthMm.
 let heightSource;
 if(input.heightSource!==undefined){
  const p=path+'.heightSource',v=input.heightSource;object(v,['source','depthMm','weight','edgeKeepoutMm','edgeFadeMm'],p);
  const span=heightRangeMm[1]-heightRangeMm[0];if(!(span>0))fail(p,'导入高度图需要高度范围大于 0','PARAM_RANGE_INVALID');
  if(v.source?.grid&&(v.source.grid.columns>513||v.source.grid.rows>513))fail(p+'.source.grid','草稿内高度网格最多 513×513','RELIEF_LIMIT');
  heightSource={source:validateReliefHeightSource(v.source,p+'.source'),depthMm:number(v.depthMm,p+'.depthMm',1e-6,span),...(v.weight!==undefined?{weight:number(v.weight,p+'.weight',1e-3,1e6)}:{}),...(v.edgeKeepoutMm!==undefined?{edgeKeepoutMm:number(v.edgeKeepoutMm,p+'.edgeKeepoutMm',0,1000)}:{}),...(v.edgeFadeMm!==undefined?{edgeFadeMm:number(v.edgeFadeMm,p+'.edgeFadeMm',0,1000)}:{})};
 }
 return {schemaVersion:1,name,support,throughHoles,protectedZones,heightRangeMm,points,...(fieldSettings?{fieldSettings}:{}),...(input.reference!==undefined?{reference:validateReliefReference(input.reference)}:{}),...(heightSource?{heightSource}:{})};
}
export function validateReliefDesigns(input){
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>16)fail('reliefDesigns','工程最多保留16份设计草稿');
 const ids=new Set();
 return input.map((value,i)=>{
  const path=`reliefDesigns[${i}]`;object(value,['id','revision','draft'],path);
  const id=text(value.id,`${path}.id`,64);if(ids.has(id))fail(`${path}.id`,'设计草稿 ID 重复');ids.add(id);
  if(!Number.isSafeInteger(value.revision)||value.revision<1)fail(`${path}.revision`,'草稿修订须为正整数');
  return {id,revision:value.revision,draft:validateReliefDesign(value.draft,`${path}.draft`)};
 });
}
export function updateReliefDesigns(current,args){
 const designs=validateReliefDesigns(current);
 object(args,['id','expectedDraftRevision','draft','remove'],'args');
 const id=text(args.id,'args.id',64),index=designs.findIndex(d=>d.id===id),previous=index<0?null:designs[index];
 if(!Number.isSafeInteger(args.expectedDraftRevision)||args.expectedDraftRevision<0)fail('args.expectedDraftRevision','新建传0，编辑传当前草稿 revision');
 if(args.expectedDraftRevision!==(previous?.revision??0))fail('args.expectedDraftRevision','草稿已改变，请重新读取后编辑','REVISION_CONFLICT');
 if(args.remove!==undefined&&typeof args.remove!=='boolean')fail('args.remove','remove 必须是布尔值');
 if(args.remove){
  if(args.draft!==undefined)fail('args.draft','删除时不提供 draft');
  if(!previous)fail('args.id','草稿不存在','STALE_REFERENCE');
  return designs.filter(d=>d.id!==id);
 }
 const draft=validateReliefDesign(args.draft);
 if(!previous&&designs.length>=16)fail('args.id','工程最多保留16份设计草稿','RESOURCE_LIMIT');
 if(previous&&JSON.stringify(previous.draft)===JSON.stringify(draft))return designs;
 const next={id,revision:(previous?.revision??0)+1,draft};
 if(index<0)designs.push(next);else designs[index]=next;
 return designs;
}
