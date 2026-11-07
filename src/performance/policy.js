// Calibration candidates, NOT measured targets or a frozen performance baseline.
export const INITIAL_PERFORMANCE_POLICY=Object.freeze({version:'initial-1',calibration:'UNVERIFIED',observeObjects:150,groupObjects:300,urgentObjects:500,
  slowP95Ms:40,recoverP95Ms:24,minSamples:60,minInteractionMs:5000,recoverInteractionMs:30000,downgradeCooldownMs:30000,upgradeIntervalMs:60000});
const qualities=['draft','standard','fine','ultra'];
export function performancePolicy(overrides={}){
  const policy={...INITIAL_PERFORMANCE_POLICY,...overrides};
  if(Object.keys(overrides).some(key=>!Object.hasOwn(INITIAL_PERFORMANCE_POLICY,key))||typeof policy.version!=='string'||!policy.version.trim()||
    !['UNVERIFIED','FROZEN'].includes(policy.calibration))throw Error('INVALID_PERFORMANCE_POLICY');
  for(const key of Object.keys(INITIAL_PERFORMANCE_POLICY).filter(key=>!['version','calibration'].includes(key))){
    if(!Number.isFinite(policy[key])||policy[key]<=0)throw Error('INVALID_PERFORMANCE_POLICY');
  }
  if(![policy.observeObjects,policy.groupObjects,policy.urgentObjects,policy.minSamples].every(Number.isInteger)||
    policy.observeObjects>policy.groupObjects||policy.groupObjects>policy.urgentObjects||policy.recoverP95Ms>=policy.slowP95Ms||
    policy.minSamples<60||policy.minInteractionMs<5000||policy.recoverInteractionMs<30000||policy.downgradeCooldownMs<30000||policy.upgradeIntervalMs<60000)throw Error('INVALID_PERFORMANCE_POLICY');
  return Object.freeze(policy);
}

/** Decision planner only. Does not call setRenderQuality/group or change effective
 * quality. The future host must validate fresh context, serialize display work,
 * and acknowledge the original actionId after a known terminal result. Unknown
 * results stay pending until reconciled; repeated evaluation never resubmits.
 */
