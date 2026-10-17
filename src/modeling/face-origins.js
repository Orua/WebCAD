import * as cad from 'replicad';
const dispose=v=>{try{v?.delete?.();}catch{}};
const pendingOrigins=new WeakMap();
function ensureOrigins(shape){const signatures=pendingOrigins.get(shape);if(signatures){pendingOrigins.delete(shape);restoreFaceOrigins(shape,signatures);}}
function key(face){
  const center=face.center,box=face.boundingBox;
  try{return JSON.stringify([face.geomType,...center.toTuple(),cad.measureArea(face),...box.bounds.flat()].map(x=>typeof x==='number'?Math.round(x*1e7)/1e7:x));}
  finally{dispose(center);dispose(box);}
}
export function originSignatures(shape){
  ensureOrigins(shape);
  const faces=shape.faces;try{return faces.map((f,i)=>({key:key(f),origin:shape.faceOrigins?.[i]??null}));}finally{faces.forEach(dispose);}
}
export function restoreFaceOrigins(shape,signatures,{defer=false}={}){
  if(defer){pendingOrigins.set(shape,signatures);return;}
  const map=new Map(),duplicates=new Set();for(const row of signatures||[]){if(map.has(row.key))duplicates.add(row.key);else map.set(row.key,row.origin);}
  const parsed=(signatures||[]).map(row=>({...row,values:JSON.parse(row.key)}));
  const faces=shape.faces;try{shape.faceOrigins=faces.map(f=>{
    const k=key(f);if(duplicates.has(k))return null;if(map.has(k))return map.get(k);
    // BRep serialization can round a surface centroid across the quantization
    // boundary. Surface-area integration also drifts after serialization (it
    // has squared length units). Require a unique match with 1 um coordinate
    // tolerance and 1 ppm area tolerance, never saved face ordering.
    const values=JSON.parse(k),matches=parsed.filter(row=>row.values.length===values.length&&row.values.every((v,i)=>typeof v==='number'?Math.abs(v-values[i])<=Math.max(1e-6,Math.abs(v)*(i===4?1e-6:1e-9)):v===values[i]));
    return matches.length===1?matches[0].origin:null;
  });}finally{faces.forEach(dispose);}
}
export function copyFaceOrigins(source,target){ensureOrigins(source);if(source.faceOrigins)restoreFaceOrigins(target,originSignatures(source));return target;}
export function initializeFaceOrigins(shape,feature){
  if(shape.geometryType==='mesh'||shape.faceOrigins||pendingOrigins.has(shape))return;
  const faces=shape.faces;try{shape.faceOrigins=faces.map(face=>({featureId:feature.id,role:face.geomType==='PLANE'?'cap':'side'}));}finally{faces.forEach(dispose);}
}
// This mapping exists only for the current BRep. Checkpoints store geometry
// signatures and semantic labels, never topology indices or OCCT pointers.
export function booleanFaceOrigins(inputs,result,builder){
  const faces=result.faces,labels=faces.map(()=>new Map()),oc=cad.getOC();
  const match=(raw,origin)=>{for(let i=0;i<faces.length;i++)if(faces[i].wrapped.IsSame(raw)&&origin){for(const id of origin.featureIds||[origin.featureId])if(id)labels[i].set(id,origin.role||'side');}};
  try{
    for(const input of inputs){
      ensureOrigins(input);
      const originals=input.faces;
      try{originals.forEach((face,i)=>{
        const origin=input.faceOrigins?.[i];match(face.wrapped,origin);
        for(const method of ['Modified','Generated']){
          const history=builder[method](face.wrapped);let copy;
          try{copy=new oc.NCollection_List_TopoDS_Shape(history);while(!copy.IsEmpty()){const item=copy.First();try{match(item,origin);}finally{dispose(item);}copy.RemoveFirst();}}
          finally{dispose(copy);dispose(history);}
        }
      });}finally{originals.forEach(dispose);}
    }
    result.faceOrigins=labels.map(map=>map.size===1?{featureId:[...map.keys()][0],role:[...map.values()][0]}:map.size?{featureIds:[...map.keys()],role:'mixed'}:null);
    return result;
  }finally{faces.forEach(dispose);}
}
export const blendContext=shape=>{ensureOrigins(shape);return {sourceShape:shape,provenance:{faceOrigins:shape.faceOrigins,sourceRevision:'current-rebuild'}};};
export function cutWithFaceOrigins(target,tool){
  const oc=cad.getOC();let builder,args,tools,progress,result;
  try{
    builder=new oc.BRepAlgoAPI_Cut();args=new oc.NCollection_List_TopoDS_Shape();tools=new oc.NCollection_List_TopoDS_Shape();args.Append(target.wrapped);tools.Append(tool.wrapped);builder.SetArguments(args);builder.SetTools(tools);builder.SetNonDestructive(true);builder.SetRunParallel(false);
    progress=new oc.Message_ProgressRange();builder.Build(progress);if(!builder.IsDone()||builder.HasErrors())throw Object.assign(new Error('切除运算未完成，原模型保留'),{code:'GEOMETRY_INVALID'});builder.SimplifyResult(true,true,1e-7);result=cad.cast(builder.Shape());booleanFaceOrigins([target,tool],result,builder);const output=result;result=null;return output;
  }finally{[result,progress,tools,args,builder].forEach(dispose);}
}
