// Guard estimates and provider-reported billing are separate ledgers.
// Unknown actual values stay null. No default prices or synthetic zero charges.
// Use when the user has not requested a spending/token cap. Execution and
// geometry limits remain in the plan; unknown requests still require reconciliation.
export function createUsageRecorder({authorizationSource}={}){
 if(!authorizationSource)throw Error('EXISTING_MODEL_AUTHORIZATION_REQUIRED');
 const configuration=Object.freeze({mode:'native-account-usage-only',tokenLimit:null,costLimit:null,authorizationSource});
 let sequence=0,pending=null,frozen=false,knownTokens=0,knownCost=0,unknownTokenSpans=0,unknownCostSpans=0;
 const snapshot=()=>({configuration,guard:{chargedTokens:knownTokens,chargedCostUpperBound:null,enforced:false},actual:{totalTokens:unknownTokenSpans?null:knownTokens,totalCost:unknownCostSpans?null:knownCost,knownTokens,unknownTokenSpans,unknownCostSpans},unknownRequest:frozen});
 return Object.freeze({configuration,snapshot,
  begin(){if(frozen||pending)throw Error('METER_PREVIOUS_REQUEST_UNRESOLVED');pending={id:++sequence};return {...pending};},
  finish(ticket,usage={}){
   if(!pending||pending.id!==ticket.id)throw Error('METER_TICKET_MISMATCH');
   const actualTokens=Number.isInteger(usage.totalTokens)&&usage.totalTokens>=0?usage.totalTokens:null;
   const actualCost=Number.isFinite(usage.cost)&&usage.cost>=0?usage.cost:null;
   if(actualTokens===null)unknownTokenSpans++;else knownTokens+=actualTokens;
   if(actualCost===null)unknownCostSpans++;else knownCost+=actualCost;
   pending=null;return {chargedTokens:actualTokens??0,actualTokens,actualCost,tokenSource:actualTokens===null?'unavailable':'provider-response',configuration,snapshot:snapshot()};
  },
  abandon(ticket){if(!pending||pending.id!==ticket.id)throw Error('METER_TICKET_MISMATCH');unknownTokenSpans++;unknownCostSpans++;pending=null;frozen=true;return snapshot();},
 });
}
export function createUsageMeter({tokenLimit,costLimit=null,mode='native-account-token-cap',authorizationSource,priceUpperBoundPerMillion=null,framingTokensPerMessage=256,initialSnapshot}={}){
 if(!Number.isInteger(tokenLimit)||tokenLimit<1||!authorizationSource||mode!=='native-account-token-cap'||costLimit!==null&&(!Number.isFinite(costLimit)||costLimit<0)||!Number.isInteger(framingTokensPerMessage)||framingTokensPerMessage<0)throw Error('FROZEN_USAGE_METER_CONFIGURATION_REQUIRED');
 if(costLimit!==null&&(!Number.isFinite(priceUpperBoundPerMillion)||priceUpperBoundPerMillion<0))throw Error('EXPLICIT_PRICE_UPPER_BOUND_REQUIRED_FOR_COST_CAP');
 const configuration=Object.freeze({tokenLimit,costLimit,mode,authorizationSource,priceUpperBoundPerMillion,framingTokensPerMessage,estimateMethod:'UTF-8 JSON byte ceiling plus explicit framing allowance; estimate, not reported token usage'});
 let chargedTokens=0,chargedCost=0,actualTokens=0,actualCost=0,unknownTokenSpans=0,unknownCostSpans=0,sequence=0,pending=null,frozen=false;
 const reconciliations=[];
 if(initialSnapshot){
  if(initialSnapshot.configuration?.tokenLimit!==tokenLimit||initialSnapshot.configuration?.costLimit!==costLimit||initialSnapshot.configuration?.mode!==mode||!Number.isInteger(initialSnapshot.guard?.chargedTokens)||initialSnapshot.guard.chargedTokens<0||initialSnapshot.guard.chargedTokens>tokenLimit)throw Error('METER_RESTORE_CONFIGURATION_MISMATCH');
  chargedTokens=initialSnapshot.guard.chargedTokens;chargedCost=initialSnapshot.guard.chargedCostUpperBound??0;
  actualTokens=initialSnapshot.actual?.totalTokens??0;actualCost=initialSnapshot.actual?.totalCost??0;
  unknownTokenSpans=initialSnapshot.actual?.unknownTokenSpans??(initialSnapshot.actual?.totalTokens===null?1:0);
  unknownCostSpans=initialSnapshot.actual?.unknownCostSpans??(initialSnapshot.actual?.totalCost===null?1:0);
  frozen=initialSnapshot.unknownRequest===true;sequence=1;reconciliations.push(...(initialSnapshot.reconciliations??[]));
 }
 const snapshot=()=>({configuration,guard:{chargedTokens,chargedCostUpperBound:costLimit===null?null:chargedCost},actual:{totalTokens:unknownTokenSpans?null:actualTokens,totalCost:unknownCostSpans?null:actualCost,unknownTokenSpans,unknownCostSpans},unknownRequest:frozen,reconciliations:structuredClone(reconciliations)});
 return Object.freeze({configuration,snapshot,
  begin({wireBody,outputTokenLimit,messageCount=0,totalTokenUpperBound=null}){
   if(frozen||pending)throw Error('METER_PREVIOUS_REQUEST_UNRESOLVED');
   if(!Number.isInteger(outputTokenLimit)||outputTokenLimit<1||!Number.isInteger(messageCount)||messageCount<0)throw Error('METER_REQUEST_LIMIT_REQUIRED');
   const estimatedInputTokenUpperBound=Buffer.byteLength(JSON.stringify(wireBody),'utf8')+framingTokensPerMessage*messageCount;
   if(totalTokenUpperBound!==null&&(!Number.isInteger(totalTokenUpperBound)||totalTokenUpperBound<1))throw Error('METER_NATIVE_UPPER_BOUND_INVALID');
   const reservation=totalTokenUpperBound??estimatedInputTokenUpperBound+outputTokenLimit;
   const costReservation=priceUpperBoundPerMillion===null?null:reservation*priceUpperBoundPerMillion/1e6;
   if(chargedTokens+reservation>tokenLimit||costLimit!==null&&chargedCost+costReservation>costLimit)throw Error('TOTAL_BUDGET_EXHAUSTED_BEFORE_REQUEST');
   pending={id:++sequence,reservation,estimatedInputTokenUpperBound,outputTokenLimit,costReservation,reservationSource:totalTokenUpperBound===null?'estimated-input-plus-requested-output':'host-verified-native-request-upper-bound'};return {...pending};
  },
  finish(ticket,usage={}){
   if(!pending||pending.id!==ticket.id)throw Error('METER_TICKET_MISMATCH');
   const reportedTokens=Number.isInteger(usage.totalTokens)&&usage.totalTokens>=0?usage.totalTokens:null;
   const reportedCost=Number.isFinite(usage.cost)&&usage.cost>=0?usage.cost:null;
   const accountedTokens=reportedTokens??pending.reservation;
   chargedTokens+=accountedTokens;
   if(reportedTokens===null)unknownTokenSpans++;else actualTokens+=reportedTokens;
   if(reportedCost===null)unknownCostSpans++;else actualCost+=reportedCost;
   if(costLimit!==null)chargedCost+=reportedCost??accountedTokens*priceUpperBoundPerMillion/1e6;
   const boundExceeded=reportedTokens!==null&&pending.reservationSource==='host-verified-native-request-upper-bound'&&reportedTokens>pending.reservation;
   const result={chargedTokens:accountedTokens,actualTokens:reportedTokens,actualCost:reportedCost,tokenSource:reportedTokens===null?'reserved-estimated-upper-bound':'provider-response',requestEstimate:{...pending},configuration,snapshot:null};
   pending=null;result.snapshot=snapshot();
   if(boundExceeded||chargedTokens>tokenLimit||costLimit!==null&&chargedCost>costLimit){frozen=true;return {...result,exhausted:true,boundExceeded,snapshot:snapshot()};}
   return result;
  },
  abandon(ticket){
   if(!pending||pending.id!==ticket.id)throw Error('METER_TICKET_MISMATCH');
   chargedTokens+=pending.reservation;if(costLimit!==null)chargedCost+=pending.costReservation;
   unknownTokenSpans++;unknownCostSpans++;pending=null;frozen=true;return snapshot();
  },
  reconcileRejectedReservation({reservationTokens,evidence}={}){
   if(!frozen||pending||reconciliations.length||unknownTokenSpans!==1||!Number.isInteger(reservationTokens)||reservationTokens<1||reservationTokens>chargedTokens||costLimit!==null||evidence?.approvedByCoordinator!==true||evidence.kind!=='confirmed-pre-inference-http-400'||evidence.httpStatus!==400||evidence.auditTokens!==0||evidence.geometryWrites!==0||evidence.terminal!==true||!/^[a-f0-9]{64}$/.test(evidence.sha256??''))throw Error('EXPLICIT_CONFIRMED_REJECTION_RECONCILIATION_REQUIRED');
   // Credit only the guard estimate. Unknown actual token/billing values stay null.
   chargedTokens-=reservationTokens;frozen=false;
   reconciliations.push({guardTokenCredit:reservationTokens,evidenceSha256:evidence.sha256,reason:evidence.kind,actualUsageUnchanged:true});
   return snapshot();
  },
 });
}

