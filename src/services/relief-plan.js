import {validateRegions} from '../logo-model.js';
import {validateSchema,contractHash} from '../contracts/operation-schema.js';
import {reliefOperations} from '../modeling/manufacturing/relief-contracts.js';
import {cylindricalReliefTool} from '../modeling/manufacturing/cylindrical-relief.js';
import {planRegionContours,CONTOUR_TOPOLOGY_REPORT_VERSION} from '../modeling/manufacturing/relief-region-plan.js';
import {planReliefLayers} from '../modeling/manufacturing/relief-layer-plan.js';
import {mergeStrokeRegions} from '../modeling/manufacturing/relief-strokes.js';

const dispose=x=>{try{x?.delete?.();}catch{}};
const fail=message=>{throw Object.assign(new Error(message),{code:'RELIEF_PLAN_UNSUPPORTED'});};
// PURE preview, never a load/rebuild migration. ROOT applies the returned params
// to the original feature through an explicit, revision-checked feature edit.
export function planReliefTopologyUpgrade(params,{maskStrategy}={}){
 validateSchema(reliefOperations.relief.paramsSchema,params);
 const targetStrategy=maskStrategy??params.maskStrategy;
 if(!['faceWithHolesExtrude','cutHoleSolids'].includes(targetStrategy))throw Object.assign(new Error('显式升级须选择带孔面挤出或孔实体切除策略'),{code:'RELIEF_UPGRADE_STRATEGY_REQUIRED',stage:'contour-upgrade-plan'});
 const next=structuredClone(params),changes=[];
 for(const [key,value]of Object.entries({curvePolicy:'preserveTopology',maskStrategy:targetStrategy})){
  if(params[key]===value)continue;
  const beforePresent=Object.hasOwn(params,key);
  changes.push({path:`/${key}`,beforePresent,...(beforePresent?{before:params[key]}:{}),after:value});next[key]=value;
 }
 validateSchema(reliefOperations.relief.paramsSchema,next);
 const design=p=>{const {curvePolicy,maskStrategy,...unchanged}=p;return contractHash(unchanged);},changed=changes.length>0;
 return {params:next,receipt:{version:'relief-topology-upgrade-plan-1',status:changed?'planned':'no-change',requiresExplicitApply:changed,changes,beforeParamsFingerprint:contractHash(params),afterParamsFingerprint:contractHash(next),unchangedDesignFingerprint:design(params),designPreserved:design(params)===design(next),toleranceMm:params.curveToleranceMm??0,sourceSplineDeviation:'unknown',before:{curvePolicy:params.curvePolicy??null,maskStrategy:params.maskStrategy??null,localEffectiveMaskStrategy:params.maskStrategy??'cutHoleSolids',remoteEffectiveMaskStrategy:params.maskStrategy??'faceWithHolesExtrude'},after:{curvePolicy:next.curvePolicy,maskStrategy:next.maskStrategy},invalidationRequired:changed?['geometry-recipe-fingerprint','feature-and-dependent-compiled-checkpoints','local-layer-prefixes-from-this-feature','remote-input-and-prefix-fingerprints','compiled-contour-plan']:[],commitState:'notCommitted',geometryComputed:false}};
}

