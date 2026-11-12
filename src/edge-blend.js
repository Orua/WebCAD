import * as cad from 'replicad';
import {topologyDetails} from './modeling/rounding/topology.js';
import {millComplementaryFillet,millFeasibility} from './modeling/rounding/mill-fillet-fallback.js';
import {validateRoundingResult,verifyBlendAcceptance} from './modeling/rounding/validation.js';
import {tryUpgradeSmallerBlends,smallerBlendRadii} from './modeling/rounding/upgrade-existing-blends.js';
import {tryTubeKnuckleRebuild} from './modeling/rounding/tube-knuckle-fillet.js';
import {buildBlendRadius} from './blend-radius.js';

const dispose=value=>{try{value?.delete();}catch{}};
const fail=message=>{throw Object.assign(new Error(message),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS'});};
const near=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))<1e-5;
const shareVertex=(a,b)=>[a.startPoint,a.endPoint].some(p=>[b.startPoint,b.endPoint].some(q=>near(p,q)));
export const blendScopeOf=params=>params.allEdges?'body':params.edgeIds?.length&&params.faceIds?.length?'mixed':params.faceIds?(params.sharedFaces?'shared-faces':'face-boundaries'):'edges';
const requestedSelectionOf=params=>({...(params.edgeIds?{edgeIds:[...params.edgeIds]}:{}),...(params.faceIds?{faceIds:[...params.faceIds]}:{}),...(params.sharedFaces?{sharedFaces:true}:{}),...(params.allEdges?{allEdges:true}:{})});

// One native OCCT MakeFillet build. Throws with failedIndexes (into list) when
// OCCT reports faulty contours. radiusOf(i) allows corner-closure radii.
function nativeFillet(shape,list,radiusOf,oc){
  let builder,progress,result;
  try{
    builder=new oc.BRepFilletAPI_MakeFillet(shape.wrapped,oc.ChFi3d_FilletShape.ChFi3d_Rational);
    list.forEach((edge,i)=>builder.Add(radiusOf(i),edge.wrapped));
    progress=new oc.Message_ProgressRange();
    try{builder.Build(progress);}catch(error){let m=error?.message;if(!m)try{m=oc.getExceptionMessage(error);}catch{}throw new Error(m||'内核未完成过渡面连接');}
    let faulty=0;try{faulty=builder.NbFaultyContours();}catch{faulty=0;}
    if(!builder.IsDone()||faulty>0){
      const failedIndexes=[];
      try{const bad=new Set(Array.from({length:builder.NbFaultyContours()},(_,i)=>builder.FaultyContour(i+1)));list.forEach((edge,i)=>{if(bad.has(builder.Contour(edge.wrapped)))failedIndexes.push(i);});}catch{}
      throw Object.assign(new Error(faulty>0?`内核报告 ${faulty} 条失败过渡轮廓`:'内核未完成过渡面连接'),{failedIndexes});
    }
    result=cad.cast(builder.Shape());
    const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    try{if(!check.IsValid())throw new Error('过渡面自交或实体无效');}finally{dispose(check);}
    const out=result;result=null;return out;
  }finally{dispose(result);dispose(progress);dispose(builder);}
}

// Every fillet strategy ends here: valid single solid + measured material
// change (validateRoundingResult) + R9 acceptance (requested edges no longer
// sharp, whole body leaves no sharp edge, plausible face count and volume).
function acceptFillet(source,result,oc,targetIds,scope){
  const base=validateRoundingResult(source,result,oc);
  return verifyBlendAcceptance(source,result,oc,{targetEdgeIds:targetIds,scope,base});
}

// Edges of `current` that still lie on the original source edges `rows`.
function remapSharpEdges(current,sourceEdges,rows){
  const after=topologyDetails(current),ids=[];
  for(const row of after){
    if(!row.sharp||!row.midpoint)continue;
    for(const old of rows){
      if(row.midpoint.some((v,i)=>v<old.bounds[0][i]-1e-5||v>old.bounds[1][i]+1e-5))continue;
      const vertex=cad.makeVertex(row.midpoint);
      try{if(cad.measureDistanceBetween(vertex,sourceEdges[old.edgeId])<=1e-5){ids.push(row.edgeId);break;}}finally{dispose(vertex);}
    }
  }
  return ids;
}