// Host-only ledger continuation after explicit human budget approval. A confirmed
// rejected request may be terminal while its actual usage is still unknown.
// Keep that reservation and unknown billing span: no refund and no fabricated zero.
export function authorizeUsageContinuation(previous,{tokenLimit,authorizationSource,rejectionEvidence}={}){
 const e=rejectionEvidence;
 if(previous?.configuration?.mode!=='native-account-token-cap'||previous.configuration.costLimit!==null||!Number.isInteger(previous.configuration.tokenLimit)||
   !Number.isInteger(tokenLimit)||tokenLimit<previous.configuration.tokenLimit||!authorizationSource||previous.unknownRequest!==true||
   !Number.isInteger(previous.guard?.chargedTokens)||previous.guard.chargedTokens<1||previous.guard.chargedTokens>tokenLimit||
   previous.actual?.totalTokens!==null||previous.actual?.unknownTokenSpans!==1||
   e?.approvedByCoordinator!==true||e.kind!=='confirmed-pre-inference-http-400'||e.httpStatus!==400||e.auditTokens!==0||e.geometryWrites!==0||e.terminal!==true||
   !/^[a-f0-9]{64}$/.test(e.sha256??''))throw Error('EXPLICIT_APPROVED_BUDGET_AND_TERMINAL_REJECTION_REQUIRED');
 const next=structuredClone(previous);
 next.configuration={...next.configuration,tokenLimit,authorizationSource};
 next.unknownRequest=false;
 next.reconciliations=[...(next.reconciliations??[]),{kind:'terminal-rejection-budget-continuation',previousTokenLimit:previous.configuration.tokenLimit,tokenLimit,
   evidenceSha256:e.sha256,guardTokenCredit:0,preservedChargedTokens:previous.guard.chargedTokens,actualUsageUnchanged:true,authorizationSource}];
 return next;
}
