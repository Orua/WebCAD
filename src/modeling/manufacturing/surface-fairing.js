import {binaryHash} from '../../contracts/operation-schema.js';
import {makeSurfaceFairingField} from './surface-fairing-field.js';
import {remapStepZ} from './surface-fairing-step.js';

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const count=(shape,key)=>{const parts=shape[key];try{return parts.length;}finally{parts.forEach(part=>part.delete());}};

function topology(shape,cad,oc){
  const shells=[...cad.iterTopo(shape.wrapped,'shell')];
  try{return {solidCount:count(shape,'solids'),faceCount:count(shape,'faces'),closed:shells.length===1&&oc.BRep_Tool.IsClosed(shells[0])};}
  finally{shells.forEach(shell=>shell.delete());}
}

function cylinders(shape,cad,oc){
  const faces=shape.faces, signatures=[];
  try{
    for(const face of faces){
      const adaptor=new oc.BRepAdaptor_Surface(face.wrapped,true);
      try{
        if(adaptor.GetType()!==oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)continue;
        const cylinder=adaptor.Cylinder();
        try{
          const center=cylinder.Location(), axis=cylinder.Axis();
          try{
            const direction=axis.Direction();
            try{
              const vertices=Array.from(cad.iterTopo(face.wrapped,'vertex'),vertex=>cad.cast(vertex));
              try{
                const points=vertices.map(vertex=>vertex.asTuple());
                signatures.push({axis:[cylinder.Radius(),center.X(),center.Y(),center.Z(),direction.X(),direction.Y(),direction.Z()],points});
              }finally{vertices.forEach(vertex=>vertex.delete());}
            }finally{direction.delete();}
          }finally{center.delete();axis.delete();}
        }finally{cylinder.delete();}
      }finally{adaptor.delete();}
    }
    return signatures;
  }finally{faces.forEach(face=>face.delete());}
}

function sameSet(before,after,match){
  if(before.length!==after.length)return false;
  const remaining=after.slice();
  for(const entry of before){
    const i=remaining.findIndex(other=>match(entry,other));
    if(i<0)return false;
    remaining.splice(i,1);
  }
  return true;
}
const near=(a,b)=>a.every((value,i)=>Math.abs(value-b[i])<0.002);

export async function buildSurfaceFairing(source,bytes,params,cad,oc,progress=()=>{}){
  const sha256=binaryHash(bytes).slice(7);
  if(sha256!==params.field.sourceSha256)fail('FAIRING_SOURCE_MISMATCH','修顺配方与当前 STEP 文件的 SHA-256 不一致');
  if(bytes.length>48*1024*1024)fail('FAIRING_SOURCE_UNSUPPORTED','原始 STEP 超过 48 MiB 修顺容量');
  const before=topology(source,cad,oc);
  if(before.solidCount!==1||!before.closed||before.faceCount>400)fail('FAIRING_SOURCE_UNSUPPORTED','需要一个不超过 400 面的有效封闭 STEP 实体');
  progress('平滑源件高度位移场');
  const field=makeSurfaceFairingField(params);
  progress('重拟合 STEP 曲面和共边');
  const revised=remapStepZ(new TextDecoder().decode(bytes),field.shift);
  let shape;
  try{
    progress('回读闭合曲面实体');
    shape=await cad.importSTEP(new Blob([revised.text]));
    const after=topology(shape,cad,oc);
    if(!after.closed||after.solidCount!==1||after.faceCount!==before.faceCount)fail('FAIRING_INVALID_SOLID','重拟合后的曲面未形成与源件对应的闭合单实体');
    const cylindersBefore=cylinders(source,cad,oc);
    if(!sameSet(cylindersBefore,cylinders(shape,cad,oc),(a,b)=>near(a.axis,b.axis)&&sameSet(a.points,b.points,near)))fail('FAIRING_INVALID_SOLID','圆柱孔或柱的几何发生变化');
    shape.surfaceFairingReport={sourceSha256:sha256,method:'gaussian-xy-step-z-refit',smoothingMm:params.smoothingMm,
      ...revised.stats,...field.stats,unchangedCylinderFaces:cylindersBefore.length,before,after};
    return shape;
  }catch(error){shape?.delete();throw error;}
}
