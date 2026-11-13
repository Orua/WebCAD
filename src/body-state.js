const keys=['id','name','geometryType','triangleCount','vertexCount','meshReport','previewOrigin','metricsDeferred','measurementStatus','boundsSource','adaptiveDisplay','bounds','volume','area','solidCount','shellCount','logoProjectionReport','transitionReport','blendReport','roundingReport','roundReport','endRoundingReport','repairReport','badgeReport','threadReport','chainReport','constraintReport','reliefReport','refineReport','displayReport','loftReport','variationReport','booleanReport','blendRadiusReport','radiusSearchReport','warnings'];
keys.push('resizeReport','subdApproximation','guidedLoftReport','ellipsoidReport','alignmentReport','sourceFreeJunctionReport','sourceJunctionReport');
// R7-009: a deferred exact measurement is never reported as volume 0.
export function deferredMetricFields(body){
  if(body?.metricsDeferred!==true)return {};
  // R7-009: an uncomputed or zero placeholder must never be reported as volume 0.
  // I-07: a real measured volume/area computed on the adaptive path is preserved.
  const out={metricsDeferred:true,volume:null,...(body.measurementStatus?{measurementStatus:body.measurementStatus}:{})};
  if(Number.isFinite(body.volume)&&body.volume>0)out.volume=body.volume;
  if(Number.isFinite(body.area)&&body.area>0)out.area=body.area;
  return out;
}
export function bodyState(body){return {...Object.fromEntries(keys.filter(key=>body[key]!==undefined).map(key=>[key,body[key]])),...deferredMetricFields(body),faceCount:body.faceCount??body.faceGroups?.length??0,edgeCount:body.edgeCount??body.edges?.length??0};}
export function bodyWarnings(bodies){
  return bodies.flatMap(body=>[
    ...(body.displayReport?.untriangulatedFaceIds.length?[{code:'DISPLAY_INCOMPLETE',bodyId:body.id,faceIds:body.displayReport.untriangulatedFaceIds,message:`显示网格不完整（${body.displayReport.untriangulatedFaceIds.length}个面），导出前请检查`}]:[]),
    ...(body.displayReport?.volumeErrorRatio>.02?[{code:'DISPLAY_VOLUME_MISMATCH',bodyId:body.id,ratio:body.displayReport.volumeErrorRatio,message:'显示网格与精确实体体积不一致，请检查显示和导出结果'}]:[]),
    ...(body.loftReport?.warning?[{...body.loftReport.warning,bodyId:body.id}]:[]),...(body.loftReport?.envelopeWarning?[{...body.loftReport.envelopeWarning,bodyId:body.id}]:[]),...(body.warnings||[]).map(warning=>({...warning,bodyId:warning.bodyId||body.id}))
  ]);
}
// Execute receipts should not attribute another body's leftover union warnings
// to an unrelated pattern or boolean. Document getState().warnings stays complete.
export function scopeOperationWarnings(warnings,{createdBodyIds=[],replacements=[],deletedBodyIds=[],refs=[],editedBodyIds=[]}={}){
  const ids=new Set([...createdBodyIds,...deletedBodyIds,...(refs||[]),...(editedBodyIds||[]),...(replacements||[]).flatMap(row=>[row.before,row.after])].filter(Boolean));
  return (warnings||[]).filter(warning=>ids.size?(!warning.bodyId||ids.has(warning.bodyId)):!warning.bodyId);
}