// Convex/concave classification only orders retry groups; acceptance decides.
function edgeConvexity(faces,row){
  try{
    const [a,b]=row.adjacentFaceIds.map(id=>faces[id]),n=a.normalAt(row.midpoint),c=b.center;
    try{const nn=n.toTuple(),cc=c.toTuple();const d=nn.reduce((s,v,i)=>s+v*(cc[i]-row.midpoint[i]),0);return Math.abs(d)<1e-9?'unknown':d<0?'convex':'concave';}
    finally{dispose(n);dispose(c);}
  }catch{return 'unknown';}
}
function retryGroups(faces,targets){
  const kinds=new Map(targets.map(row=>[row.edgeId,edgeConvexity(faces,row)])),groups=[],seen=new Set();
  for(const row of targets){
    if(seen.has(row.edgeId))continue;
    const kind=kinds.get(row.edgeId),group=[],queue=[row];seen.add(row.edgeId);
    while(queue.length){const cur=queue.pop();group.push(cur);for(const other of targets)if(!seen.has(other.edgeId)&&kinds.get(other.edgeId)===kind&&shareVertex(cur,other)){seen.add(other.edgeId);queue.push(other);}}
    groups.push({kind,rows:group});
  }
  const rank={concave:0,unknown:1,convex:2};
  return groups.sort((a,b)=>rank[a.kind]-rank[b.kind]||b.rows.length-a.rows.length);
}

// R9-P2: largest radius (0.01 mm grid, every reported value actually built and
// accepted) up to the requested one. Feasibility is not globally monotone; the
// value is a verified sample-search result, never applied unless opted in.
export function searchMaxFeasibleRadius(shape,targets,edges,amount,scope,oc,geometricLimit,budgetMs=4000){
  const started=performance.now(),attempts=[];let best=null,bestShape=null,failedAbove=amount;
  const grid=v=>Math.floor(v*100+1e-9)/100;
  const tryRadius=radius=>{
    if(!(radius>=.01)||performance.now()-started>budgetMs)return false;
    let result;
    try{result=nativeFillet(shape,targets.map(row=>edges[row.edgeId]),()=>radius,oc);acceptFillet(shape,result,oc,targets.map(row=>row.edgeId),scope);attempts.push({radiusMm:radius,ok:true});
      if(best===null||radius>best){dispose(bestShape);best=radius;bestShape=result;result=null;}return true;}
    catch(error){attempts.push({radiusMm:radius,ok:false,message:String(error?.message||error).slice(0,120)});return false;}
    finally{dispose(result);}
  };
  if(targets.length>64)return {maxFeasibleRadiusMm:null,attempts,skipped:'too-many-edges',shape:null};
  const hi=Number.isFinite(geometricLimit)&&geometricLimit>0?Math.min(amount,geometricLimit):amount;
  const ladder=[...new Set([grid(hi*.999),...Array.from({length:11},(_,k)=>grid(hi*(11-k)/12))])].filter(v=>v>0&&v<amount);
  for(const radius of ladder){if(tryRadius(radius))break;failedAbove=radius;}
  if(best!==null){let lo=best,up=failedAbove;for(let i=0;i<6&&up-lo>.011;i++){const mid=grid((lo+up)/2);if(mid<=lo)break;if(tryRadius(mid))lo=mid;else up=mid;}}
  return {maxFeasibleRadiusMm:best,attempts,shape:bestShape,elapsedMs:performance.now()-started,method:'descending-ladder-then-bisection-0.01mm-grid; every value built and accepted'};
}

