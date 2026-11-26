import {sewFaces} from '../../surface-repair.js';
import {curveReader,fail,maxDistance,readShape,scope} from './exact-input.js';

function boundary(faces,tolerance,oc,cad,hold) {
  const sewing=hold(new oc.BRepBuilderAPI_Sewing(tolerance,true,false,false,false));
  faces.forEach(face=>sewing.Add(face.wrapped));sewing.Perform();
  if(sewing.NbMultipleEdges()!==0)fail('FREEFORM_REPLACE','替换区域含非流形边。');
  return Array.from({length:sewing.NbFreeEdges()},(_,i)=>hold(cad.cast(sewing.FreeEdge(i+1))));
}

export function replaceSurfacePatch(sources,params,cad) {
  const {hold,close}=scope(), oc=cad.getOC(), toleranceMm=params.toleranceMm??.01, cache=new Map();
  try {
    const removed=new Set(params.removeFaceIds), original=sources[0];
    const originals=original?.solids?.map(hold)??[];
    if(originals.length!==1)fail('FREEFORM_REPLACE','换面来源须是单一实体。');
    const faces=original.faces.map(hold);
    if (removed.size!==params.removeFaceIds.length || removed.size===faces.length || [...removed].some(id=>!faces[id])) {
      fail('FREEFORM_REPLACE','请选择实体上需要换掉且互不重复的面，保留其余面。');
    }
    const add=params.patches.map(item=>{
      if(item.refIndex===0)fail('FREEFORM_REPLACE','替换面须来自独立的曲面对象。');
      return readShape(sources,item,'faces',hold,cache);
    });
    if(add.some((face,i)=>add.slice(0,i).some(other=>face.wrapped.IsSame(other.wrapped)))) {
      fail('FREEFORM_REPLACE','同一张替换面只需选一次。');
    }
    const oldBoundary=boundary([...removed].map(id=>faces[id]),toleranceMm,oc,cad,hold);
    const newBoundary=boundary(add,toleranceMm,oc,cad,hold);
    if(!oldBoundary.length||!newBoundary.length)fail('FREEFORM_REPLACE','待换区域和新面必须各有能够核对的开放边界。');
    const samples=edges=>edges.flatMap(edge=>{
      const reader=curveReader(edge,oc,hold);
      return Array.from({length:17},(_,i)=>reader.at(i/16));
    });
    const oldWire=hold(cad.makeCompound(oldBoundary.map(edge=>edge.clone())));
    const newWire=hold(cad.makeCompound(newBoundary.map(edge=>edge.clone())));
    const boundaryDeviationMm=Math.max(maxDistance(samples(oldBoundary),newWire,cad),maxDistance(samples(newBoundary),oldWire,cad));
    if (!(boundaryDeviationMm<=toleranceMm)) fail('FREEFORM_TOLERANCE','替换面的外缘或孔圈偏离原边界超过公差。');
    const retained=faces.filter((_,i)=>!removed.has(i));
    let solid;
    try {solid=sewFaces({faces:[...retained,...add],tolerance:toleranceMm,makeSolid:true},cad);}
    catch(error){fail('FREEFORM_REPLACE',`换面不能缝回有效单一实体：${error.message}`);}
    const outputFaces=solid.faces;
    try{
      if(outputFaces.length!==retained.length+add.length){
        solid.delete();fail('FREEFORM_REPLACE','缝合改变了选定范围以外的面数。');
      }
    }finally{outputFaces.forEach(face=>face.delete());}
    solid.freeformReport={removedFaceCount:removed.size,replacementFaceCount:add.length,retainedFaceCount:retained.length,
      originalBoundaryEdgeCount:oldBoundary.length,boundaryDeviationMm,toleranceMm};
    return solid;
  } finally {close();}
}
