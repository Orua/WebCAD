// Worker and command receipts share a bounded report; truncation is explicit.
export function boundedDiagnosticReport(report,maxChars=4096){
 if(!report||typeof report!=='object')return undefined;
 const originalChars=JSON.stringify(report).length;
 if(originalChars<=maxChars)return report;
 const omitted=[];
 function trim(value,path,depth){
  if(typeof value==='string'&&value.length>240){omitted.push(path);return value.slice(0,240)+'…';}
  if(!value||typeof value!=='object')return value;
  if(depth>=4){omitted.push(path);return {omitted:true,count:Array.isArray(value)?value.length:Object.keys(value).length};}
  if(Array.isArray(value)){if(value.length>8)omitted.push(path);return value.slice(0,8).map((v,i)=>trim(v,`${path}[${i}]`,depth+1));}
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,trim(v,path?path+'.'+k:k,depth+1)]));
 }
 const result={...trim(report,'',0),truncated:true,originalChars,omittedPaths:omitted.slice(0,16)};
 if(JSON.stringify(result).length<=maxChars)return result;
 const summary={};
 for(const key of ['version','operation','stage','strategy','attemptCount','elapsedMs','targetCount','requestedAmountMm','dimensionKind','cause','confirmedFailureCount','candidateCount'])if(['string','number','boolean'].includes(typeof report[key]))summary[key]=typeof report[key]==='string'?report[key].slice(0,160):report[key];
 return {...summary,truncated:true,originalChars,reason:'REPORT_SIZE_LIMIT',omittedPaths:['details']};
}
