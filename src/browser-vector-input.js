import {convertVectorEntities,parseDxf,vectorBounds} from './vector-import.js';
import {validateProfile} from './modeling/profiles/profile-model.js';
import {parseLocalLogoSvg} from './svg-logo-input.js';

const fail=message=>{throw Object.assign(new Error(message),{code:'VECTOR_INVALID'});};
function readDwg(bytes){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('vector-dwg-worker.js',document.baseURI),{type:'module'});
 const finish=(error,value)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(new Error('DWG 解析超过 60 秒，已释放解析器')),60000);
 worker.onerror=e=>finish(new Error(e.message||'DWG 解析器加载失败'));
 worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data.entities);
 worker.postMessage(bytes.buffer,[bytes.buffer]);
});}
export async function readVectorInput({bytes,text,name='pasted.json',scaleMm=1,targetWidthMm}={}){
 if(text!==undefined){if(typeof text!=='string'||text.length>20*1024*1024)fail('粘贴文本过大');bytes=new TextEncoder().encode(text);}
 if(!(bytes instanceof Uint8Array)||bytes.length>20*1024*1024||!bytes.length)fail('请选择或粘贴矢量文件（最大 20 MiB）');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const extension=name.split('.').at(-1).toLowerCase();let result;
 if(extension==='dwg')result=convertVectorEntities(await readDwg(bytes),{scaleMm});
 else if(extension==='dxf')result=convertVectorEntities(parseDxf(new TextDecoder().decode(bytes)),{scaleMm});
 else if(extension==='svg'){
  const logo=parseLocalLogoSvg(new TextDecoder().decode(bytes),{name,targetWidthMm});let index=0;
  const entities=logo.regions.flatMap(r=>[r.outer,...r.holes].flatMap(points=>points.map((p,i)=>({id:`s${index++}`,type:'line',startMm:p,endMm:points[(i+1)%points.length],layer:'SVG',sourceId:String(index)}))));
  result={version:1,units:'mm',entities,unsupported:[],bounds:vectorBounds(entities),approximationToleranceMm:logo.source.approximationToleranceMm};
 }else if(extension==='json'){
  const input=JSON.parse(new TextDecoder().decode(bytes)),entities=input.entities;
  if(!Array.isArray(entities)||!entities.length||entities.length>100000)fail('JSON 须包含 entities 数组');
  for(const e of entities)validateProfile({profileVersion:1,entities:[e],output:'wire'});
  result={version:1,units:'mm',entities,unsupported:[],bounds:vectorBounds(entities)};
 }else fail('支持 DWG、ASCII DXF、受限 SVG 和解析轮廓 JSON');
 return {...result,source:{name,sha256,format:extension,scaleMm:extension==='dwg'||extension==='dxf'?scaleMm:1}};
}
export function selectVector(dataset,{entityIds,bounds,layers}={}){
 if(entityIds!==undefined&&(!Array.isArray(entityIds)||!entityIds.length||entityIds.some(id=>typeof id!=='string'||!dataset.entities.some(e=>e.id===id))))fail('请选择存在的实体 ID');
 if(bounds!==undefined&&(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]))fail('框选范围须为 [minX,minY,maxX,maxY]');
 if(layers!==undefined&&(!Array.isArray(layers)||layers.some(v=>typeof v!=='string')))fail('图层须为字符串数组');
 const entities=dataset.entities.filter(e=>(!entityIds||entityIds.includes(e.id))&&(!layers||layers.includes(e.layer))&&(!bounds||(()=>{const b=vectorBounds([e]);return b[0]>=bounds[0]&&b[1]>=bounds[1]&&b[2]<=bounds[2]&&b[3]<=bounds[3];})()));
 return {...dataset,entities,bounds:entities.length?vectorBounds(entities):null,selection:{entityIds,bounds,layers}};
}
