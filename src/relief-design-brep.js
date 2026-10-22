// Read-only planner: retained numerical fit + trusted planar support summary ->
// one existing `relief` feature (OCCT B-spline control grid, masked, fused/cut
// on the real host face). It never runs preview/apply, never re-fits, never
// picks a face, invents a datum or converts a mesh. Missing inputs => blocked.
import {validateReliefDesign} from './relief-design-drafts.js';
import {prepareReliefDesignFit} from './relief-design-fit.js';
import {contractHash} from './contracts/operation-schema.js';
import {validateMachiningIntent} from './machining-intent.js';
import {LIMITS} from './limits.js';
import {RELIEF_DESIGN_BINDING_VERSION,RELIEF_DESIGN_MASK_GENERATOR,RELIEF_DESIGN_MASK_OPTIONS,encodeU8,sha,controlsSha256,regionsSha256,regionsFromActiveMask,placementToReliefOffsets,reliefDesignComplexity} from './modeling/manufacturing/relief-design-binding.js';

const stale=message=>{throw Object.assign(new Error(message),{code:'RELIEF_DESIGN_STALE'});};
const finiteVec=(v,n=3)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const MESSAGES={
 RELIEF_DESIGN_UNFITTED:'请先对当前设计完成数值拟合',
 RELIEF_DESIGN_TARGET_REQUIRED:'请在当前模型中明确选择一个实体上的平面作为支撑面',
 RELIEF_DESIGN_SUPPORT_MISMATCH:'可信读取的支撑面与所选目标不一致，请重新选择',
 RELIEF_DESIGN_SUPPORT_INVALID:'支撑面必须是单个有效实体上的真实平面',
 RELIEF_OUTSIDE_FACE:'图案保留域与选面上的真实圆孔/圆形边界相交：图案会覆盖孔或超出选面。请用“对齐到圆孔/圆边中心”或移动图案中心',
 RELIEF_DESIGN_SOURCE_CHANGED:'来源实体已变化，请重新选择支撑面',
 RELIEF_DESIGN_PLACEMENT_REQUIRED:'请明确给出图案中心（世界坐标，位于支撑平面上）和图案X方向',
 RELIEF_DESIGN_PLACEMENT_INVALID:'图案中心必须位于支撑平面上，X方向必须是该平面内的单位切向',
 RELIEF_DESIGN_DATUM_REQUIRED:'请明确声明支撑面代表设计基线（authoredBaselineOnSelectedFace），且基线与拟合基线一致',
 RELIEF_DESIGN_INTENT_REQUIRED:'请明确给出加工意图：continuousRelief + authoredHeightMap，且不能填写 targetPeakMm',
 RELIEF_DESIGN_NO_CHANGE:'拟合控制增量全为零，没有材料变化',
 RELIEF_DESIGN_CAPACITY:'拟合控制增量或控制网格超出浮雕容量（≤20mm，≤65×65）',
 RELIEF_DESIGN_MASK_BLOCKED:'拟合保留域无法转换为浮雕轮廓',
 RELIEF_DESIGN_NATIVE_REQUIRED:'该拟合浮雕复杂度需要尚未开放的 Native 平面 B 样条语义；不在本地降级执行',
};
export const reliefDesignBrepMessages=MESSAGES;