// Resolve only real sharp BRep edges. Periodic seams and tangent boundaries
// belong to the surface representation, not to the machining selection.
// R9-P1 unified semantics: edges → those edges; one face → its whole boundary
// (planar or curved); several faces with sharedFaces → their common edges;
// allEdges (body) → every sharp edge; edges + faces → union.
export function blendTargets(shape,{edgeIds,faceIds,allEdges=false,sharedFaces=false}) {
  const rows=topologyDetails(shape),faces=shape.faces;
  try {
    if(!allEdges&&!edgeIds?.length&&!faceIds?.length)fail('请选择当前实体的有效边或面');
    if(!allEdges&&edgeIds?.some(i=>!Number.isInteger(i)||i<0||i>=rows.length))fail('请选择当前实体的有效边或面');
    if(!allEdges&&faceIds?.some(i=>!Number.isInteger(i)||i<0||i>=faces.length))fail('请选择当前实体的有效边或面');
    if(sharedFaces&&(!faceIds||faceIds.length<2))fail('公共边倒角需要至少两个相邻面');
  }finally{faces.forEach(dispose);}
  const chosenEdges=new Set(edgeIds||[]),chosenFaces=new Set(faceIds||[]);
  const candidates=rows.filter(row=>allEdges||chosenEdges.has(row.edgeId)||faceIds?.length&&(sharedFaces
    ?row.adjacentFaceIds.length===2&&row.adjacentFaceIds.every(id=>chosenFaces.has(id))
    :row.adjacentFaceIds.some(id=>chosenFaces.has(id))));
  if(!candidates.length)fail('所选面没有公共边；请选择同一实体上互相接触的面');
  const unknown=candidates.filter(row=>row.sharp===null);
  // I-05: whole-body / face-boundary scopes skip one-sided or unmeasurable seams
  // (periodic or degenerate contact) and continue with the valid sharp edges.
  // An explicit edgeIds list that includes such an edge still fails.
  const skipUnknown=allEdges||(!!faceIds?.length&&!edgeIds?.length);
  if(unknown.length&&!skipUnknown)fail(`边 ${unknown.map(row=>row.edgeId).join(', ')} 无法取得两侧有效面法向，请检查开口或无效曲面`);
  const skippedOneSided=skipUnknown?unknown.map(row=>row.edgeId):[];
  const targets=candidates.filter(row=>row.sharp);
  // R9-P0: nothing sharp is not a failure. NO_CHANGE commits nothing and keeps the model.
  if(!targets.length){
    if(skippedOneSided.length)fail(`没有可处理的锐边；边 ${skippedOneSided.join(', ')} 无法取得两侧有效面法向（单侧、周期缝或退化接触），已跳过。请先检查并集是否留下未融合接触边`);
    throw Object.assign(new Error('所选范围没有锐边，无需修改：相切边、周期接缝及退化边不需要圆角，原模型保持不变。'),{code:'NO_CHANGE',recoveryAction:'NONE',report:{version:1,status:'no_change',stage:'selection',processedEdgeIds:[],failedEdgeIds:[],remainingSharpEdgeIds:[],skippedTangentEdgeIds:candidates.map(row=>row.edgeId),skippedOneSidedEdgeIds:skippedOneSided}});
  }
  return {targets,rows,skipped:candidates.filter(row=>row.sharp===false).map(row=>row.edgeId),skippedOneSided};
}

export function buildEdgeBlend(shape,op,params,{suggestRadius=false,allowOversizedMill=true}={}) {
  // OCCT Boolean/fillet builders may update flags or pcurves of their operands.
  // Work on an owned BRep so the committed source remains available for undo.
  const source=cad.deserializeShape(shape.serialize()).asShape3D();
  try{return op==='fillet'?buildOwnedFillet(source,params,{suggestRadius,allowOversizedMill}):buildOwnedChamfer(source,params);}finally{dispose(source);}
}

