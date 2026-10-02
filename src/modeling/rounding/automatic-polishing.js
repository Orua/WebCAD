import * as cad from 'replicad';
import {polishingTopologyDetails} from './topology.js';
import {buildUnifiedRounding,resolveRoundingEdges} from './unified.js';
import {derivePolishingMaterialIntent,derivePolishingInfluenceBounds,measureAutomaticPolishingQuality} from './geometry-quality.js';
import {resolveClosedContactContours} from './closed-contour-scope.js';
import {buildClosedCurvedCut} from './closed-curved-cut.js';
import {resolvePolishingNativeNetwork,buildNativeNetworkPolishing} from './native-network-polishing.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=(code,message,report)=>{throw Object.assign(new Error(message),{code,report,recoveryAction:'CORRECT_PARAMETERS'});};
const length=bounds=>Math.hypot(...bounds[1].map((value,i)=>value-bounds[0][i]));

// This is an internal construction scale. The user supplies an edge and a
// strength, and does not request a particular circular surface radius.
export function deriveAutomaticPolishingScale({edgeLengthsMm,supportDiagonalsMm,bodyDimensionsMm,strength=1}) {
  if(!Number.isFinite(strength)||strength<=0||strength>1)fail('PARAM_SCHEMA_INVALID','打磨强度必须在 0 到 1 之间');
  const positive=values=>Array.isArray(values)&&values.length&&values.every(value=>Number.isFinite(value)&&value>0);
  if(!positive(edgeLengthsMm)||!positive(supportDiagonalsMm)||!positive(bodyDimensionsMm))
    fail('GEOMETRY_INVALID','来源边及支撑面的实际尺寸无法确定自动打磨范围');
  const edgeBudgetMm=Math.min(...edgeLengthsMm)*.12;
  const supportBudgetMm=Math.min(...supportDiagonalsMm)*.08;
  const thicknessBudgetMm=Math.min(...bodyDimensionsMm)*.1;
  const constructionScaleMm=Math.min(edgeBudgetMm,supportBudgetMm,thicknessBudgetMm)*strength;
  if(constructionScaleMm<=2e-5)fail('GEOMETRY_CONFLICT','当前强度的打磨范围低于本工具的几何精度',
    {constructionScaleMm,positionToleranceMm:1e-5});
  return {constructionScaleMm,strength,edgeBudgetMm,supportBudgetMm,thicknessBudgetMm,
    method:'source-edge-length-support-bounds-and-body-thickness'};
}

