import {createClosedNativeGrindingContactCutter} from './closed-contact-cutter.js';

const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=(message,report)=>{throw Object.assign(new Error(message),{code:'GEOMETRY_INVALID',report,recoveryAction:'CORRECT_PARAMETERS'});};
function modifiedShapes(builder,native,oc) {
  let raw,list;const shapes=[];
  try {raw=builder.Modified(native);list=new oc.NCollection_List_TopoDS_Shape(raw);while(list.Extent()){shapes.push(list.First());list.RemoveFirst();}return shapes;}
  catch(error){shapes.forEach(dispose);throw error;}
  finally{dispose(list);dispose(raw);}
}

/** Both the source and cutter are read through the same Boolean history.
 * Every final face needs an actual native ancestor; unknown faces are rejected. */
export function traceClosedCurvedCutFaces(builder,source,cutters,result,oc) {
  const sourceFaces=source.faces,toolFaces=cutters.flatMap(cutter=>cutter.faces),resultFaces=result.faces;
  const origins=resultFaces.map(()=>null);
  try {
    for(const [kind,inputFaces] of [['source',sourceFaces],['cutter',toolFaces]]) {
      for(let inputFaceId=0;inputFaceId<inputFaces.length;inputFaceId++) {
        const input=inputFaces[inputFaceId],changed=modifiedShapes(builder,input.wrapped,oc);
        try {resultFaces.forEach((face,faceId)=>{
          if(!face.wrapped.IsSame(input.wrapped)&&!changed.some(native=>face.wrapped.IsSame(native)))return;
          const origin={kind,inputFaceId};
          if(origins[faceId]&&(origins[faceId].kind!==kind||origins[faceId].inputFaceId!==inputFaceId))
            fail('打磨结果面有矛盾的原生来源记录',{faceId,origins:[origins[faceId],origin]});
          origins[faceId]=origin;
        });}finally{changed.forEach(dispose);}
      }
    }
    const unknownFaceIds=origins.flatMap((origin,faceId)=>origin?[]:[faceId]);
    if(unknownFaceIds.length)fail('打磨结果面缺少原生切削来源',{unknownFaceIds});
    return {origins,generatedFaceIds:origins.flatMap((origin,faceId)=>origin.kind==='cutter'?[faceId]:[]),
      resultFaceSourceIds:origins.flatMap((origin,faceId)=>origin.kind==='source'?[{faceId,sourceFaceId:origin.inputFaceId}]:[])};
  }finally{[...sourceFaces,...toolFaces,...resultFaces].forEach(dispose);}
}

/** One positive-width closed curved cutter and one nondestructive Cut.
 * Acceptance belongs to the shared v3 quality gate in the calling operation. */
export function buildClosedCurvedCut(shape,{edgeIds,contours=[{sourceEdgeIds:edgeIds}],initialHalfWidthMm},cad) {
  const oc=cad.getOC(),cutters=[];let builder,objects,tools,progress,result;
  try {
    for(const contour of contours)cutters.push(createClosedNativeGrindingContactCutter(shape,{edgeIds:contour.sourceEdgeIds,initialHalfWidthMm,
      minimumHalfWidthMm:initialHalfWidthMm/8,maximumWidthHalvings:3},cad));
    builder=new oc.BRepAlgoAPI_Cut();builder.SetNonDestructive(true);builder.SetRunParallel(false);builder.SetToFillHistory(true);
    objects=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();
    objects.Append(shape.wrapped);cutters.forEach(cutter=>tools.Append(cutter.tool.wrapped));builder.SetArguments(objects);builder.SetTools(tools);
    progress=new oc.Message_ProgressRange();builder.Build(progress);
    if(!builder.IsDone()||builder.HasErrors()||!builder.NonDestructive())
      fail('闭合曲面打磨切削未完成',{strategy:'closed-native-contact-curved-cut',cutBuildCalls:1});
    result=cad.cast(builder.Shape()).asShape3D();
    const provenance=traceClosedCurvedCutFaces(builder,shape,cutters.map(cutter=>cutter.tool),result,oc);
    const returned={shape:result,...provenance,actualEdgeIds:[...edgeIds],constructionKind:'automatic-curved-cut',
      cutterReports:cutters.map(cutter=>cutter.report),constructionScaleMm:Math.min(...cutters.map(cutter=>cutter.report.halfWidthMm)),cutBuildCalls:1};
    result=null;return returned;
  }finally{dispose(result);[progress,tools,objects,builder].forEach(dispose);cutters.forEach(cutter=>cutter.disposeCandidate());}
}
