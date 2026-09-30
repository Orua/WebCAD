import * as cad from 'replicad';
import {buildUnifiedRounding} from './unified.js';
import {planConstantRounding} from './planner.js';
import {nativeConstantFillet} from './native-fillet.js';
import {controlledUnifiedNativeFillet} from './cleanup.js';
import {analyticConstantFillet} from './analytic-round.js';
import {buildWidthRounding} from './width-two-plane.js';
import {variableStraightPlanarFillet} from './variable-straight.js';
import {validateRoundingResult} from './validation.js';

export function buildRounding(shape,params,{strategy='auto'}={}){
  if(params.specVersion===2)return buildUnifiedRounding(shape,params,(source,legacy)=>buildRounding(source,legacy,{strategy}));
  if(params.specVersion!==1||!['constant','variable','width'].includes(params.mode))throw Object.assign(new Error('无效圆角／圆润模式'),{code:'PARAM_SCHEMA_INVALID'});
  if(!['selected-only','tangent-chain'].includes(params.propagation)||params.mode!=='constant'&&params.propagation!=='selected-only')throw Object.assign(new Error('此模式不支持相切链传播'),{code:'PARAM_SCHEMA_INVALID'});
  const plan=planConstantRounding(shape,params);
  function finish(output,candidateAttempts=[]){
    try{
      const validation=validateRoundingResult(shape,output.shape,cad.getOC());
    const requestedDimensions=params.mode==='width'?{widthAMm:params.widthAMm,widthBMm:params.widthBMm}:params.mode==='variable'?{laws:params.laws}:{radiusMm:params.radiusMm};
    const measuredFaces=output.generatedFaceMap||[];
    if(params.mode==='constant'&&output.generatedFaceMap&&(!measuredFaces.length||measuredFaces.some(row=>row.status!=='passed')))
      throw Object.assign(new Error('生成圆角面的实际半径尚未验证'),{code:'GEOMETRY_INVALID',recoveryAction:'CORRECT_PARAMETERS',report:{generatedFaceMap:measuredFaces}});
    const measuredRadius=measuredFaces.length&&measuredFaces.every(row=>row.status==='passed')?Math.max(...measuredFaces.map(row=>row.measuredRadiusMm)):null;
    const effectiveDimensions=params.mode==='width'?{widthAMm:output.width.actualWidthAMm,widthBMm:output.width.actualWidthBMm}:params.mode==='variable'?{laws:params.laws,maxRadiusErrorMm:output.variable.maxRadiusErrorMm}:{radiusMm:measuredRadius};
    if(params.mode==='constant'&&measuredRadius!==null)validation.radius='surface-radius-measured';
    if(params.mode==='constant'&&output.seamValidation){validation.seams=output.seamValidation.status;validation.endpoints=output.seamValidation.naturalTerminationEdgeIds.length?'not_yet_verified':'no_terminal_exception';validation.maxTangentAngleDeg=output.seamValidation.maxContactAngleDeg;validation.contactEdgeCount=output.seamValidation.contactEdgeCount;validation.naturalTerminationEdgeIds=output.seamValidation.naturalTerminationEdgeIds;}
    if(params.mode==='width'){delete validation.radius;validation.widths='passed';validation.seams='G1-contact-sampled';validation.maxTangentAngleDeg=output.width.maxTangentAngleDeg;validation.contactSamples=output.width.contactSamples;}
    if(params.mode==='variable'){validation.radius='sampled-passed';validation.seams='G1-contact-sampled';validation.maxRadiusErrorMm=output.variable.maxRadiusErrorMm;validation.maxSectionFitResidualMm=output.variable.maxSectionFitResidualMm;validation.maxTangentAngleDeg=output.variable.maxTangentAngleDeg;validation.contactSamples=output.variable.samples.length*2;}
    output.shape.roundingReport={mode:params.mode,requestedSpec:{...requestedDimensions,scope:params.scope,propagation:params.propagation},effectiveSpec:effectiveDimensions,strategy:output.strategy||'native',solverVersion:1,candidateAttempts,
      requestedSelection:plan.selectedEdgeIds,sharpSeedEdgeIds:plan.sharpSeedEdgeIds,resolvedContours:output.contourCount,expandedSelection:output.expandedEdgeIds||[],actualContourEdgeIds:output.contourEdgeIds||[],excludedEdgeIds:plan.excludedEdgeIds,skippedTangentEdgeIds:plan.skippedTangentEdgeIds,
      processedEdgeIds:output.actualEdgeIds,generatedFaceMap:measuredFaces,newSurfaceCount:output.surfaceCount,analytic:output.analytic||null,cleanup:output.cleanup||null,width:output.width||null,variable:output.variable||null,validation,verificationLevel:params.mode==='width'?'brep-solid-material-width-and-sampled-G1':params.mode==='variable'?'brep-solid-material-radius-law-and-sampled-G1':measuredRadius===null?'brep-solid-and-material; radius/seams pending':output.seamValidation?.naturalTerminationEdgeIds.length?'brep-solid-material-generated-surface-radius-and-sampled-G1; endpoints pending':output.seamValidation?'brep-solid-material-generated-surface-radius-and-sampled-G1':'brep-solid-material-and-generated-surface-radius; seams pending'};
    return output.shape;
    }catch(error){output.shape.delete();throw error;}
  }
  if(params.mode==='variable'){
    if(strategy!=='auto'&&strategy!=='analytic-variable')throw Object.assign(new Error('当前变 R 模式使用解析规律构造器'),{code:'PARAM_SCHEMA_INVALID'});
    return finish(variableStraightPlanarFillet(shape,params,plan));
  }
  if(params.mode==='width'){
    if(strategy!=='auto'&&strategy!=='width')throw Object.assign(new Error('宽圆润只能采用宽度构造器'),{code:'PARAM_SCHEMA_INVALID'});
    return finish(buildWidthRounding(shape,params,plan));
  }
  const candidates={native:()=>nativeConstantFillet(shape,params,plan),'unified-native':()=>controlledUnifiedNativeFillet(shape,params,plan),analytic:()=>analyticConstantFillet(shape,params,plan)};
  if(strategy!=='auto'){
    if(!candidates[strategy])throw Object.assign(new Error('未知圆角构造策略'),{code:'PARAM_SCHEMA_INVALID'});
    return finish(candidates[strategy]());
  }
  const attempts=[];
  let firstFailure;
  for(const [name,build] of Object.entries(candidates)){
    try{return finish(build(),attempts);}
    catch(error){
      if(!['KERNEL_BUILD_FAILED','GEOMETRY_INVALID','MATERIAL_CHECK_FAILED','CLEANUP_NOT_APPLICABLE','ANALYTIC_FAMILY_UNMATCHED','GEOMETRY_CONFLICT'].includes(error?.code))throw error;
      firstFailure??=error;
      attempts.push({strategy:name,code:error.code,message:String(error.message)});
    }
  }
  firstFailure.report={...(firstFailure.report||{}),candidateAttempts:attempts};
  throw firstFailure;
}
