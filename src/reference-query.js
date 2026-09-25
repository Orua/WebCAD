// Reference candidates are derived from current B-Rep queries, never display vertices.
const vec=value=>Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==='number'&&Number.isFinite(v));
const error=(code,message)=>Object.assign(new Error(message),{code,recoveryAction:'READ_STATE_AND_REPLAN'});
export const REFERENCE_TYPES=Object.freeze({
  point:['world-origin','work-origin','cad-vertex','edge-midpoint','circle-center','edge-nearest','trimmed-face-point','face-area-centroid','bounds-center','named-anchor'],
  axis:['circle-axis','work-x-axis','work-y-axis','work-z-axis'],
  frame:['world-frame','work-frame','saved-frame'],
});
const center=b=>b.bounds.min.map((v,i)=>(v+b.bounds.max[i])/2);
const addCandidate=(items,kind,semantic,worldPoint,quality,source,context,extra={})=>{
  items.push({referenceId:crypto.randomUUID(),kind,semantic,type:semantic,worldPoint:worldPoint&&[...worldPoint],point:worldPoint&&[...worldPoint],quality,precision:quality,source,context:{documentId:context.documentId,documentInstanceId:context.documentInstanceId,revision:context.revision},...extra});
};

export async function collectReferences(input,{context,referenceSystem,bodies,queryGeometry,queryNearest,assertFresh}){
  const {kind,bodyIds,filter={},limit=20,offset=0}=input,types=filter.types,allow=type=>!types||types.includes(type),items=[];
  const frame=referenceSystem.workFrame;
  if(kind==='point'){
    if(allow('world-origin'))addCandidate(items,kind,'world-origin',[0,0,0],'exact-coordinate',{kind:'world'},context);
    if(allow('work-origin'))addCandidate(items,kind,'work-origin',frame.origin,'exact-coordinate',{kind:'work',frameVersion:frame.frameVersion},context);
  }else if(kind==='axis'){
    const basis=[[1,0,0],[0,1,0],[0,0,1]],q=frame.quaternion;
    const rotate=v=>{const [x,y,z,w]=q,[vx,vy,vz]=v,tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];};
    ['work-x-axis','work-y-axis','work-z-axis'].forEach((type,i)=>{if(allow(type))addCandidate(items,kind,type,frame.origin,'exact-coordinate',{kind:'work',frameVersion:frame.frameVersion},context,{worldAxis:rotate(basis[i])});});
  }else{
    if(allow('world-frame'))addCandidate(items,kind,'world-frame',[0,0,0],'exact-coordinate',{kind:'world'},context,{quaternion:[0,0,0,1]});
    if(allow('work-frame'))addCandidate(items,kind,'work-frame',frame.origin,'exact-coordinate',{kind:'work',frameVersion:frame.frameVersion},context,{quaternion:[...frame.quaternion]});
    for(const saved of referenceSystem.savedFrames)if(allow('saved-frame'))addCandidate(items,kind,'saved-frame',saved.origin,'exact-coordinate',{kind:'saved',frameId:saved.frameId,frameVersion:saved.frameVersion},context,{name:saved.name,quaternion:[...saved.quaternion]});
  }
  if(kind!=='frame')for(const id of bodyIds){
    const body=bodies.find(item=>item.id===id);
    if(!body)throw error('STALE_REFERENCE','目标实体不属于当前工程');
    const edgeNeeded=kind==='point'?['cad-vertex','edge-midpoint','circle-center','bounds-center','named-anchor'].some(allow):allow('circle-axis');
    const faceNeeded=kind==='point'&&allow('face-area-centroid');
    let edgeResult,faceResult;
    if(edgeNeeded){edgeResult=await queryGeometry(id,'edge');assertFresh();}
    if(faceNeeded){faceResult=await queryGeometry(id,'face');assertFresh();}
    if(kind==='point'){
      if(allow('bounds-center'))addCandidate(items,kind,'bounds-center',center(body),'derived-exact',{bodyId:id,geometryFingerprint:edgeResult?.geometryFingerprint||faceResult?.geometryFingerprint,topologyKind:'body'},context);
      for(const edge of edgeResult?.items||[]){const source={bodyId:id,geometryFingerprint:edgeResult.geometryFingerprint,topologyKind:'edge',topologyId:edge.edgeId};
        if(allow('cad-vertex'))for(const p of [edge.startPoint,edge.endPoint])addCandidate(items,kind,'cad-vertex',p,'exact-brep',source,context);
        if(allow('edge-midpoint'))addCandidate(items,kind,'edge-midpoint',edge.lengthMidpoint,'derived-exact',source,context,{lengthMm:edge.lengthMm});
        if(edge.center&&allow('circle-center'))addCandidate(items,kind,'circle-center',edge.center,'exact-brep',source,context,{worldAxis:edge.axis,radiusMm:edge.radiusMm});
      }
      for(const face of faceResult?.items||[])if(allow('face-area-centroid'))addCandidate(items,kind,'face-area-centroid',face.center,'derived-exact',{bodyId:id,geometryFingerprint:faceResult.geometryFingerprint,topologyKind:'face',topologyId:face.faceId},context,{worldAxis:face.normal,areaMm2:face.areaMm2,pointOnTrimmedFace:false});
      if(filter.near&&allow('edge-nearest')){const nearest=await queryNearest(id,'edge',filter.near);assertFresh();for(const edge of nearest.items)addCandidate(items,kind,'edge-nearest',edge.worldPoint,'exact-brep',{bodyId:id,geometryFingerprint:nearest.geometryFingerprint,topologyKind:'edge',topologyId:edge.topologyId},context,{residualMm:edge.residualMm});}
      if(filter.near&&allow('trimmed-face-point')){const nearest=await queryNearest(id,'face',filter.near);assertFresh();for(const face of nearest.items)addCandidate(items,kind,'trimmed-face-point',face.worldPoint,'exact-brep',{bodyId:id,geometryFingerprint:nearest.geometryFingerprint,topologyKind:'face',topologyId:face.topologyId},context,{residualMm:face.residualMm,pointOnTrimmedFace:true});}
      for(const anchor of referenceSystem.bodyAnchors||[])if(anchor.bodyId===id&&anchor.status==='valid'&&anchor.geometryFingerprint===edgeResult?.geometryFingerprint&&allow('named-anchor'))addCandidate(items,kind,'named-anchor',anchor.worldPoint,'derived-exact',{bodyId:id,geometryFingerprint:anchor.geometryFingerprint,topologyKind:'body',anchorId:anchor.anchorId},context,{name:anchor.name,quaternion:anchor.quaternion});
    }else for(const edge of edgeResult?.items||[])if(edge.axis&&allow('circle-axis'))addCandidate(items,kind,'circle-axis',edge.center,'exact-brep',{bodyId:id,geometryFingerprint:edgeResult.geometryFingerprint,topologyKind:'edge',topologyId:edge.edgeId},context,{worldAxis:edge.axis,radiusMm:edge.radiusMm});
    if(items.length>10000)throw error('RESOURCE_LIMIT','参考候选超过 10000 个；请缩小对象或类型范围');
  }
  const near=filter.near;
  const selected=near?items.filter(item=>item.worldPoint&&Math.hypot(...item.worldPoint.map((v,i)=>v-near.point[i]))<=near.radiusMm):items;
  const matchCount=selected.length,page=selected.slice(offset,offset+limit),ambiguous=matchCount>1;
  if(input.requireUnique&&matchCount!==1)return {status:'failed',commitState:'not_committed',error:{code:matchCount?'AMBIGUOUS_REFERENCE':'NO_MATCH',message:matchCount?'多个参考满足条件，请缩小范围或明确选择':'没有匹配参考',recoveryAction:'REFINE_QUERY'},context,kind,items:page,matchCount,ambiguous,truncated:offset+limit<matchCount,nextOffset:offset+limit<matchCount?offset+limit:null};
  return {status:'read',context,kind,items:page,matchCount,ambiguous,truncated:offset+limit<matchCount,nextOffset:offset+limit<matchCount?offset+limit:null};
}

