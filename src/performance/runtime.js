import {createPerformancePolicy} from './policy.js';
import {renderQuality} from '../render-quality.js';

// This controller owns display decisions and bounded read-only advisories only.
// Geometry/compound operations are deliberately absent. The host serializes the
// existing remesh path and checks the captured document/revision before install.
export function createPerformanceRuntime({getSnapshot,getContext,changeQuality,onChange=()=>{},now=()=>performance.now(),policy={}}){
  let planner=createPerformancePolicy(policy),settings={mode:'auto',preferredQuality:'standard',manualLock:false,allowAgentGrouping:false},
    effectiveQuality='standard',decision=null,completedAction=null,events=[],advisories=[],seen=new Set(),documentId=null,sequence=0,inFlight=false,generation=0,notificationSeq=0;
  const event=entry=>{events.push(entry);events=events.slice(-32);};
  const copy=value=>structuredClone(value);
  const changed=()=>{notificationSeq++;onChange();};
  function configure(patch){
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!Object.hasOwn(settings,k))||
      patch.mode!==undefined&&!['auto','manual'].includes(patch.mode)||['manualLock','allowAgentGrouping'].some(k=>patch[k]!==undefined&&typeof patch[k]!=='boolean'))throw Object.assign(Error('Invalid performance settings'),{code:'PARAM_SCHEMA_INVALID'});
    if(patch.preferredQuality!==undefined)renderQuality(patch.preferredQuality);
    settings={...settings,...patch};generation++;
    // A user change invalidates undispatched recommendations, not an unknown job.
    if(!inFlight){planner=createPerformancePolicy(policy);decision=null;}
    changed();return state();
  }
  function setEffectiveQuality(quality,{manual=false}={}){
    renderQuality(quality);effectiveQuality=quality;
    if(manual){settings.preferredQuality=quality;generation++;if(!inFlight)planner=createPerformancePolicy(policy);}
  }
  function acknowledgeAdvisory({advisoryId,status}){
    if(!['deferred','no-safe-candidates','declined','stale'].includes(status))throw Object.assign(Error('Invalid advisory status'),{code:'PARAM_SCHEMA_INVALID'});
    const advisory=advisories.find(a=>a.advisoryId===advisoryId);
    if(!advisory||advisory.documentInstanceId!==getContext().documentInstanceId)throw Object.assign(Error('Advisory is stale'),{code:'STALE_REFERENCE'});
    advisory.status=status;event({type:'advisory-response',advisoryId,status,atMs:now()});changed();return copy(advisory);
  }
  function summary(){
    const context=getContext();
    return {notificationSeq,settings:copy(settings),preferredQuality:settings.preferredQuality,effectiveQuality,policy:copy(planner.policy),
      automaticState:inFlight?'optimizing':decision?.state??'insufficient-data',reasonCodes:decision?.reasonCodes??[],lastAction:copy(completedAction),
      advisories:copy(advisories.filter(a=>a.documentInstanceId===context.documentInstanceId)),events:copy(events),inFlight};
  }
  const state=()=>({...getSnapshot(),...summary()});
  async function tick(){
    const context=getContext();
    if(documentId!==context.documentInstanceId){
      documentId=context.documentInstanceId;seen=new Set();advisories=[];generation++;
      if(!inFlight)planner=createPerformancePolicy(policy);
    }
    if(inFlight)return;
    const snapshot=getSnapshot(),atMs=now();
    // Attribution is conservative: measured CPU submit cost, not object count,
    // LLM latency or an invented GPU timer, establishes a display bottleneck.
    const displayLoadConfirmed=snapshot.valid&&snapshot.cpuSubmitMs.p95>=12;
    decision=planner.evaluate(snapshot,{nowMs:atMs,...settings,effectiveQuality,displayLoadConfirmed,blocked:context.blocked===true});
    const recommendation=decision.groupingRecommendation;
    if(recommendation){
      const key=JSON.stringify([documentId,decision.observation,context.structureStage??'document']);
      if(!seen.has(key)){
        seen.add(key);if(seen.size>32)seen.delete(seen.values().next().value);const advisory={...recommendation,version:1,advisoryId:`perf-advisory-${++sequence}`,policyVersion:planner.policy.version,
          reasonCodes:['VISIBLE_OBJECT_COUNT_HIGH',...(snapshot.valid&&snapshot.frameIntervalMs.p95>planner.policy.slowP95Ms?['INTERACTION_FRAME_P95_HIGH']:[])],status:'pending'};
        advisories.push(advisory);advisories=advisories.slice(-32);event({type:'advisory',advisoryId:advisory.advisoryId,atMs});changed();
      }
    }
    const action=decision.proposedAction;
    if(!action)return;
    inFlight=true;const owner=generation,ownerPlanner=planner;
    try{
      const current=getContext();
      if(current.documentInstanceId!==action.documentInstanceId||current.geometryRevision!==action.geometryRevision||current.blocked||settings.manualLock||settings.mode!=='auto')throw Error('PERFORMANCE_ACTION_STALE_OR_BUSY');
      const result=await changeQuality(action,{isCurrent:()=>{
        const current=getContext();return owner===generation&&current.documentInstanceId===action.documentInstanceId&&current.geometryRevision===action.geometryRevision&&!settings.manualLock&&settings.mode==='auto';
      }});
      if(result?.status!=='applied')throw Error(result?.reason??'DISPLAY_CHANGE_FAILED');
      effectiveQuality=action.targetQuality;
      completedAction=ownerPlanner.acknowledge({actionId:action.actionId,status:'applied',completedAtMs:now(),effectiveQuality});
      event({type:'display-quality',actionId:action.actionId,direction:action.direction,quality:effectiveQuality,atMs:now()});
    }catch(error){
      completedAction=ownerPlanner.acknowledge({actionId:action.actionId,status:'failed',completedAtMs:now()});
      event({type:'display-quality-failed',actionId:action.actionId,reason:error.message,atMs:now()});
    }finally{
      inFlight=false;
      if(owner!==generation)planner=createPerformancePolicy(policy);
      decision=null;changed();
    }
  }
  return Object.freeze({configure,setEffectiveQuality,acknowledgeAdvisory,state,summary,tick,version:()=>notificationSeq});
}
