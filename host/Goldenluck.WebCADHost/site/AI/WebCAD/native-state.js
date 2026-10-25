const PROTOCOL='goldenluck.webcad.state/1';
const identity=context=>context&&['sessionId','documentId','documentInstanceId'].map(k=>context[k]).join('\n');
// Read-only projection. This never owns commands or replaces the page document.
export function createNativeStateView({api,protocols=()=>[],onChange=()=>{},onError=()=>{}}){
  let stop=null,generation=0,latest=null,confirmed=false,refreshing=null,dirty=false;
  const packet=state=>{
    const v2=protocols().includes('goldenluck.webcad.state/2')&&state.coverageDetails&&typeof state.coverageDetails==='object';
    const snapshot=Object.fromEntries(['context','requestContext','summary','bodies','selection','references','referenceSystem','preview',...(v2?['features']:[])].filter(k=>state[k]!==undefined).map(k=>[k,structuredClone(state[k])]));
    const envelope={protocol:v2?'goldenluck.webcad.state/2':PROTOCOL,schemaVersion:v2?2:1,hostInstanceId:state.context.sessionId,stateSeq:state.stateSeq??null,coverage:Object.keys(snapshot),kind:'snapshot',snapshot,
      ...(v2?{coverageDetails:structuredClone(state.coverageDetails)}:{})};
    if(new TextEncoder().encode(JSON.stringify(envelope)).length>512*1024)throw Object.assign(Error('当前摘要超过同步容量，需实时查询'),{code:'STATE_SIZE_LIMIT'});
    return envelope;
  };
  async function refresh(){
    if(refreshing){dirty=true;return refreshing;}
    const current=generation;
    const operation=(async()=>{do{dirty=false;const next=packet(await api().getState({compact:true}));if(current!==generation)return null;
      if(latest&&identity(latest.snapshot.context)===identity(next.snapshot.context)&&Number.isInteger(next.stateSeq)&&Number.isInteger(latest.stateSeq)&&next.stateSeq<latest.stateSeq)continue;
      latest=next;onChange(structuredClone(next));
    }while(dirty&&current===generation);return latest;})().finally(()=>{if(refreshing===operation)refreshing=null;});
    refreshing=operation;return operation;
  }
  async function connect(){
    if(confirmed)return latest;
    const current=++generation;
    stop?.();stop=api().watchRevision(()=>{void refresh().catch(onError);},{debounceMs:100});
    try{let acknowledged=false;if(stop.ready){const receipt=await stop.ready;if(receipt?.status!=='subscribed')throw Object.assign(Error('状态订阅未确认'),{code:'STATE_SUBSCRIPTION_FAILED'});acknowledged=true;}else if(typeof stop!=='function')throw Error('状态订阅未确认');if(current!==generation)return null;confirmed=acknowledged;return await refresh();}
    catch(error){if(current===generation){confirmed=false;stop?.();stop=null;}onError(error);throw error;}
  }
  return Object.freeze({connect,refresh,read:()=>latest?structuredClone(latest):null,confirmed:()=>confirmed,
    invalidate(){confirmed=false;},disconnect(){generation++;stop?.();stop=null;latest=null;confirmed=false;dirty=false;refreshing=null;}});
}