export function prepareReliefDesignRelief({fit,solved,entry,expectedDraftRevision,support,target,placement,datum,machiningIntent}={}){
 const blockers=[],block=(code,detail)=>blockers.push({code,message:MESSAGES[code]+(detail?'：'+detail:'')}),done=extra=>({status:'blocked',blockers,geometryReady:false,brepComputed:false,commitState:'notCommitted',...extra});
 if(!fit||fit.status!=='fitted'||fit.fit?.kind!=='webcad-masked-baseline-bspline-v1'){block('RELIEF_DESIGN_UNFITTED');return done();}
 // Stale-result rejection: the retained fit must belong to the current draft revision and content.
 if(!entry||entry.id!==fit.designId)stale('设计草稿已不存在或已切换，请重新拟合');
 if(!Number.isInteger(expectedDraftRevision)||entry.revision!==expectedDraftRevision||fit.draftRevision!==entry.revision||fit.sourceBinding?.draftRevision!==entry.revision)stale('设计草稿已修改，拟合结果失效；请重新求解并拟合');
 if(contractHash(validateReliefDesign(entry.draft))!==fit.source?.draftFingerprint)stale('设计草稿内容与拟合来源不一致，请重新求解并拟合');
 // The solved field must be the exact one the fit consumed (re-derived, never re-fitted).
 let refit;try{refit=prepareReliefDesignFit(entry.draft,solved,fit.options);}catch(error){stale('求解场已变化，请重新求解并拟合：'+error.message);}
 if(refit.source.fieldFingerprint!==fit.source.fieldFingerprint||refit.source.optionsFingerprint!==fit.source.optionsFingerprint)stale('求解场或拟合选项已变化，拟合结果失效');
 const F=fit.fit,cols=F.columns,rows=F.rows,deltas=F.controlDeltasMm,locked=F.lockedControlMask;
 if(!Array.isArray(deltas)||deltas.length!==cols*rows||!Array.isArray(locked)||locked.length!==cols*rows||!deltas.every(Number.isFinite))stale('拟合控制数据不完整，请重新拟合');
 // Target: only the user's current selection, read by the trusted kernel.
 if(!target||typeof target.bodyId!=='string'||!Number.isInteger(target.faceId))block('RELIEF_DESIGN_TARGET_REQUIRED');
 else if(!support||support.bodyId!==target.bodyId||support.faceId!==target.faceId)block('RELIEF_DESIGN_SUPPORT_MISMATCH');
 else{
  if(!support.planar||support.solidCount!==1||!finiteVec(support.centerMm)||!finiteVec(support.normal)||!/^[a-f0-9]{64}$/.test(support.sourceSha256??''))block('RELIEF_DESIGN_SUPPORT_INVALID');
  if(target.expectedSourceSha256!==undefined&&target.expectedSourceSha256!==support.sourceSha256)block('RELIEF_DESIGN_SOURCE_CHANGED');
 }
 if(!placement||!finiteVec(placement.originMm)||!finiteVec(placement.xDirection))block('RELIEF_DESIGN_PLACEMENT_REQUIRED');
 else if(support?.planar&&finiteVec(support.normal)&&(Math.abs(dot(placement.originMm.map((v,i)=>v-support.centerMm[i]),support.normal))>1e-6||Math.abs(Math.hypot(...placement.xDirection)-1)>1e-9||Math.abs(dot(placement.xDirection,support.normal))>1e-9))block('RELIEF_DESIGN_PLACEMENT_INVALID');
 if(!datum||datum.kind!=='authoredBaselineOnSelectedFace'||datum.baselineMm!==F.baselineMm||fit.source?.baselineMm!==F.baselineMm)block('RELIEF_DESIGN_DATUM_REQUIRED',`拟合基线 ${F.baselineMm} mm`);
 let intent=null;
 try{intent=machiningIntent===undefined?null:validateMachiningIntent(machiningIntent);}catch(error){block('RELIEF_DESIGN_INTENT_REQUIRED',error.message);}
 if(!intent||intent.requestedGeometry!=='continuousRelief'||intent.sourceInterpretation!=='authoredHeightMap'||intent.targetPeakMm!==undefined||intent.direction&&intent.direction!==F.mode){if(!blockers.some(b=>b.code==='RELIEF_DESIGN_INTENT_REQUIRED'))block('RELIEF_DESIGN_INTENT_REQUIRED');}
 const D=Math.max(...deltas.map(Math.abs));
 if(!(D>0))block('RELIEF_DESIGN_NO_CHANGE');
 if(D>20||cols>LIMITS.relief.maxSamples||rows>LIMITS.relief.maxSamples)block('RELIEF_DESIGN_CAPACITY');
 if(blockers.length)return done();
 // Exact parameter translation (same basis/knots/XY poles as relief.js; row0=-Y).
 const depthMm=Math.max(.01,D),values=Array.from({length:rows},(_,j)=>Array.from({length:cols},(_,i)=>Math.abs(deltas[j*cols+i])/depthMm));
 const active=Uint8Array.from(F.sourceMasks.active),fixed=Uint8Array.from(F.sourceMasks.fixedMask),lockedU8=Uint8Array.from(locked);
 const grid={columns:refit.input.field.columns,rows:refit.input.field.rows,widthMm:refit.input.field.widthMm,heightMm:refit.input.field.heightMm};
 if(refit.input.field.active.some((v,k)=>v!==active[k])||refit.input.field.fixedMask.some((v,k)=>v!==fixed[k]))stale('拟合掩码与当前求解场不一致，请重新拟合');
 if(grid.columns*grid.rows!==active.length||grid.widthMm!==F.widthMm||grid.heightMm!==F.heightMm)stale('拟合掩码与求解场网格不一致，请重新拟合');
 let mask;
 try{mask=regionsFromActiveMask(grid,active);}catch(error){block('RELIEF_DESIGN_MASK_BLOCKED',error.message);return done();}
 if(mask.vertexCount>64000||mask.holeCount>1024){block('RELIEF_DESIGN_MASK_BLOCKED',`轮廓点 ${mask.vertexCount}`);return done();}
 const offsets=placementToReliefOffsets(support.centerMm,support.normal,placement.originMm,placement.xDirection);
 const params={faceId:target.faceId,widthMm:F.widthMm,heightMm:F.heightMm,depthMm,mode:F.mode,values,regions:mask.regions,...RELIEF_DESIGN_MASK_OPTIONS,...offsets,machiningIntent:intent,
  designBinding:{version:RELIEF_DESIGN_BINDING_VERSION,kind:'reliefDesignFit',datum:{kind:datum.kind,baselineMm:datum.baselineMm},
   support:{sourceSha256:support.sourceSha256,faceId:support.faceId,centerMm:[...support.centerMm],normal:[...support.normal]},
   placement:{originMm:[...placement.originMm],xDirection:[...placement.xDirection]},
   field:{columns:grid.columns,rows:grid.rows,widthMm:grid.widthMm,heightMm:grid.heightMm,active:encodeU8(active),fixedMask:encodeU8(fixed),activeSha256:sha(active),fixedMaskSha256:sha(fixed)},
   controls:{columns:cols,rows,mode:F.mode,locked:encodeU8(lockedU8),lockedSha256:sha(lockedU8),controlsSha256:controlsSha256(values,depthMm,F.mode),maxDeltaMm:D},
   mask:{generator:RELIEF_DESIGN_MASK_GENERATOR,regionsSha256:regionsSha256(mask.regions)},
   audit:{deviationPolicy:fit.options.deviationPolicy??'strict',designId:fit.designId,draftRevision:fit.draftRevision,draftFingerprint:fit.source.draftFingerprint,fieldFingerprint:fit.source.fieldFingerprint,optionsFingerprint:fit.source.optionsFingerprint,
    ...(F.report.provisional?{servicesFirstFit:{acceptanceToleranceMm:F.report.acceptanceToleranceMm}}:{}),
    metrics:{trainingMaxMm:F.report.metrics.training.maxMm,independentMaxMm:F.report.metrics.independent.maxMm,protectionMaxMm:F.report.metrics.protection.maxMm,deviationKind:'sampled-not-global'}}}};
 // Locked (protected) controls must be exactly zero after translation.
 for(let k=0;k<locked.length;k++)if(locked[k]&&values[Math.floor(k/cols)][k%cols]!==0)stale('受保护控制点不为零，拟合数据不可信');
 // Cheap pre-check at 准备 (exact check still runs at preview): sample every real circular edge of
 // the selected face; a sample inside the retained relief domain means the relief would cover a
 // hole or cross the face boundary.
 const cross=circularEdgeConflict(support,placement,mask.regions,F.widthMm,F.heightMm);
 if(cross){block('RELIEF_OUTSIDE_FACE',`边 ${cross.edgeIndex}（R${+cross.radiusMm.toFixed(3)}，中心 [${cross.centerMm.map(v=>+v.toFixed(3)).join(', ')}]）距图案中心 ${+cross.distanceMm.toFixed(3)} mm`);return done();}
 const complexity=reliefDesignComplexity(params);
 // Services-first nets are computed on Services (never locally), so local complexity does not gate them.
 if(complexity.complex&&!F.report?.provisional){block('RELIEF_DESIGN_NATIVE_REQUIRED',complexity.reasons.join(','));return done({complexity:{reasons:complexity.reasons}});}
 return {status:'prepared',blockers:[],geometryReady:false,brepComputed:false,commitState:'notCommitted',
  fingerprints:{sourceSha256:support.sourceSha256,draftFingerprint:fit.source.draftFingerprint,fieldFingerprint:fit.source.fieldFingerprint,optionsFingerprint:fit.source.optionsFingerprint,controlsSha256:params.designBinding.controls.controlsSha256,regionsSha256:params.designBinding.mask.regionsSha256},
  maskReport:{...mask.report,simplifiedVertexCount:mask.vertexCount,boundary:'retained-grid-cell-boundary-not-new-exact-circle'},
  previewArgs:{op:'relief',refs:[target.bodyId],params},
  next:'preview.start(previewArgs) -> preview.commit; no automatic preview/apply'};
}

