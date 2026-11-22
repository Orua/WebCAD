const invalid=(path,message)=>{throw Object.assign(new Error(message),{code:'PARAM_SCHEMA_INVALID',path});};

export function spineLawKnots(params){
 if(params.lawSampling===undefined)return [];
 if(!['stations','preserveKnots'].includes(params.lawSampling))invalid('params.lawSampling','lawSampling 须为 stations 或 preserveKnots');
 if(params.pathType!=='spine')invalid('params.lawSampling','lawSampling 只适用于 pathType:spine，不会改变其他路径的采样');
 if(params.lawSampling==='stations')return [];
 const count=params.stations?.count??32;
 if(!Number.isInteger(count)||count<2||count>64)invalid('params.stations.count','脊线 stations.count 须为 2–64');
 const required=new Set([0,1]);
 for(const key of ['widthLaw','depthLaw','rollLawDeg']){
  const law=params[key];
  if(law===undefined||typeof law==='number'&&Number.isFinite(law))continue;
  const samples=law?.samples;
  if(law?.kind!=='spline'||!Array.isArray(samples)||samples.length<2||samples.some(s=>!Array.isArray(s)||s.length!==2||!s.every(Number.isFinite)||s[0]<0||s[0]>1))invalid('params.'+key,`${key} 须为数字或含 [t,value] 的 spline.samples`);
  const seen=new Set();
  for(const [t] of samples){if(seen.has(t))invalid('params.'+key+'.samples',`${key}.samples 的 t 不得重复`);seen.add(t);required.add(t);}
 }
 const knots=[...required].sort((a,b)=>a-b);
 if(knots.length>count)invalid('params.stations.count',`尺寸/滚转 law 需要 ${knots.length} 个关键站，但 stations.count=${count}；增大 count（最多64）、简化 law 或拆成多段，不能丢弃造型关键点。`);
 return knots;
}
