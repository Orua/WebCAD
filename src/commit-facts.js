// Read-only summaries of existing receipts. No state reads or geometry inference.
const clone=structuredClone;
const ids=value=>[...new Set((value||[]).filter(item=>typeof item==='string'))];
const requestContext=c=>c&&({sessionId:c.sessionId,documentId:c.documentId,documentInstanceId:c.documentInstanceId,expectedRevision:c.revision});
const contextOf=s=>s.context||{sessionId:s.sessionId,documentId:s.documentId,documentInstanceId:s.documentInstanceId,revision:s.revision};
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const round=value=>Math.round(value*1000)/1000;
function boundsFor(state,affected){
  return (state.bodies||[]).filter(body=>affected.includes(body.id)&&['min','max'].every(key=>Array.isArray(body.bounds?.[key])&&body.bounds[key].length===3&&body.bounds[key].every(Number.isFinite)))
    .map(body=>({id:body.id,min:body.bounds.min.map(round),max:body.bounds.max.map(round)}));
}
function bounded(facts){
  const lists=['createdBodyIds','deletedBodyIds','affectedBodyIds','replacements'];
  const originals=Object.fromEntries(lists.map(key=>[key,facts[key]||[]]));
  let limit=40,result;
  do{
    const coverage={};result={...facts};
    for(const key of lists){result[key]=originals[key].slice(0,limit);coverage[key]={totalCount:originals[key].length,returnedCount:result[key].length,complete:originals[key].length<=limit};}
    result.bounds={...facts.bounds,items:facts.bounds.items.slice(0,limit),missingBodyIds:facts.bounds.missingBodyIds.slice(0,limit)};
    coverage.bounds={totalCount:facts.bounds.items.length+facts.bounds.missingBodyIds.length,returnedCount:result.bounds.items.length,missingCount:facts.bounds.missingBodyIds.length,complete:facts.bounds.items.length<=limit&&facts.bounds.missingBodyIds.length===0};
    result.measurements={...facts.measurements,items:facts.measurements.items.slice(0,limit)};
    coverage.measurements={totalCount:facts.measurements.items.length,returnedCount:result.measurements.items.length,complete:facts.measurements.items.length<=limit&&!result.measurements.items.some(item=>item.omitted)};
    result.coverage=coverage;result.truncated=lists.some(key=>originals[key].length>limit)||facts.bounds.items.length>limit||facts.bounds.missingBodyIds.length>limit||!coverage.measurements.complete;
    limit=Math.floor(limit/2);
  }while(bytes(result)>16*1024&&limit>0);
  // The full receipt remains unchanged and is the detail source for large batches.
  return result;
}
function common(state,receipt,affected){
  const context=contextOf(state);
  const bounds=boundsFor(state,affected);
  return {schemaVersion:1,context:clone(context),nextContext:requestContext(context),
    bodyCount:Number.isInteger(state.summary?.bodyCount)?state.summary.bodyCount:Array.isArray(state.bodies)?state.bodies.length:null,
    bounds:{unit:'mm',coordinateSystem:'world',quantizationMm:0.001,accuracy:'not_asserted',items:bounds,missingBodyIds:affected.filter(id=>!bounds.some(item=>item.id===id))},
    measurements:{status:'not_measured',items:[]},evidence:{status:'unavailable',reason:'on_demand'},
    receipt:Object.fromEntries(['requestId','transactionId','idempotencyKey'].filter(key=>receipt[key]!==undefined).map(key=>[key,receipt[key]]))};
}
export function commitFacts(before,after,receipt){
  const created=receipt.createdBodyIds||[],removed=(before.bodies||[]).filter(body=>!(after.bodies||[]).some(next=>next.id===body.id)).map(body=>body.id);
  const affected=ids([...created,...(receipt.replacements||[]).map(item=>item.after),...(after.bodies||[]).filter(body=>{
    const previous=(before.bodies||[]).find(item=>item.id===body.id);return !previous||JSON.stringify(previous)!==JSON.stringify(body);
  }).map(body=>body.id)]);
  return bounded({...common(after,receipt,affected),commitState:receipt.status==='committed'?'committed':receipt.commitState||'not_committed',
    geometryCommitted:receipt.status==='committed'&&receipt.validation?.geometry==='passed',
    revisionBefore:before.revision,revisionAfter:after.revision,createdBodyIds:ids(created),deletedBodyIds:ids(removed),affectedBodyIds:affected,replacements:clone(receipt.replacements||[])});
}
export function batchFacts(state,receipt,steps){
  const values=receipt.results||[],committed=values.filter(item=>item.result?.status==='committed'),
    created=ids(committed.flatMap(item=>item.result.createdBodyIds||[])),replacements=committed.flatMap(item=>item.result.replacements||[]),
    affected=ids(committed.flatMap(item=>[...(item.result.facts?.affectedBodyIds||[]),...(item.result.createdBodyIds||[]),...(item.result.replacements||[]).map(row=>row.after)])),
    measured=values.filter(item=>['measure','measureRelation','measureMass','inspectThickness','inspectDraft','inspectFit'].includes(steps.find(step=>step.id===item.id)?.method)&&item.result?.status==='read');
  const facts={...common(state,receipt,affected),commitState:receipt.status==='unknown'?'unknown':receipt.status==='partial'?'partial':committed.length?'committed':'not_committed',
    geometryCommitted:committed.some(item=>item.result.validation?.geometry==='passed'),
    revisionBefore:committed[0]?.result.revisionBefore??null,revisionAfter:state.context?.revision??null,
    createdBodyIds:created,deletedBodyIds:ids(committed.flatMap(item=>item.result.deletedBodyIds||item.result.facts?.deletedBodyIds||[])),affectedBodyIds:affected,replacements:clone(replacements),
    steps:{...clone(receipt.progress),committedStepIds:committed.map(item=>item.id),pendingStepIds:values.filter(item=>['unknown','queued','running'].includes(item.result?.status)).map(item=>item.id),
      pendingJobs:values.filter(item=>['unknown','queued','running'].includes(item.result?.status)).map(item=>({stepId:item.id,...Object.fromEntries(['pageJobId','jobId'].filter(key=>item.result[key]!==undefined).map(key=>[key,item.result[key]])),...(item.result.error?.jobId?{jobId:item.result.error.jobId}:{})}))},
    ...(receipt.error?{error:{code:receipt.error.code,path:receipt.error.path,details:'original_receipt'}}:{})};
  if(measured.length)facts.measurements={status:'measured',items:measured.map(item=>({stepId:item.id,...(bytes(item.result)<=2048?{result:clone(item.result)}:{details:'original_step_receipt',omitted:true})}))};
  return bounded(facts);
}