function pointInRegions(regions,x,y){let inside=false;for(const r of regions)for(const loop of [r.outer,...(r.holes??[])])for(let i=0,j=loop.length-1;i<loop.length;j=i++){const [xi,yi]=loop[i],[xj,yj]=loop[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
export function circularEdgeConflict(support,placement,regions,widthMm,heightMm,samples=96,toleranceMm=.05){
 const n=support?.normal,X=placement?.xDirection,o=placement?.originMm;if(!finiteVec(n)||!finiteVec(X)||!finiteVec(o))return null;
 const Y=[n[1]*X[2]-n[2]*X[1],n[2]*X[0]-n[0]*X[2],n[0]*X[1]-n[1]*X[0]];
 for(const e of support.circularEdges??[]){if(!finiteVec(e.centerMm)||!(e.radiusMm>0))continue;
  const d=e.centerMm.map((v,i)=>v-o[i]),cx=dot(d,X),cy=dot(d,Y);
  for(let k=0;k<samples;k++){const t=2*Math.PI*k/samples,x=cx+e.radiusMm*Math.cos(t),y=cy+e.radiusMm*Math.sin(t);
   if([[0,0],[toleranceMm,0],[-toleranceMm,0],[0,toleranceMm],[0,-toleranceMm]].every(([a,b])=>pointInRegions(regions,(x+a)/widthMm,(y+b)/heightMm)))return {edgeIndex:e.edgeIndex,radiusMm:e.radiusMm,centerMm:e.centerMm,distanceMm:Math.hypot(cx,cy)};}}
 return null;
}
