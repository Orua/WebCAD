import policy from '../../contracts/services/v1/execution-routing.json' with {type:'json'};
import tbd from '../../contracts/services/v1/tbd-capabilities.json' with {type:'json'};
import {patternComplexity,remotePlacementSupported} from './execution-context.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const EXECUTION_POLICY=freeze(policy);
const finite=value=>Number.isFinite(value)&&value>=0;
const known=value=>finite(value)?value:null;
const count=value=>finite(value)?value:0;
const length=value=>Array.isArray(value)?value.length:0;
const descriptions={
 'operation-tbd':'TBD：本项运算尚未完成验收，已禁用；保留原工程，不换算法重算',
 'services-not-configured':'未配置 Services，使用本地计算',
 'interactive-feedback':'选择、旋转及笔刷反馈使用本地',
 'compiled-checkpoint-available':'工程内已有匹配的精确检查点，复用而不重算',
 'simple-local':'输入低于固定复杂度门槛，使用本地计算',
 'complex-remote':'输入达到固定复杂度门槛，交给已配置的 Services',
 'explicit-server':'本次明确使用 Services',
 'services-unavailable':'已配置的 Services 不可用，复杂任务已阻止，不能自动转本地',
 'remote-semantic-not-accepted':'Services 不支持或尚未验证所需操作语义，任务已阻止',
 'client-geometry-bridge-not-accepted':'所需精确几何 codec 或客户端导回尚未验证，任务已阻止',
 'unsupported-placement':'Services 不支持当前放置语义，任务已阻止',
 'source-snapshot-unavailable':'来源快照无法绑定当前事务，任务已阻止',
 'source-solid-count-unsupported':'来源实体数量超出远程实现支持范围，任务已阻止',
 'source-budget-exceeded':'来源超出 Services 输入预算，任务已阻止',
 'pattern-budget-exceeded':'图案超出 Services 层数或图元预算，任务已阻止',
 'known-task-unresolved':'相同物理输入已有失败或未知/未完成任务，先核对原任务，禁止重算',
 'local-operation-unsupported':'当前本地执行器不支持此简单操作'
};
export function routingDescription(reason){return descriptions[reason]??reason;}
export function tbdForOperation(input={}){
 const complexity=classifyComplexity(input);
 return tbd.operations.find(row=>row.enabled===false&&(row.operation===input.operation&&!row.semanticVersion||row.operation===input.operation&&row.semanticVersion===input.semanticVersion&&(complexity.complex||input.explicitRemote===true)))??null;
}

// All rules and thresholds come from the shared policy. Score is a diagnostic
// maximum threshold ratio, not a timing estimate or an additional routing gate.
export function classifyComplexity({operation,source={},pattern={},params={}}={}){
 const observed=patternComplexity({params}),t=policy.thresholds;
 const metric=name=>Math.max(count(pattern[name]),observed[name]);
 const input={operation,sourceBytes:known(source.bytes),sourceFaces:known(source.faces),sourceEdges:known(source.edges),sourceHoles:known(source.holes),
  aggregateRegions:Math.max(metric('regions'),count(pattern.aggregateRegions)),patternHoles:metric('holes'),layers:metric('layers'),contourVertices:metric('vertices'),strokes:metric('strokes'),gridPoints:metric('gridPoints'),
  machiningItems:Math.max(length(params.points),length(params.pockets)),patternInstances:count(params.count),selectedEdges:length(params.edgeIds),selectedFaces:length(params.faceIds)};
 const reasons=[];let score=0;
 const threshold=(value,limit,reason)=>{score=Math.max(score,count(value)/limit);if(count(value)>=limit)reasons.push(reason);};
 threshold(input.sourceFaces,t.sourceFaces,'source-faces');
 threshold(input.sourceEdges,t.sourceEdges,'source-edges');
 threshold(input.sourceBytes,t.sourceBytes,'source-bytes');
 threshold(input.aggregateRegions,t.aggregateRegions,'pattern-regions');
 threshold(input.patternHoles,t.patternHoles,'pattern-holes');
 threshold(input.contourVertices,t.vertices,'pattern-vertices');
 threshold(input.strokes,t.strokes,'pattern-strokes');
 threshold(input.gridPoints,t.gridPoints,'large-surface-grid');
 if(operation==='relief'){
  const ratio=Math.min(input.layers/t.layers,input.contourVertices/t.layerVertices);score=Math.max(score,ratio);
  if(ratio>=1)reasons.push('relief-layered-contours');
 }
 if(policy.denseMachiningOperations.includes(operation))threshold(input.machiningItems,t.machiningItems,'dense-machining');
 if(policy.patternOperations.includes(operation)){
  threshold(input.patternInstances,t.patternInstances,'large-instance-pattern');
  if(params.outputMode==='fuse')threshold(input.patternInstances,t.fusedInstances,'dense-fused-pattern');
 }
 if(policy.edgeTreatmentOperations.includes(operation)){
  threshold(input.selectedEdges,t.selectedEdges,'dense-edge-treatment');
  threshold(input.selectedFaces,t.selectedFaces,'dense-face-treatment');
  if(params.allEdges===true){reasons.push('whole-body-edge-treatment');score=Math.max(score,1);}
 }
 if(policy.conservativeOperations.includes(operation)||operation==='quickModel'&&policy.conservativeQuickModelKinds.includes(params.kind)){
  reasons.push('conservative-surface-or-machining-operation');score=Math.max(score,1);
 }else if(!policy.boundedOperations.includes(operation)){
  reasons.push('unclassified-operation');score=Math.max(score,1);
 }
 return {complex:reasons.length>0,reasons,score,input};
}

