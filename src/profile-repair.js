import {inspectProfileModel} from './profile-inspection.js';
import {validateProfile} from './profile-model.js';

const fail=(message,code='PROFILE_REPAIR_INVALID')=>{throw Object.assign(new Error(message),{code});};

// A repair is a new history feature. The source profile is never mutated.
export function repairProfile(source,params){
  if(!source||!params||typeof params.issueId!=='string'||!Number.isFinite(params.maxEndpointMoveMm)||params.maxEndpointMoveMm<=0||params.maxEndpointMoveMm>1)fail('请指定问题 ID 和 0–1 mm 的允许端点位移');
  const before=inspectProfileModel(source),candidate=before.issues.find(item=>item.issueId===params.issueId);
  if(!candidate||!['closureGap','endpointGap'].includes(candidate.kind))fail('指定的端点问题在当前来源中不存在或不能自动修复','STALE_REFERENCE');
  if(candidate.distanceMm>params.maxEndpointMoveMm+1e-9)fail(`所需端点位移 ${candidate.distanceMm.toFixed(6)} mm 超过允许值 ${params.maxEndpointMoveMm} mm`);
  const output=structuredClone(source),pathId=params.issueId.split(':')[1],path=output.chains?.find(item=>item.id===pathId)||output.loops?.find(item=>item.id===pathId);
  if(!path)fail('来源路径已变化','STALE_REFERENCE');
  const index=candidate.kind==='closureGap'?path.edges.length-1:Number(params.issueId.split(':')[2]);
  const entry=path.edges[index],entity=output.entities.find(item=>item.id===entry?.entityId);
  if(!entity||!['line','arc3'].includes(entity.type))fail('首版仅支持明确的直线或圆弧端点修复');
  const endpoint=entry.reversed?'startMm':'endMm';
  entity[endpoint]=[...candidate.targetPoint];
  if(candidate.kind==='closureGap'){
    output.chains=output.chains.filter(item=>item.id!==pathId);
    output.loops=[...(output.loops||[]),{...path}];
    output.regions=[{id:`region-${path.id}`,outerLoopId:path.id,holeLoopIds:[]}];
    output.output='face';
  }
  validateProfile(output);
  const after=inspectProfileModel(output);
  if(after.summary.blockingCount>0)fail('移动指定端点后仍有阻止成面的其他问题；请先逐项修复');
  return {profile:output,receipt:{issueId:params.issueId,changedEntityId:entity.id,changedEndpoint:endpoint,maxEndpointMoveMm:params.maxEndpointMoveMm,actualMoveMm:candidate.distanceMm,beforeIssueCount:before.issues.length,afterIssueCount:after.issues.length,loopCount:output.loops.length}};
}
