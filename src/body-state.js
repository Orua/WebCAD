const keys=['id','name','geometryType','triangleCount','vertexCount','meshReport','previewOrigin','metricsDeferred','measurementStatus','boundsSource','adaptiveDisplay','bounds','volume','area','solidCount','shellCount','transitionReport','blendReport','roundingReport','roundReport','endRoundingReport','repairReport','badgeReport','threadReport','chainReport','constraintReport','reliefReport','refineReport','displayReport','loftReport','variationReport','booleanReport','blendRadiusReport','radiusSearchReport','warnings'];
keys.push('subdApproximation');
export function bodyState(body){return {...Object.fromEntries(keys.filter(key=>body[key]!==undefined).map(key=>[key,body[key]])),faceCount:body.faceCount??body.faceGroups?.length??0,edgeCount:body.edgeCount??body.edges?.length??0};}
export function bodyWarnings(bodies){
  return bodies.flatMap(body=>[
    ...(body.displayReport?.untriangulatedFaceIds.length?[{code:'DISPLAY_INCOMPLETE',bodyId:body.id,faceIds:body.displayReport.untriangulatedFaceIds,message:`显示网格不完整（${body.displayReport.untriangulatedFaceIds.length}个面），导出前请检查`}]:[]),
    ...(body.displayReport?.volumeErrorRatio>.02?[{code:'DISPLAY_VOLUME_MISMATCH',bodyId:body.id,ratio:body.displayReport.volumeErrorRatio,message:'显示网格与精确实体体积不一致，请检查显示和导出结果'}]:[]),
    ...(body.loftReport?.warning?[{...body.loftReport.warning,bodyId:body.id}]:[]),...(body.warnings||[])
  ]);
}
