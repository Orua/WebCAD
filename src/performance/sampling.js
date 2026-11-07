// Host-fed measurements only: no timers, renderer, document writes or model calls.
const countKeys=['objectCount','visibleObjectCount','solidCount','faceCount','edgeCount','uniqueTriangles','submittedTriangles','drawCalls'];
const durationKeys=['queueMs','geometryMs','triangulationMs','receiptTransferMs','llmWaitMs'];
const nonnegative=value=>Number.isFinite(value)&&value>=0?value:null;
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(p*values.length)-1]:null;

/** Feed one logical frame, after ALL render passes. timestampMs is monotonic rAF
 * time, cpuSubmitMs is CPU duration (not GPU time). The host must supply explicit
 * foreground/visible/interactive flags and exclusion flags. Missing flags fail
 * closed. Capture, fallback renders and cached frames cannot qualify. record()
 * returns a cheap receipt; call snapshot() on demand, not on every frame.
 */
export function createPerformanceSampler({maxSamples=1200,windowMs=60000,minSamples=60,minInteractionMs=5000}={}){
  if(!Number.isInteger(maxSamples)||maxSamples<60||maxSamples>1200||!Number.isFinite(windowMs)||windowMs<5000||
    !Number.isInteger(minSamples)||minSamples<60||minSamples>maxSamples||!Number.isFinite(minInteractionMs)||minInteractionMs<5000||minInteractionMs>windowMs)throw Error('INVALID_PERFORMANCE_WINDOW');
  const buffer=new Array(maxSamples);
  let head=0,size=0,previous=null,identity=null,perfSeq=0,last=null,reasons=['NO_SAMPLES'];
  const reset=()=>{head=0;size=0;previous=null;};
  const receipt=()=>({perfSeq,accepted:reasons.length===0,reasonCodes:[...reasons]});
  function record(frame){
    const validIdentity=typeof frame.documentInstanceId==='string'&&frame.documentInstanceId.length>0&&Number.isSafeInteger(frame.geometryRevision)&&frame.geometryRevision>=0;
    const next=validIdentity?JSON.stringify([frame.documentInstanceId,frame.geometryRevision]):null;
    if(next!==identity){reset();identity=next;}
    perfSeq++;
    reasons=[];
    if(!validIdentity)reasons.push('CONTEXT_MISSING');
    if(!Number.isFinite(frame.timestampMs)||frame.timestampMs<0)reasons.push('INVALID_TIMESTAMP');
    if(frame.foreground!==true)reasons.push('NOT_FOREGROUND');
    if(frame.visible!==true)reasons.push('NOT_VISIBLE');
    if(frame.interactive!==true)reasons.push('NOT_INTERACTING');
    if(frame.frameSource!=='animation-frame')reasons.push('NOT_ANIMATION_FRAME');
    for(const [flag,reason]of [['cachedFrameReused','CACHED_FRAME'],['capture','CAPTURE'],['kernelBusy','GEOMETRY_BUSY'],['previewBusy','PREVIEW_BUSY'],['initializing','INITIALIZING'],['resizing','RESIZING'],['contextLost','CONTEXT_LOST']]){
      if(frame[flag]!==false)reasons.push(frame[flag]===true?reason:reason+'_UNKNOWN');
    }
    if(previous!==null&&frame.timestampMs<=previous)reasons.push('NON_MONOTONIC_TIMESTAMP');
    last={sampledAtMs:nonnegative(frame.timestampMs),documentInstanceId:validIdentity?frame.documentInstanceId:null,geometryRevision:validIdentity?frame.geometryRevision:null,
      foreground:frame.foreground===true,visible:frame.visible===true,interactive:frame.interactive===true,
      counts:Object.fromEntries(countKeys.map(key=>[key,count(frame[key])])),
      toolTiming:Object.fromEntries(durationKeys.map(key=>[key,nonnegative(frame.toolTiming?.[key])]))};
    // Invalid frames interrupt continuity. Never bridge background/capture/busy gaps.
    if(reasons.length){reset();return receipt();}
    if(previous!==null){
      if(size===maxSamples){head=(head+1)%maxSamples;size--;}
      buffer[(head+size)%maxSamples]={startMs:previous,endMs:frame.timestampMs,intervalMs:frame.timestampMs-previous,cpuSubmitMs:nonnegative(frame.cpuSubmitMs)};
      size++;
    }
    previous=frame.timestampMs;
    while(size&&buffer[head].startMs<frame.timestampMs-windowMs){head=(head+1)%maxSamples;size--;}
    return receipt();
  }
  function snapshot(){
    const samples=Array.from({length:size},(_,i)=>buffer[(head+i)%maxSamples]);
    const interactionMs=samples.reduce((sum,sample)=>sum+sample.intervalMs,0);
    const qualified=!reasons.length&&samples.length>=minSamples&&interactionMs>=minInteractionMs;
    const intervals=samples.map(sample=>sample.intervalMs),cpu=samples.map(sample=>sample.cpuSubmitMs).filter(value=>value!==null);
    return {...structuredClone(last),schemaVersion:1,perfSeq,valid:qualified,validity:qualified?'valid':'insufficient-data',reasonCodes:reasons.length?[...reasons]:qualified?[]:['INSUFFICIENT_DATA'],
      window:{maxSamples,windowMs,minSamples,minInteractionMs,sampleCount:samples.length,interactionMs,startMs:samples[0]?.startMs??null,endMs:samples.at(-1)?.endMs??null},
      frameIntervalMs:{p50:percentile(intervals,.5),p95:percentile(intervals,.95)},
      cpuSubmitMs:{sampleCount:cpu.length,p50:percentile(cpu,.5),p95:percentile(cpu,.95)},gpuMs:null};
  }
  return Object.freeze({record,snapshot,reset:()=>{reset();last=null;reasons=['NO_SAMPLES'];}});
}
