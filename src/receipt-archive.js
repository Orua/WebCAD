// Retain write identities for the page lifetime without retaining large payloads.
export function unresolvedReceipt(value){
  return !!value&&typeof value==='object'&&(value.status==='unknown'||value.commitState==='unknown'||Object.values(value).some(unresolvedReceipt));
}
export function archiveReceiptResult(value){
  if(!value||typeof value!=='object')return value;
  const keys=['status','commitState','requestId','idempotencyKey','context','revision','revisionBefore','revisionAfter','currentRevision',
    'createdBodyIds','createdFeatureIds','removedBodyIds','replacements','featureId','resourceId','name','extension','mime','size','sha256',
    'attachment','saveConfirmation','error','summary','recovery','jobId','pageJobId','serviceJobId'];
  keys.push('preparationId','recipeHash','questions','nextCall','reused');
  const result={archived:true,originalStatus:value.status};
  for(const key of keys)if(value[key]!==undefined)result[key]=structuredClone(value[key]);
  if(Array.isArray(value.results))result.results=value.results.map(item=>({id:item.id,stage:item.stage,result:archiveReceiptResult(item.result)}));
  result.archiveNotice='Original outcome retained; read current state or the original Agent receipt for omitted details. Do not repeat this operation.';
  return result;
}