export function createPerformancePolicy(overrides={}){
  const policy=performancePolicy(overrides);
  let context=null,sequence=0,pending=null,lastTime=-Infinity,lastAction=null,lastChangeMs=-Infinity,lastUpgradeMs=-Infinity,
    downgraded=false,freshAfterMs=-Infinity,attempted=new Set(),recoveryMs=0,recoveryEndMs=null;
  const copy=value=>value===null?null:structuredClone(value);
  function evaluate(snapshot,{nowMs,preferredQuality='standard',effectiveQuality=preferredQuality,mode='auto',manualLock=false,allowAgentGrouping=false,displayLoadConfirmed=false}={}){
    if(!Number.isFinite(nowMs)||nowMs<0||nowMs<lastTime||!qualities.includes(preferredQuality)||!qualities.includes(effectiveQuality)||!['auto','manual'].includes(mode)||
      ![manualLock,allowAgentGrouping,displayLoadConfirmed].every(value=>typeof value==='boolean'))throw Error('INVALID_PERFORMANCE_INPUT');
    lastTime=nowMs;
    const validContext=typeof snapshot?.documentInstanceId==='string'&&snapshot.documentInstanceId.length>0&&Number.isSafeInteger(snapshot.geometryRevision)&&snapshot.geometryRevision>=0;
    const key=validContext?JSON.stringify([snapshot.documentInstanceId,snapshot.geometryRevision]):null;
    if(key!==context){
      if(pending)lastAction={...pending,status:'stale'};
      context=key;pending=null;downgraded=false;freshAfterMs=-Infinity;attempted=new Set();recoveryMs=0;recoveryEndMs=null;
    }
    const visible=snapshot?.counts?.visibleObjectCount;
    const level=Number.isSafeInteger(visible)&&visible>=0?(visible>=policy.urgentObjects?'high':visible>=policy.groupObjects?'group':visible>=policy.observeObjects?'observe':'normal'):'unknown';
    const out={policyVersion:policy.version,calibration:policy.calibration,preferredQuality,effectiveQuality,state:'insufficient-data',reasonCodes:[],observation:level,
      groupingRecommendation:validContext&&['group','high'].includes(level)?{type:'compound-grouping-recommended',severity:level==='high'?'high':'advisory',allowedOperation:'group',forbiddenAutomaticOperations:['union','fuse'],agentGroupingAllowed:allowAgentGrouping,documentInstanceId:snapshot.documentInstanceId,observedRevision:snapshot.geometryRevision,recommendedTiming:'after-current-batch'}:null,
      proposedAction:null,lastAction:copy(lastAction)};
    // Keep the original proposal reconcilable even if settings change while an
    // outcome is unknown. Never silently replace an in-flight request.
    if(manualLock||mode==='manual'){recoveryMs=0;recoveryEndMs=null;return {...out,state:'manual-locked',reasonCodes:['MANUAL_POLICY'],pendingActionId:pending?.actionId??null};}
    if(pending)return {...out,state:'optimizing',reasonCodes:['AWAITING_ACTION_RECONCILIATION']};
    const window=snapshot?.window,p95=snapshot?.frameIntervalMs?.p95;
    if(!validContext||snapshot?.valid!==true||snapshot.foreground!==true||snapshot.visible!==true||snapshot.interactive!==true||
      !window||!Number.isInteger(window.sampleCount)||window.sampleCount<policy.minSamples||!Number.isFinite(window.interactionMs)||window.interactionMs<policy.minInteractionMs||!Number.isFinite(window.startMs)||!Number.isFinite(window.endMs)||
      window.startMs<0||window.startMs>window.endMs||window.startMs<freshAfterMs||window.endMs>nowMs||nowMs-window.endMs>1000||!Number.isFinite(p95)||p95<=0){
      recoveryMs=0;recoveryEndMs=null;return {...out,reasonCodes:['INSUFFICIENT_VALID_INTERACTION']};
    }
    if(!displayLoadConfirmed){recoveryMs=0;recoveryEndMs=null;return {...out,state:level==='normal'?'normal':'observe',reasonCodes:['DISPLAY_BOTTLENECK_UNCONFIRMED']};}
    // Accumulate successive qualifying windows without retaining >1200 frames.
    // Repeated reads add zero time; gaps and invalid windows break recovery.
    if(p95<policy.recoverP95Ms){
      recoveryMs=recoveryEndMs!==null&&window.startMs<=recoveryEndMs&&window.endMs>=recoveryEndMs?recoveryMs+window.endMs-recoveryEndMs:window.interactionMs;
      recoveryEndMs=window.endMs;
    }else{recoveryMs=0;recoveryEndMs=null;}
    if(nowMs-lastChangeMs<policy.downgradeCooldownMs)return {...out,state:'cooldown',reasonCodes:['DISPLAY_CHANGE_COOLDOWN']};
    const current=qualities.indexOf(effectiveQuality),preferred=qualities.indexOf(preferredQuality);
    let direction,target;
    if(p95>policy.slowP95Ms){
      if(downgraded||current===0)return {...out,state:'constrained',reasonCodes:['DIAGNOSE_REMAINING_LOAD']};
      direction='downgrade';target=qualities[current-1];
    }else if(p95<policy.recoverP95Ms&&recoveryMs>=policy.recoverInteractionMs&&current<preferred){
      if(nowMs-lastUpgradeMs<policy.upgradeIntervalMs)return {...out,state:'cooldown',reasonCodes:['UPGRADE_INTERVAL']};
      direction='upgrade';target=qualities[current+1];
    }else return {...out,state:level==='normal'?'normal':'observe',reasonCodes:[]};
    const attempt=JSON.stringify([context,direction,effectiveQuality,target]);
    if(attempted.has(attempt))return {...out,state:'constrained',reasonCodes:['SAME_DISPLAY_ACTION_ALREADY_ATTEMPTED']};
    attempted.add(attempt);
    pending={actionId:`performance-${++sequence}`,documentInstanceId:snapshot.documentInstanceId,geometryRevision:snapshot.geometryRevision,
      policyVersion:policy.version,direction,fromQuality:effectiveQuality,targetQuality:target,preferredQuality,createdAtMs:nowMs,status:'proposed'};
    return {...out,state:'optimizing',proposedAction:copy(pending)};
  }
  function acknowledge({actionId,status,completedAtMs,effectiveQuality}={}){
    if(!pending||pending.actionId!==actionId)throw Error('STALE_PERFORMANCE_ACTION');
    if(!['applied','failed','unknown'].includes(status)||!Number.isFinite(completedAtMs)||completedAtMs<lastTime)throw Error('INVALID_PERFORMANCE_RECEIPT');
    if(status==='applied'&&effectiveQuality!==pending.targetQuality)throw Error('QUALITY_RECEIPT_MISMATCH');
    lastTime=completedAtMs;lastAction={...pending,status,completedAtMs};
    if(status==='unknown')return copy(lastAction);
    if(status==='applied'){
      lastChangeMs=completedAtMs;freshAfterMs=completedAtMs;recoveryMs=0;recoveryEndMs=null;
      if(pending.direction==='downgrade')downgraded=true;
      else{lastUpgradeMs=completedAtMs;downgraded=false;}
    }
    pending=null;return copy(lastAction);
  }
  return Object.freeze({policy,evaluate,acknowledge});
}