function assertSingleSolid(shape){
  const solids=shape.solids;
  try{if(solids.length!==1)throw Object.assign(new Error(`圆角需要单一实体；当前仍为 ${solids.length} 个实体，尚未融合。请先合并为单一实体。`),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS'});}
  finally{solids.forEach(dispose);}
}

function buildOwnedFillet(shape,params,{suggestRadius=false,allowOversizedMill=true,skipUpgrade=false}={}) {
  const started=performance.now(),scope=blendScopeOf(params),requestedSelection=requestedSelectionOf(params),amount=params.radius;
  let work=shape,upgrade=null;
  if(params.allEdges&&!skipUpgrade){
    try{upgrade=tryUpgradeSmallerBlends(shape,amount);}catch{upgrade=null;}
    if(upgrade?.shape)work=upgrade.shape;
  }
  const retryOriginal=()=>buildOwnedFillet(shape,params,{suggestRadius,allowOversizedMill,skipUpgrade:true});
  let selected;
  try{assertSingleSolid(work);selected=blendTargets(work,params);}catch(error){
    if(work!==shape)return retryOriginal();
    const leftover=error.code==='NO_CHANGE'&&params.allEdges?smallerBlendRadii(shape,amount):[];
    if(leftover.length){
      error.message=`所选范围没有锐边；实体上仍有较小半径（约 R${Math.min(...leftover).toFixed(3)}）的既有圆角，但无法安全恢复并按 R${amount} 升级，原模型保持不变。`;
    }
    error.report={version:1,operation:'fillet',stage:'selection',strategy:'native',attemptCount:0,elapsedMs:performance.now()-started,cause:error.code==='NO_CHANGE'?'no-sharp-edges':'selection-rejected',targetCount:0,scope,requestedSelection,...(leftover.length?{leftoverSmallerBlendRadiusMm:Math.min(...leftover),upgradeInfeasible:true}:{}),...(error.report||{})};throw error;}
  const oc=cad.getOC(),{targets,rows,skipped,skippedOneSided=[]}=selected,targetIds=targets.map(row=>row.edgeId);
  const edges=work.edges,faces=work.faces,attempts=[];
  const attempt=(strategy,fn)=>{
    const t0=performance.now();
    try{const out=fn();attempts.push({strategy,ok:true,elapsedMs:performance.now()-t0});if(out?.blendReport){out.blendReport.attemptCount=attempts.length;out.blendReport.elapsedMs=performance.now()-started;}return out;}
    catch(error){attempts.push({strategy,ok:false,elapsedMs:performance.now()-t0,message:String(error?.message||error).slice(0,200),...(error?.acceptance?{acceptance:error.acceptance}:{}),...(error?.failedIndexes?{failedIndexes:error.failedIndexes}:{})});lastError=error;return null;}
  };
  let lastError=null;
  const report=(result,strategy,acceptance,extra={})=>{
    const leftoverSmaller=scope==='body'?smallerBlendRadii(result,amount):[];
    const leftoverWarning=leftoverSmaller.length?`结果中仍有 ${leftoverSmaller.length} 处半径约 R${Math.min(...leftoverSmaller).toFixed(3)} 的既有圆角未升级到 R${amount}。`:null;
    const warning=leftoverWarning||acceptance.warning||(skippedOneSided.length?`已跳过无法取得两侧法向的边 ${skippedOneSided.join(', ')}，并对其余 ${targetIds.length} 条锐边做圆角。`:null);
    return {version:1,operation:'fillet',status:'committed',stage:'completed',strategy,attemptCount:attempts.length,attempts,elapsedMs:performance.now()-started,dimensionKind:'radius',requestedAmountMm:amount,amount:extra.actualRadiusMm??amount,scope,requestedSelection,
    processedEdgeIds:targetIds,failedEdgeIds:[],remainingSharpEdgeIds:acceptance.remainingSharpEdgeIds,remainingSharpEdgeCount:acceptance.remainingSharpEdgeCount,
    radiusPerEdge:[...targetIds.map(edgeId=>({edgeId,radiusMm:extra.actualRadiusMm??amount})),...(extra.expanded||[]).map(edgeId=>({edgeId,radiusMm:(extra.actualRadiusMm??amount)*.5,expanded:true}))],
    skippedTangentEdgeIds:skipped,skippedOneSidedEdgeIds:skippedOneSided,expandedEdgeIds:extra.expanded||[],maxFeasibleRadiusMm:extra.maxFeasibleRadiusMm??null,acceptance:{solid:acceptance.solid,selectedEdgesRounded:acceptance.selectedEdgesRounded,resultFaceCount:acceptance.resultFaceCount,deltaVolumeMm3:acceptance.deltaVolumeMm3,...(warning?{warning}:{}),...(acceptance.priorBlendKept||leftoverSmaller.length?{priorBlendKept:true}:{}),...(leftoverSmaller.length?{leftoverSmallerBlendCount:leftoverSmaller.length,leftoverSmallerRadiusMm:Math.min(...leftoverSmaller)}:{})},...(warning?{warning}:{}),...(upgrade?.report?{priorBlendUpgrade:upgrade.report,upgradedPriorBlends:true}:{}),...(leftoverSmaller.length?{leftoverSmallerBlendCount:leftoverSmaller.length,leftoverSmallerRadiusMm:Math.min(...leftoverSmaller)}:{}),...extra.more};
  };
  try{
    // Kinked chains: OCCT can report success with poor joins; prefer the mill
    // cutter when the global feasibility gate allows it (straight planar edges,
    // no real corner, opposite fillets fit).
    const kinkedIds=new Set(rows.filter(row=>row.normalAngleDeg>.05&&row.normalAngleDeg<15&&targets.some(target=>shareVertex(row,target))).flatMap(row=>targets.filter(target=>shareVertex(row,target)).map(t=>t.edgeId)));
    const kinkedSelected=targets.filter(t=>kinkedIds.has(t.edgeId)).length;
    const allKinked=targets.length>=1&&kinkedSelected===targets.length;
    const mostlyKinked=targets.length>=2&&kinkedSelected>=Math.ceil(targets.length*0.5);
    const feasibility=millFeasibility(work,targetIds,amount);
    const millAllowed=feasibility.fits&&allowOversizedMill!==false;
    const mill=(label)=>{
      const out=millComplementaryFillet(work,{edgeIds:targetIds,radiusMm:amount});
      try{const acceptance=acceptFillet(work,out.shape,oc,targetIds,scope);
        out.shape.blendReport=report(out.shape,'mill-complementary-r-fallback',acceptance,{more:{millReports:out.reports,nativeFailure:label,kinkedEdgeIds:[...kinkedIds]}});return out.shape;}
      catch(error){dispose(out.shape);throw error;}
    };
    if(millAllowed&&(allKinked||mostlyKinked||params.preferMillFallback===true)){
      const label=allKinked?'prefer-mill-on-kinked-chain':mostlyKinked?'prefer-mill-on-mostly-kinked':'preferMillFallback';
      const out=attempt('mill-first',()=>mill(label));if(out)return out;
    }
    // ① native: the whole target set in one Build.
    const whole=attempt('native-whole-set',()=>{
      const result=nativeFillet(work,targets.map(row=>edges[row.edgeId]),()=>amount,oc);
      try{const acceptance=acceptFillet(work,result,oc,targetIds,scope);result.blendReport=report(result,'native',acceptance);return result;}
      catch(error){dispose(result);throw error;}
    });
    if(whole)return whole;
    const nativeError=lastError,failedIds=(nativeError?.failedIndexes||[]).map(i=>targetIds[i]);
    // Mill fallback is all-or-nothing: every target edge, never only the
    // contours OCCT reported as failed (that dropped the edges that had worked).
    if(millAllowed){const out=attempt('mill-complementary-all-targets',()=>mill(nativeError?.message||'native-failed'));if(out)return out;}
    // ② ordered groups: concave before convex, connected loops together.
    const groups=retryGroups(faces,targets);
    if(groups.length>1){
      const out=attempt('native-ordered-groups',()=>{
        let current=work;
        try{
          for(const group of groups){
            const ids=remapSharpEdges(current,edges,group.rows);
            if(!ids.length)continue;
            const currentEdges=current.edges;
            let next;try{next=nativeFillet(current,ids.map(id=>currentEdges[id]),()=>amount,oc);}finally{currentEdges.forEach(dispose);}
            if(current!==work)dispose(current);current=next;
          }
          if(current===work)fail('分组重试没有可处理的边');
          const acceptance=acceptFillet(work,current,oc,targetIds,scope);
          current.blendReport=report(current,'native-ordered-groups',acceptance,{more:{groups:groups.map(g=>({kind:g.kind,edgeIds:g.rows.map(r=>r.edgeId)}))}});
          const output=current;current=work;return output;
        }finally{if(current!==work)dispose(current);}
      });
      if(out)return out;
    }
    // ③ corner closure (explicit opt-in only; it touches unselected edges).
    if(params.cornerClosure===true&&scope!=='body'){
      const extra=rows.filter(row=>row.sharp&&!targetIds.includes(row.edgeId)&&targets.some(t=>shareVertex(row,t)));
      if(extra.length){
        const out=attempt('native-corner-closure',()=>{
          const list=[...targets,...extra].map(row=>edges[row.edgeId]);
          const result=nativeFillet(work,list,i=>i<targets.length?amount:amount*.5,oc);
          try{const acceptance=acceptFillet(work,result,oc,targetIds,scope);result.blendReport=report(result,'native-corner-closure',acceptance,{expanded:extra.map(r=>r.edgeId)});return result;}
          catch(error){dispose(result);throw error;}
        });
        if(out)return out;
      }
    }
    // ④ polyline circular-tube knuckles: rebuild miters as torus elbows, then fillet the caps.
    if(params.allEdges){
      const out=attempt('tube-spine-corner-rebuild',()=>{
        const rebuilt=tryTubeKnuckleRebuild(work,amount,{filletCaps:true});
        if(rebuilt?.failed){
          const d=rebuilt.diagnostic||{};
          const err=Object.assign(new Error(d.reason||'不是可重建的折线圆管，或折角半径放不下'),{tubeRebuild:d});
          throw err;
        }
        if(!rebuilt?.shape)fail('不是可重建的折线圆管，或折角半径放不下');
        let result=rebuilt.shape;
        try{
          const acceptance=acceptFillet(work,result,oc,targetIds,scope);
          result.blendReport=report(result,'tube-spine-corner-rebuild',acceptance,{more:{tubeRebuild:rebuilt.report,priorBlendUpgrade:upgrade?.report||null}});
          const output=result;result=null;return output;
        }catch(error){dispose(result);throw error;}
      });
      if(out)return out;
    }
    // ⑤ failure: compute a verified maximum radius as a suggestion.
    const doSearch=suggestRadius||params.radiusFallback==='maxFeasible';
    const search=doSearch?searchMaxFeasibleRadius(work,targets,edges,amount,scope,oc,feasibility.limitMm):null;
    let maxR=search?.maxFeasibleRadiusMm??null;
    let groupSearch=null;
    if(doSearch&&maxR===null&&targets.length>1){
      // I-04: whole-set construction can fail at every radius on curved supports.
      // Probe connected groups so the receipt can still name a feasible radius or the failing location.
      const groups=retryGroups(faces,targets);groupSearch=[];
      for(const group of groups){
        const sub=searchMaxFeasibleRadius(work,group.rows,edges,amount,'edges',oc,feasibility.limitMm,1500);
        groupSearch.push({kind:group.kind,edgeIds:group.rows.map(row=>row.edgeId),maxFeasibleRadiusMm:sub.maxFeasibleRadiusMm,attempts:sub.attempts});
        dispose(sub.shape);
      }
    }
    if(maxR!==null&&params.radiusFallback==='maxFeasible'&&search.shape){
      const result=search.shape;search.shape=null;
      const acceptance=acceptFillet(work,result,oc,targetIds,scope);
      result.blendReport=report(result,'native-max-feasible-radius',acceptance,{actualRadiusMm:maxR,maxFeasibleRadiusMm:maxR,more:{radiusReduced:true,radiusSearch:{attempts:search.attempts,method:search.method}}});
      return result;
    }
    dispose(search?.shape);
    const acceptanceFailure=attempts.map(a=>a.acceptance).filter(Boolean).pop()||null;
    const remaining=acceptanceFailure?.remainingSharpEdgeIds||[];
    const notRounded=acceptanceFailure?.notRoundedEdgeIds||[];
    const anyCurved=feasibility.reasons.some(r=>r.includes('curved'));
    const tubeReason=lastError?.tubeRebuild?.reason||null;
    const cause=tubeReason?'tube-spine-corner-rebuild':acceptanceFailure?'acceptance-rejected':(Number.isFinite(feasibility.limitMm)&&feasibility.limitMm<=amount)||maxR!==null?'radius-exceeds-local-space':feasibility.reasons.some(r=>r.includes('corner'))?'vertex-closure':anyCurved?'kernel-construction-curved-support':'kernel-construction';
    const causeText={'tube-spine-corner-rebuild':tubeReason,'acceptance-rejected':'结果没有通过圆角验收（选中边未全部变圆或整件仍留锐边）','radius-exceeds-local-space':'半径超过局部可用空间（相邻/对边圆角会互相吃掉）','vertex-closure':'圆角在顶点处无法收口','kernel-construction-curved-support':'曲面上的过渡面无法构造','kernel-construction':'内核无法构造过渡面'}[cause];
    const failedEdgeIds=failedIds.length?failedIds:notRounded.length?notRounded:targetIds;
    const groupHint=groupSearch?.length?groupSearch.filter(g=>g.maxFeasibleRadiusMm!=null).map(g=>`边 ${g.edgeIds.slice(0,8).join(', ')} 约 R${g.maxFeasibleRadiusMm}`):[];
    const suggestion=maxR!==null?`可用最大约 R${maxR} mm（已实际试算并通过验收，未应用；可改用该半径，或设置 radiusFallback:'maxFeasible'）。`:groupHint.length?`整组没有统一可行半径；分组试算可用最大：${groupHint.join('；')}。`:Number.isFinite(feasibility.limitMm)&&feasibility.limitMm<amount?`按几何估算半径上限约 R${Math.floor(feasibility.limitMm*100)/100} mm（未试算）。`:doSearch?'已按 0.01 mm 网格试算，未找到可通过验收的更小半径。':'';
    const continuity=[...kinkedIds].length?`相连边存在小折角：${rows.filter(r=>kinkedIds.has(r.edgeId)).slice(0,8).map(r=>r.edgeId).join(', ')}；视觉接近平滑不等于精确相切。`:'';
    const errorReport={version:1,operation:'fillet',status:'failed',stage:'construction',strategy:'ladder',attemptCount:attempts.length+(search?.attempts.length||0),attempts,elapsedMs:performance.now()-started,dimensionKind:'radius',requestedAmountMm:amount,scope,requestedSelection,targetCount:targets.length,
      processedEdgeIds:[],failedEdgeIds,remainingSharpEdgeIds:remaining,radiusPerEdge:[],skippedTangentEdgeIds:skipped,skippedOneSidedEdgeIds:skippedOneSided,groupRadiusSearch:groupSearch,
      confirmedFailureCount:failedIds.length,confirmedFailedEdgeIds:failedIds,candidateCount:failedIds.length?0:targets.length,candidateEdgeIds:failedIds.length?[]:targetIds,
      cause,failureReason:causeText,kernelMessage:nativeError?.message||null,millFeasibility:{fits:feasibility.fits,reasons:feasibility.reasons.slice(0,16),geometricLimitMm:feasibility.limitMm},
      maxFeasibleRadiusMm:maxR,radiusSearch:search?{attempts:search.attempts,method:search.method,elapsedMs:search.elapsedMs,skipped:search.skipped||null}:null,
      supportGeometry:targets.slice(0,32).map(row=>({edgeId:row.edgeId,faceIds:row.adjacentFaceIds,surfaceTypes:row.adjacentFaceIds.map(id=>faces[id].geomType)})),
      radiusProbe:{requested:doSearch,attemptCount:search?.attempts.length||0,applied:false,sampledRadiusMm:maxR},
      ...(lastError?.tubeRebuild?{tubeRebuild:lastError.tubeRebuild}:{})};
    const tubeHint=lastError?.tubeRebuild?`${lastError.tubeRebuild.maxFeasibleBendRadiusMm!=null?`最大可放弯半径 ${Number(lastError.tubeRebuild.maxFeasibleBendRadiusMm.toFixed(4))} mm，`:''}${lastError.tubeRebuild.neededBendRadiusMm!=null?`需要大于管半径的弯半径（请求 ${Number(lastError.tubeRebuild.neededBendRadiusMm.toFixed(3))} mm）。`:''}`:'';
    if(work!==shape&&!skipUpgrade)return retryOriginal();
    throw Object.assign(new Error(`圆角 R${amount} mm 无法完成（${causeText}），${failedIds.length?'失败边':'目标边'}：${failedEdgeIds.slice(0,24).join(', ')}${failedEdgeIds.length>24?' …':''}。${remaining.length?`结果仍有 ${remaining.length} 条锐边。`:''}${tubeHint}${suggestion}${continuity}原模型保留，没有提交部分结果。`),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS',report:errorReport,...(nativeError?.message?{millFallbackMessage:attempts.find(a=>a.strategy.startsWith('mill'))?.message}:{})});
  }finally{edges.forEach(dispose);faces.forEach(dispose);if(work!==shape)dispose(work);}
}

function buildOwnedChamfer(shape,params) {
  const started=performance.now(),op='chamfer';let selected;
  try{assertSingleSolid(shape);selected=blendTargets(shape,params);}catch(error){error.report={version:1,operation:op,stage:'selection',strategy:'native',attemptCount:0,elapsedMs:performance.now()-started,cause:error.code==='NO_CHANGE'?'no-sharp-edges':'selection-rejected',targetCount:0,...(error.report||{})};throw error;}
  const amount=params.distance;
  const {targets,skipped}=selected,oc=cad.getOC(),edges=shape.edges;
  const mode=params.mode||'equalDistance',faces=shape.faces,supportFaces=[];
  let builder,result,stage='construction';
  try {
    builder=new oc.BRepFilletAPI_MakeChamfer(shape.wrapped);
    for(const row of targets){
      if(mode==='equalDistance'){builder.Add(amount,edges[row.edgeId].wrapped);continue;}
      if(!['twoDistances','distanceAngle'].includes(mode))throw new Error('未知倒角方式');
      const adjacent=row.adjacentFaceIds;
      if(adjacent.length!==2)throw new Error('非对称倒角需要恰好两个相邻支撑面');
      let faceId=params.referenceFaceId??adjacent[0];
      if(!adjacent.includes(faceId))throw new Error(`支撑面 ${faceId} 不与边 ${row.edgeId} 相邻`);
      if(params.flipDirection)faceId=adjacent.find(id=>id!==faceId);
      supportFaces.push({edgeId:row.edgeId,referenceFaceId:faceId});
      if(mode==='twoDistances')builder.Add(amount,params.distance2,edges[row.edgeId].wrapped,faces[faceId].wrapped);
      else builder.AddDA(amount,params.angleDeg*Math.PI/180,edges[row.edgeId].wrapped,faces[faceId].wrapped);
    }
    // Check completion before asking for the solid. BadShape() is never a result.
    const progress=new oc.Message_ProgressRange();
    try{builder.Build(progress);}finally{dispose(progress);}
    if(!builder.IsDone())throw new Error('内核未完成过渡面连接');
    result=cad.cast(builder.Shape());
    stage='validation';
    const check=new oc.BRepCheck_Analyzer(result.wrapped,true,false,false);
    try{if(!check.IsValid())throw new Error('过渡面自交或实体无效');}finally{dispose(check);}
    result.blendReport={version:1,operation:op,status:'committed',stage:'completed',strategy:'native',attemptCount:1,elapsedMs:performance.now()-started,dimensionKind:'support-distance',requestedAmountMm:amount,amount,scope:blendScopeOf(params),
      processedEdgeIds:targets.map(row=>row.edgeId),skippedTangentEdgeIds:skipped,
      mode,...(mode!=='equalDistance'?{supportFaces,flipDirection:params.flipDirection===true,...(mode==='twoDistances'?{distance2:params.distance2}:{angleDeg:params.angleDeg})}:{})};
    validateRoundingResult(shape,result,oc);
    const output=result;result=null;return output;
  }catch(error){
    let detail=error?.message;
    if(!detail)try{detail=oc.getExceptionMessage(error);}catch{}
    const ids=targets.map(row=>row.edgeId);
    const report={version:1,operation:op,status:'failed',stage,strategy:'native',attemptCount:1,elapsedMs:performance.now()-started,dimensionKind:'support-distance',requestedAmountMm:amount,targetCount:targets.length,confirmedFailureCount:0,confirmedFailedEdgeIds:[],candidateCount:targets.length,candidateEdgeIds:ids,failedEdgeIds:ids,cause:'unknown',kernelMessage:detail||null,supportGeometry:targets.map(row=>({edgeId:row.edgeId,faceIds:row.adjacentFaceIds,surfaceTypes:row.adjacentFaceIds.map(id=>faces[id].geomType)}))};
    throw Object.assign(new Error(`斜角 C${amount} mm 无法完成，目标边：${ids.join(', ')}。${detail||'内核未返回有效实体'}。原模型保留。`),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS',report});
  }finally{dispose(result);dispose(builder);edges.forEach(dispose);faces.forEach(dispose);}
}

// R9-P3: selector / variable-radius fillets used to bypass the receipt and the
// acceptance checks (RC9). They now run the same acceptance and write blendReport.
export function buildSelectorFillet(shape,{selector,radiusMm,blendLaw,context,scope='edges'}){
  const started=performance.now(),oc=cad.getOC();let result;
  try{
    result=buildBlendRadius(shape,{selector,radiusMm,blendLaw,context});
    const report=result.blendRadiusReport||{},targetIds=report.processedEdgeIds||[];
    const acceptance=acceptFillet(shape,result,oc,targetIds,scope);
    const radiusAt=blendLaw?{startRadiusMm:blendLaw.startRadiusMm,endRadiusMm:blendLaw.endRadiusMm}:{radiusMm};
    result.blendReport={version:1,operation:'fillet',status:'committed',stage:'completed',strategy:blendLaw?'native-variable-radius':'native-selector',attemptCount:1,attempts:[{strategy:blendLaw?'native-variable-radius':'native-selector',ok:true}],elapsedMs:performance.now()-started,dimensionKind:'radius',requestedAmountMm:radiusMm,amount:radiusMm,scope,requestedSelection:{selector},
      processedEdgeIds:targetIds,failedEdgeIds:[],remainingSharpEdgeIds:acceptance.remainingSharpEdgeIds,remainingSharpEdgeCount:acceptance.remainingSharpEdgeCount,radiusPerEdge:targetIds.map(edgeId=>({edgeId,...radiusAt})),skippedTangentEdgeIds:[],expandedEdgeIds:[],maxFeasibleRadiusMm:null,
      acceptance:{solid:acceptance.solid,selectedEdgesRounded:acceptance.selectedEdgesRounded,resultFaceCount:acceptance.resultFaceCount,deltaVolumeMm3:acceptance.deltaVolumeMm3}};
    const output=result;result=null;return output;
  }catch(error){
    if(!error.report)error.report={version:1,operation:'fillet',status:'failed',stage:'construction',strategy:blendLaw?'native-variable-radius':'native-selector',attemptCount:1,elapsedMs:performance.now()-started,scope,requestedSelection:{selector},processedEdgeIds:[],failedEdgeIds:error.acceptance?.notRoundedEdgeIds||[],remainingSharpEdgeIds:error.acceptance?.remainingSharpEdgeIds||[],failureReason:String(error?.message||error),maxFeasibleRadiusMm:null};
    if(!error.code)error.code='GEOMETRY_INVALID';
    throw error;
  }finally{dispose(result);}
}