export function buildAutomaticPolishing(shape,params,legacySolve,{sourceBodyId=null}={}) {
  if(params.specVersion!==3||params.scope?.kind!=='edges'||!Array.isArray(params.scope.edgeIds)||!params.scope.edgeIds.length||
    new Set(params.scope.edgeIds).size!==params.scope.edgeIds.length)
    fail('PARAM_SCHEMA_INVALID','自动打磨需要当前实体的明确选边');
  const requested=[...params.scope.edgeIds],rows=polishingTopologyDetails(shape),edges=shape.edges,faces=shape.faces;
  let sourceBox,plan;
  try {
    if(requested.some(id=>!Number.isInteger(id)||id<0||!rows[id]))fail('STALE_REFERENCE','打磨选边已不在当前来源实体中');
    const unknown=requested.filter(id=>rows[id].sharp===null),smooth=requested.filter(id=>rows[id].sharp===false);
    if(unknown.length)fail('GEOMETRY_INVALID','选中边的真实邻面法向未能完整量测',{sourceEdgeIds:unknown,measurements:unknown.map(id=>({edgeId:id,errors:rows[id].normalMeasurementErrors}))});
    if(smooth.length)fail('AMBIGUOUS_SELECTION','请选择尚未圆润的锐边',{sourceEdgeIds:smooth});
    const supportIds=[...new Set(requested.flatMap(id=>rows[id].adjacentFaceIds))];
    sourceBox=shape.boundingBox;
    const bodyDimensionsMm=sourceBox.bounds[1].map((value,i)=>value-sourceBox.bounds[0][i]);
    const supportDiagonalsMm=supportIds.map(id=>{const box=faces[id].boundingBox;try{return length(box.bounds);}finally{dispose(box);}});
    plan=deriveAutomaticPolishingScale({edgeLengthsMm:requested.map(id=>edges[id].length),supportDiagonalsMm,bodyDimensionsMm,strength:params.strength??1});
  }finally{dispose(sourceBox);edges.forEach(dispose);faces.forEach(dispose);}
  const materialPlan=derivePolishingMaterialIntent(shape,{selectedSourceEdgeIds:requested,scaleMm:plan.constructionScaleMm},cad);
  const attempts=[],strategies=[];
  try {
    const scope=resolveRoundingEdges(shape,{sizeMm:plan.constructionScaleMm,scope:params.scope});
    strategies.push({kind:'automatic-native-or-planar-blend',sourceEdgeIds:scope.edgeIds,
      constructionContourEdgeIds:scope.edgeIds,construct(){
        const result=buildUnifiedRounding(shape,{specVersion:2,sizeMm:plan.constructionScaleMm,scope:params.scope},legacySolve);
        return {result,previous:result.roundingReport};
      }});
  }catch(error){attempts.push({strategy:'native-contour-planning',code:error.code,message:String(error.message),details:error.report??null});}
  try {
    const network=resolvePolishingNativeNetwork(shape,requested,rows,cad);
    strategies.push({kind:'automatic-native-network',sourceEdgeIds:network.sourceEdgeIds,
      constructionContourEdgeIds:network.sourceEdgeIds,dependencyNetwork:network,construct(){
        const candidate=buildNativeNetworkPolishing(shape,{network,constructionScaleMm:plan.constructionScaleMm},cad);
        return {result:candidate.shape,previous:{constructionKind:'automatic-native-blend',strategy:'native-complete-sharp-network',
          processedEdgeIds:candidate.actualEdgeIds,actualContourEdgeIds:candidate.contours,
          resultFaceSourceIds:candidate.resultFaceSourceIds,qualityEvidence:{generatedFaceIds:candidate.generatedFaceIds},
          newSurfaceCount:candidate.generatedFaceIds.length,nativeBuildCalls:candidate.nativeBuildCalls,
          effectiveSpec:{constructionScaleMm:plan.constructionScaleMm}}};
      }});
  }catch(error){attempts.push({strategy:'native-network-planning',code:error.code,message:String(error.message),details:error.report??null});}
  if(materialPlan.materialIntent==='remove') {
    try {
      const scope=resolveClosedContactContours(shape,requested,rows,cad);
      strategies.push({kind:'automatic-curved-cut',sourceEdgeIds:scope.sourceEdgeIds,
        constructionContourEdgeIds:scope.sourceEdgeIds,dependencyNetwork:scope,construct(){
          const candidate=buildClosedCurvedCut(shape,{edgeIds:scope.sourceEdgeIds,contours:scope.contours,initialHalfWidthMm:plan.constructionScaleMm},cad);
          return {result:candidate.shape,previous:{constructionKind:'automatic-curved-cut',strategy:'closed-native-contact-curved-cut',
            processedEdgeIds:candidate.actualEdgeIds,actualContourEdgeIds:scope.contours.map(contour=>contour.sourceEdgeIds),
            resultFaceSourceIds:candidate.resultFaceSourceIds,qualityEvidence:{generatedFaceIds:candidate.generatedFaceIds},
            newSurfaceCount:candidate.generatedFaceIds.length,cutterReports:candidate.cutterReports,cutBuildCalls:candidate.cutBuildCalls,
            effectiveSpec:{constructionScaleMm:candidate.constructionScaleMm}}};
        }});
    }catch(error){attempts.push({strategy:'closed-contact-planning',code:error.code,message:String(error.message),details:error.details??error.report??null});}
  }
  for(const strategy of strategies) {
    let result;
    const localityScope={declaredBeforeConstruction:true,sourceEdgeIds:[...strategy.sourceEdgeIds],marginMm:plan.constructionScaleMm*2};
    const influence=derivePolishingInfluenceBounds(rows,localityScope.sourceEdgeIds,localityScope.marginMm);
    const automaticPlan={...plan,localityScope,influence,materialPlan,
      constructionContourEdgeIds:[...strategy.constructionContourEdgeIds],dependencyNetwork:strategy.dependencyNetwork??null,strategy:strategy.kind};
    try {
    const candidate=strategy.construct();result=candidate.result;
    const previous=candidate.previous,processed=previous.processedEdgeIds||requested;
    if(processed.some(id=>!localityScope.sourceEdgeIds.includes(id)))fail('SCOPE_EXPANSION_REQUIRED','候选超出了事先声明的打磨边链',{processedEdgeIds:processed,localityScope});
    const checked=measureAutomaticPolishingQuality(shape,result,{
      selectedSourceEdgeIds:requested,sourceEdgeIds:localityScope.sourceEdgeIds,
      constructionContourEdgeIds:automaticPlan.constructionContourEdgeIds,
      generatedFaceIds:previous.qualityEvidence.generatedFaceIds,resultFaceSourceIds:previous.resultFaceSourceIds,
      materialIntent:materialPlan.materialIntent,localityScope
    },cad);
    const affectedFaceIds=[...new Set([
      ...processed.flatMap(id=>rows[id].adjacentFaceIds),
      ...(checked.evidence?.sourceTerminals||[]).flatMap(terminal=>terminal.capFaceIds)
    ])].sort((a,b)=>a-b);
    const effectSamples=checked.evidence.selectedEdgeEffects.flatMap(effect=>effect.samples);
    const effect={method:'source-selected-edge-stations-to-final-BRep-face-compound',
      selectedEdgeEffects:checked.evidence.selectedEdgeEffects,
      minimumDistanceMm:Math.min(...effectSamples.map(sample=>sample.distanceMm)),
      maximumDistanceMm:Math.max(...effectSamples.map(sample=>sample.distanceMm)),positionToleranceMm:1e-5};
    result.roundingReport={...previous,specVersion:3,mode:'polishing',solverVersion:3,
      constructionKind:['constant-radius','automatic-native-blend'].includes(previous.constructionKind)?'automatic-native-blend':'automatic-curved-cut',
      dimensionKind:'automatic-local-scale',requestedSpec:{scope:params.scope,strength:plan.strength},
      effectiveSpec:{...previous.effectiveSpec,strength:plan.strength,constructionScaleMm:plan.constructionScaleMm},
      automaticPlan,effect,qualityEvidence:checked.evidence,candidateAttempts:[...attempts],
      validation:{quality:checked.report,seams:checked.report.seams,endpoints:checked.report.endpoints,maxTangentAngleDeg:checked.report.maxContactAngleDeg},
      region:{sourceBodyId,requestedEdgeIds:requested,expandedEdgeIds:processed.filter(id=>!requested.includes(id)),affectedFaceIds},
      requestedSelection:requested,expandedSelection:processed.filter(id=>!requested.includes(id)),processedEdgeIds:processed,
      sizeSemantics:'Geometry derives the construction scale; no fixed numerical radius is requested.'};
    const accepted=result;result=null;return accepted;
    }catch(error){
      attempts.push({strategy:strategy.kind,code:error.code??'GEOMETRY_INVALID',message:String(error.message),details:error.details??error.report??null});
    }finally{dispose(result);}
  }
  fail('GEOMETRY_CONFLICT','选中边的打磨曲面尚未完成有效实体与接顺检查',{candidateAttempts:attempts,selectedSourceEdgeIds:requested,automaticScalePlan:plan});
}