export function validateReferenceQuery(input){
  if(!input||typeof input!=='object'||!REFERENCE_TYPES[input.kind])throw error('PARAM_SCHEMA_INVALID','kind 必须是 point、axis 或 frame');
  if(!Array.isArray(input.bodyIds)||input.bodyIds.length>200||new Set(input.bodyIds).size!==input.bodyIds.length||input.bodyIds.some(id=>typeof id!=='string'||!id))throw error('PARAM_SCHEMA_INVALID','bodyIds 必须是明确且不重复的当前实体列表');
  const filter=input.filter??{};
  if(!filter||typeof filter!=='object'||Array.isArray(filter)||Object.keys(filter).some(key=>!['types','near'].includes(key)))throw error('PARAM_SCHEMA_INVALID','未知参考筛选字段');
  if(filter.types!==undefined&&(!Array.isArray(filter.types)||!filter.types.length||new Set(filter.types).size!==filter.types.length||filter.types.some(type=>!REFERENCE_TYPES[input.kind].includes(type))))throw error('PARAM_SCHEMA_INVALID','参考类型与 kind 不匹配');
  if(filter.near!==undefined){const near=filter.near;if(!near||typeof near!=='object'||Array.isArray(near)||Object.keys(near).some(key=>!['point','radiusMm'].includes(key))||!vec(near.point)||typeof near.radiusMm!=='number'||!Number.isFinite(near.radiusMm)||near.radiusMm<=0)throw error('PARAM_SCHEMA_INVALID','near 需要世界坐标点与正半径');}
  if(filter.types?.some(type=>['edge-nearest','trimmed-face-point'].includes(type))&&!filter.near)throw error('PARAM_SCHEMA_INVALID','边/面最近点需要 near 世界坐标及搜索半径');
  const limit=input.limit??20,offset=input.offset??0;
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>10000||input.requireUnique!==undefined&&typeof input.requireUnique!=='boolean')throw error('PARAM_RANGE_INVALID','limit、offset 或 requireUnique 无效');
  return {...input,filter,limit,offset};
}