// A typed compilation boundary, not a second contour fitter. Source contours,
// heights and the established tangent projection remain authoritative. The
// initial native prototype accepts only uniform cylindrical emboss layers.
export function prepareCompiledReliefPlan(source,p,oc,cad,{sourceBrep:authoritativeSource}={}){
 validateSchema(reliefOperations.relief.paramsSchema,p);
 if(!p.layers||p.sculpt||p.strokes||p.contourSnapMm||p.layers.some(l=>(!l.regions&&!l.strokes)||l.sculpt||l.values?.some(r=>r.some(v=>v!==1))))fail('Only uniform cylindrical layers with explicit contours or strokes are supported');
 // Surface adapters can populate p-curves/flags on the TShape. Compile from an
 // isolated copy and bind the pre-compilation source bytes, never a mutated
 // cache entry or a serialization obtained after helper calls.
 const sourceBrep=authoritativeSource??source.serialize(),copy=cad.deserializeShape(sourceBrep),faces=copy.faces,face=faces[p.faceId],artifacts=[],layers=[],conversions=[];
 try{
  if(face?.geomType!=='CYLINDRE')fail('Exact original cylindrical support face required');
  const edges=face.edges;let boundary;
  try{boundary=cad.makeCompound(edges);artifacts.push({id:'boundary',data:boundary.serialize()});}finally{dispose(boundary);edges.forEach(dispose);}
  const grouping=planReliefLayers(p.layers,p.compileLayers??'logical');
  for(const [index,group]of grouping.groups.entries()){
   const {layer}=group;
   if((layer.startHeightMm??0)>=layer.heightMm)fail('Layer start must be lower than its crest');
   const params={...p,layers:undefined,regions:layer.regions,strokes:layer.strokes,depthMm:layer.heightMm,baseMm:p.baseMm??.005,mode:layer.mode??'emboss',surfaceMode:'smooth',values:Array.from({length:4},()=>Array(4).fill(1)),...(layer.localPatches?{localPatches:layer.localPatches}:{})};
   const mmRing=ring=>ring.map(([x,y])=>[x*p.widthMm,y*p.heightMm]);
   for(const memberRegions of group.regionGroups)if(memberRegions?.length)validateRegions({regions:memberRegions.map(r=>({outer:mmRing(r.outer),holes:(r.holes??[]).map(mmRing)}))},{maxRegions:1024,maxVertices:64000});
   const regions=mergeStrokeRegions(layer.regions?.map(r=>({...r,holes:r.holes??[]}))??[],layer.strokes,p.widthMm,p.heightMm,0);
   const built=cylindricalReliefTool(face,params,oc,cad,{startHeightMm:layer.startHeightMm??0});
   try{
    if(!['cylindrical-analytic-relief','cylindrical-local-patch-relief'].includes(built.report.kind))fail('Uniform analytic or protected local-patch tool required');
    const toolId=`tool-${index}`,sag=built.frame.radius*(1-Math.cos(p.widthMm/built.frame.radius/2)),engrave=params.mode==='engrave',bottom=engrave?-sag-layer.heightMm-params.baseMm-.02:-sag-.01,top=engrave?.01:layer.heightMm+params.baseMm+Math.max(0,...(layer.localPatches??[]).flatMap(patch=>patch.deltaMm.flat()))+.02;
    artifacts.push({id:toolId,data:built.tool.serialize()});
    const compileRegion=(region,regionIndex)=>{
     const rings=[region.outer,...(region.holes??[])].map(ring=>{
      if(ring.some(([x,y])=>Math.abs(x)>.5+1e-9||Math.abs(y)>.5+1e-9))fail('Contour exceeds the unchanged design rectangle');
      const signed=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0),ordered=signed<0?[...ring].reverse():ring;
      return ordered.map(([x,y])=>built.frame.point(x*p.widthMm,y*p.heightMm,bottom));
     }),result=planRegionContours(rings,built.frame.normal,p.curveToleranceMm??0,p.curvePolicy??'fitWithinTolerance');
     // Keep ring-specific causes; do not smear an outer-ring collision onto holes.
     for(const [ringIndex,plan]of result.plans.entries())conversions.push({layer:index,region:regionIndex,compiledGroupIndex:index,compiledRegionIndex:regionIndex,memberLayerIds:group.memberLayerIds,...plan.report,ringIndex,role:ringIndex?'hole':'outer'});
     return {outer:result.plans[0].segments,holes:result.plans.slice(1).map(plan=>plan.segments)};
    };
    layers.push({toolArtifactId:toolId,boundaryArtifactId:'boundary',normal:built.frame.normal,mode:params.mode,spanMm:top-bottom,regions:regions.map(compileRegion),memberLayerIds:group.memberLayerIds,design:{heightMm:layer.heightMm,startHeightMm:layer.startHeightMm??0,baseMm:params.baseMm,kernelOverlapMm:.001,strokeCount:layer.strokes?.length??0,strokeUnion:'shared-local-width-and-outline; not a 3D weave'},support:built.report});
   }finally{dispose(built.tool);}
  }
  const support=layers[0].support;
  return {version:1,paramsFingerprint:contractHash(p),semanticVersion:p.layers.some(layer=>layer.strokes||layer.mode==='engrave')?'relief.compiled-contours-strokes-1.2':p.layers.some(layer=>layer.localPatches)?'relief.compiled-contours-local-patch-1.1':'relief.compiled-contours-1.0',supportIntent:{kind:'outer-cylinder',radiusMm:support.radiusMm,point:support.sourceSelection.point,axis:support.axis,normal:support.sourceSelection.normal},sourceBrep,layers,artifacts,conversions,contourReport:{version:CONTOUR_TOPOLOGY_REPORT_VERSION,ringCount:conversions.length,truncated:false,curvePolicy:p.curvePolicy??'fitWithinTolerance',curvePolicyExplicit:p.curvePolicy!==undefined,maskStrategy:p.maskStrategy??'faceWithHolesExtrude',maskStrategyExplicit:p.maskStrategy!==undefined,localEffectiveMaskStrategy:p.maskStrategy??'cutHoleSolids',explicitUpgradeRequired:p.curvePolicy!=='preserveTopology'||p.maskStrategy===undefined,sourceCoordinatesChanged:false,errorBound:'sampled-not-global'},reference:'historical-cleaned-polyline',sourceSplineDeviation:'unknown'};
 }finally{faces.forEach(dispose);dispose(copy);}
}
