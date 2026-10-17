import * as cad from 'replicad';
import {topologyDetails} from './modeling/rounding/topology.js';

const dispose=value=>{try{value?.delete();}catch{}};
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const isCurrentShape=(candidate,shape)=>candidate===shape||Boolean(candidate?.wrapped&&shape?.wrapped&&candidate.wrapped.IsSame(shape.wrapped));
const originIds=row=>typeof row==='string'?[row]:row?.featureIds||[row?.featureId];

/**
 * Resolve semantic selectors against one transient BRep revision. `context` is
 * supplied by the rebuild owner: {sourceShape, provenance:{faceOrigins:[
 * {featureId, role?} | {featureId,...}]}}. faceOrigins is rebuild-local output
 * from the parent's OCCT Generated/Modified history, never document topology.
 */
export function resolveBlendSelector(shape,{selector,faceIds,edgeIds,allEdges=false,sharedFaces=false}={},context={}){
  const rows=topologyDetails(shape),faces=shape.faces,edges=shape.edges;
  try{
    const chosen=selector??(faceIds?{faceIds}:edgeIds?{edgeIds}:allEdges?{allEdges:true}:null);
    if(!chosen||typeof chosen!=='object'||Array.isArray(chosen))fail('SELECTOR_INVALID','需要提供一个面、边或语义选择器');
    let candidateIds=null,selectedFaces=null,kind;
    if(Array.isArray(chosen.faceIds)){
      selectedFaces=new Set(chosen.faceIds);kind='faceIds';
      if(!chosen.faceIds.length||selectedFaces.size!==chosen.faceIds.length||chosen.faceIds.some(id=>!Number.isInteger(id)||id<0||id>=faces.length))fail('SELECTOR_INVALID','当前形状中的 faceIds 无效');
    }else if(Array.isArray(chosen.edgeIds)){
      candidateIds=new Set(chosen.edgeIds);kind='edgeIds';
      if(!chosen.edgeIds.length||candidateIds.size!==chosen.edgeIds.length||chosen.edgeIds.some(id=>!Number.isInteger(id)||id<0||id>=edges.length))fail('SELECTOR_INVALID','当前形状中的 edgeIds 无效');
    }else if(chosen.allEdges===true){kind='allEdges';}
    else if(chosen.seamBetween&&typeof chosen.seamBetween.a==='string'&&typeof chosen.seamBetween.b==='string'&&chosen.seamBetween.a!==chosen.seamBetween.b){
      kind='seamBetween';
      const provenance=context?.provenance;
      const origins=provenance?.faceOrigins;
      if(!context.sourceShape||!origins)fail('SELECTOR_CONTEXT_REQUIRED','seamBetween 需要父级在本次重建 context 中提供 sourceShape 与 OCCT 历史生成的 provenance.faceOrigins');
      if(!isCurrentShape(context.sourceShape,shape))fail('SELECTOR_CONTEXT_STALE','context.sourceShape 不是当前用于选择的 BRep 修订');
      if(origins.length!==faces.length)fail('SELECTOR_CONTEXT_STALE',`provenance.faceOrigins 长度 ${origins.length} 与当前 BRep 面数 ${faces.length} 不一致`);
      const wanted=new Set([chosen.seamBetween.a,chosen.seamBetween.b]);
      selectedFaces=new Set(origins.flatMap((entry,id)=>originIds(entry).some(value=>wanted.has(value))?[id]:[]));
      if(!selectedFaces.size)fail('SELECTOR_EMPTY','指定特征没有可追溯的生成面');
    }else if(chosen.facesFromFeature&&typeof chosen.facesFromFeature.featureId==='string'){
      kind='facesFromFeature';
      const {featureId,role='all'}=chosen.facesFromFeature;
      if(!['all','side','cap'].includes(role))fail('SELECTOR_INVALID','facesFromFeature.role 只接受 side、cap 或 all');
      const origins=context?.provenance?.faceOrigins;
      if(!context.sourceShape||!origins)fail('SELECTOR_CONTEXT_REQUIRED','facesFromFeature 需要父级在本次重建 context 中提供 sourceShape 与 provenance.faceOrigins');
      if(!isCurrentShape(context.sourceShape,shape))fail('SELECTOR_CONTEXT_STALE','context.sourceShape 不是当前用于选择的 BRep 修订');
      if(origins.length!==faces.length)fail('SELECTOR_CONTEXT_STALE','provenance.faceOrigins 与当前 BRep 面数不匹配');
      selectedFaces=new Set(origins.flatMap((entry,id)=>{
        const row=typeof entry==='string'?{featureId:entry}:entry;
        return originIds(row).includes(featureId)&&(role==='all'||row.role===role)?[id]:[];
      }));
      if(!selectedFaces.size)fail('SELECTOR_EMPTY',`特征 ${featureId} 没有 role=${role} 的生成面`);
    }else if(chosen.edgesNear&&Array.isArray(chosen.edgesNear.pointMm)&&chosen.edgesNear.pointMm.length===3){
      kind='edgesNear';const {pointMm,radiusMm,sharpOnly=true}=chosen.edgesNear;
      if(pointMm.some(v=>!Number.isFinite(v))||!Number.isFinite(radiusMm)||radiusMm<=0||typeof sharpOnly!=='boolean')fail('SELECTOR_INVALID','edgesNear 需要有限的 pointMm、正 radiusMm 和布尔 sharpOnly');
      candidateIds=new Set();
      const point=cad.makeVertex(pointMm);
      // OCCT computes the exact minimum point-to-edge distance, including the
      // interior of curved edges; finite point sampling can miss a near pass.
      try{for(const row of rows){if(sharpOnly&&row.sharp!==true)continue;if(cad.measureDistanceBetween(point,edges[row.edgeId])<=radiusMm)candidateIds.add(row.edgeId);}}
      finally{dispose(point);}
    }else fail('SELECTOR_INVALID','不支持的语义选择器；可用 faceIds、edgeIds、seamBetween、edgesNear 或 facesFromFeature');

    let candidates=rows.filter(row=>{
      if(candidateIds)return candidateIds.has(row.edgeId);
      if(selectedFaces){
        if(kind==='seamBetween'){
          const origins=context.provenance.faceOrigins;
          const adjacent=row.adjacentFaceIds.map(id=>origins[id]);
          const labels=adjacent.map(originIds),{a,b}=chosen.seamBetween;
          return labels.length===2&&((labels[0].includes(a)&&!labels[0].includes(b)&&labels[1].includes(b)&&!labels[1].includes(a))||(labels[1].includes(a)&&!labels[1].includes(b)&&labels[0].includes(b)&&!labels[0].includes(a)));
        }
        if(kind==='facesFromFeature')return row.adjacentFaceIds.some(id=>selectedFaces.has(id));
        return sharedFaces?row.adjacentFaceIds.length===2&&row.adjacentFaceIds.every(id=>selectedFaces.has(id)):row.adjacentFaceIds.some(id=>selectedFaces.has(id));
      }
      return kind==='allEdges';
    });
    if(!candidates.length)fail('SELECTOR_EMPTY','选择器没有命中当前形状的边');
    const unknown=candidates.filter(row=>row.sharp===null);
    if(unknown.length)fail('SELECTOR_UNCERTAIN',`边 ${unknown.map(row=>row.edgeId).join(', ')} 的尖锐度无法可靠测量`);
    const targets=candidates.filter(row=>row.sharp===true);
    if(!targets.length)fail('SELECTOR_EMPTY','选择范围没有尖边');
    return {targets,rows,skippedTangentEdgeIds:candidates.filter(row=>row.sharp===false).map(row=>row.edgeId),
      selectorReport:{kind,requested:chosen,resolvedEdgeIds:targets.map(row=>row.edgeId),resolvedFaceIds:[...new Set(targets.flatMap(row=>row.adjacentFaceIds))],sourceRevision:context?.provenance?.sourceRevision??null}};
  }finally{faces.forEach(dispose);edges.forEach(dispose);}
}
