// Drop repeated context copies inside one write receipt.
// Root context, requestContext and facts.nextContext stay so the next call can chain.
const same=(a,b)=>a&&b&&JSON.stringify(a)===JSON.stringify(b);
function compactError(error){
  if(!error||typeof error!=='object'||!error.recovery||typeof error.recovery!=='object')return error;
  const recovery={...error.recovery};
  if(typeof recovery.reason==='string'&&typeof recovery.userMessage==='string'&&recovery.userMessage.startsWith(recovery.reason)){
    delete recovery.reason;recovery.reasonRef='userMessage';
  }
  return {...error,recovery};
}
function compactStep(step,batch){
  if(!step?.result||typeof step.result!=='object')return step;
  const result={...step.result};
  if(result.facts&&typeof result.facts==='object'){
    const facts={...result.facts};
    if(facts.context){delete facts.context;facts.contextRef='result.context';}
    if(facts.nextContext){delete facts.nextContext;facts.nextContextRef='result.requestContext';}
    result.facts=facts;
  }
  if(batch&&same(result.context,batch.context)&&same(result.requestContext,batch.requestContext)){
    delete result.context;delete result.requestContext;result.contextRef='batch';
    if(result.facts)result.facts={...result.facts,contextRef:'batch',nextContextRef:'batch.requestContext'};
  }
  if(result.error)result.error=compactError(result.error);
  return {...step,result};
}
export function compactWriteReceipt(receipt){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return receipt;
  const result={...receipt};
  if(result.error)result.error=compactError(result.error);
  if(result.facts&&typeof result.facts==='object'&&same(result.facts.context,result.context)){
    const facts={...result.facts};
    delete facts.context;facts.contextRef='context';
    result.facts=facts;
  }
  if(Array.isArray(result.results))result.results=result.results.map(step=>compactStep(step,result));
  return result;
}