export function chooseExecutor({servicesAvailable=false,mode='auto',operation,semanticVersion,source={},pattern={},params={},capabilities,
 localSupported=true,clientImportReady=false,explicitRemote=false,intent='exact',cache={},knownTask=null,
 placement,placementSupported=remotePlacementSupported({placement}),sourceSnapshotReady=true,remoteSemanticSupported=true,
 requiredResultFormat='occt-text-brep-v1'}={}){
 const complexity=classifyComplexity({operation,source,pattern,params});
 const inputs={...complexity.input,semanticVersion,servicesAvailable:servicesAvailable===true,mode,knownCache:{localCheckpoint:cache.localCheckpoint===true,remoteResult:cache.remoteResult===true}};
 const result=(executor,reason)=>({executor,routingReason:reason,reason:routingDescription(reason),policyVersion:policy.policyVersion,inputs,complexity,estimates:null,failureFallback:policy.failureFallback});
 if(intent!=='exact')return result('local','interactive-feedback');
 // The caller must validate an exact recipe/source/codec checkpoint before
 // setting this flag. Reuse does not re-execute an unresolved physical task.
 if(cache.localCheckpoint===true)return result('local','compiled-checkpoint-available');
 if(knownTask&&['failed','unknown','running','paused'].includes(knownTask.state))return result('blocked','known-task-unresolved');
 if(tbdForOperation({operation,semanticVersion,source,pattern,params,explicitRemote}))return result('blocked','operation-tbd');
 if(servicesAvailable!==true)return result('local','services-not-configured');
 if(!complexity.complex&&!explicitRemote)return result(localSupported?'local':'blocked',localSupported?'simple-local':'local-operation-unsupported');
 if(!capabilities||capabilities.available===false||capabilities.enabled===false)return result('blocked','services-unavailable');
 const matching=Array.isArray(capabilities.operations)?capabilities.operations.find(row=>row?.operation===operation&&row.semanticVersion===semanticVersion&&row.enabled===true):null;
 if(!remoteSemanticSupported||!matching||!['passed','bridge-passed-project-gates-pending'].includes(matching.acceptanceStatus)||matching.blockers?.length)return result('blocked','remote-semantic-not-accepted');
 // clientImportReady is evidence of an actually tested producer/consumer codec
 // pair. Native algorithms need no equality gate against the WASM result.
 if(clientImportReady!==true||(matching.resultFormats&&!matching.resultFormats.includes(requiredResultFormat))||
  (capabilities.geometryExchange?.supportedFormats&&!capabilities.geometryExchange.supportedFormats.includes(requiredResultFormat))||capabilities.geometryExchange?.blockers?.length)return result('blocked','client-geometry-bridge-not-accepted');
 if(placementSupported!==true)return result('blocked','unsupported-placement');
 if(sourceSnapshotReady!==true)return result('blocked','source-snapshot-unavailable');
 if(finite(source.solids)&&(source.solids<1||source.solids>(matching.limits?.maxSolids??1)))return result('blocked','source-solid-count-unsupported');
 if(finite(source.bytes)&&finite(matching.limits?.maxSourceBytes)&&source.bytes>matching.limits.maxSourceBytes)return result('blocked','source-budget-exceeded');
 if((finite(matching.limits?.maxLayers)&&complexity.input.layers>matching.limits.maxLayers)||(finite(matching.limits?.maxPrimitives)&&complexity.input.contourVertices>matching.limits.maxPrimitives))return result('blocked','pattern-budget-exceeded');
 return result('remote',explicitRemote?'explicit-server':'complex-remote');
}

// Main's session history interface is retained. Successful measurements are
// diagnostics only; chooseExecutor never reads them, queue costs or upload flags.
export function createExecutionHistory(){
 const entries=new Map(),failures=new Map();
 const key=({operation,semanticVersion,kernelBuildId,endpoint,source={},pattern={}}={})=>JSON.stringify([operation,semanticVersion,kernelBuildId,endpoint,source.faces??null,source.edges??null,source.holes??null,pattern.regions??null,pattern.layers??null,pattern.holes??null,pattern.vertices??null,pattern.strokes??null,pattern.gridPoints??null,finite(source.bytes)?Math.ceil(source.bytes/65536):null]);
 const put=(map,k,value)=>{map.delete(k);map.set(k,value);while(map.size>policy.maxHistoryEntries)map.delete(map.keys().next().value);};
 return {
  timings:input=>({...entries.get(key(input))}),
  task:recipe=>failures.get(recipe)??null,
  success:(input,executor,measurements={})=>{const k=key(input),record={...entries.get(k)};if(executor==='local'&&finite(measurements.totalMs))record.localMs=measurements.totalMs;if(executor==='remote'&&finite(measurements.computeMs)&&finite(measurements.totalMs)){record.remoteComputeMs=measurements.computeMs;record.transferMs=Math.max(0,measurements.totalMs-measurements.computeMs);}put(entries,k,record);},
  // Failed/unknown physical tasks never disappear through diagnostic eviction.
  failure:(recipe,error={})=>{failures.set(recipe,{state:error.observation==='unknown'||error.commitState==='unknown'||['SERVICES_CONNECTION_UNKNOWN','OBSERVATION_CANCELLED','OBSERVATION_TIMEOUT'].includes(error.code)?'unknown':'failed',jobId:error.jobId??null,idempotencyKey:error.idempotencyKey??null,code:error.code??'GEOMETRY_FAILED'});},
  clear:()=>{entries.clear();failures.clear();}
 };
}
