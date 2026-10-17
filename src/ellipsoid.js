import {sewFaces} from './surface-repair.js';
const dispose=value=>{try{value?.delete?.();}catch{}};

// Tensor products of exact rational quarter circles form eight ellipsoid
// octants. This avoids an unsupported closed-surface seam in the WASM binding.
export function buildEllipsoid({radiiMm,centerMm=[0,0,0]}={},cad){
  if(!Array.isArray(radiiMm)||radiiMm.length!==3||radiiMm.some(v=>!Number.isFinite(v)||v<=0)||!Array.isArray(centerMm)||centerMm.length!==3||centerMm.some(v=>!Number.isFinite(v)))throw Object.assign(new Error('椭球需要三个正半径及有限中心坐标'),{code:'PARAM_SCHEMA_INVALID'});
  const oc=cad.getOC(),w=Math.SQRT1_2,circle=[[1,0],[1,1],[0,1]],faces=[];
  const array=(Type,values)=>{const out=new Type(1,values.length);values.forEach((value,i)=>out.SetValue(i+1,value));return out;};
  let solid;
  try{
    for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){
      let poles,weights,knots,mults,surface,maker,face;const points=[];
      try{
        poles=new oc.NCollection_Array2_gp_Pnt(1,3,1,3);weights=new oc.NCollection_Array2_double(1,3,1,3);
        for(let u=0;u<3;u++)for(let v=0;v<3;v++){
          const p=new oc.gp_Pnt(centerMm[0]+sx*radiiMm[0]*circle[u][0]*circle[v][0],centerMm[1]+sy*radiiMm[1]*circle[u][1]*circle[v][0],centerMm[2]+sz*radiiMm[2]*circle[v][1]);points.push(p);poles.SetValue(u+1,v+1,p);weights.SetValue(u+1,v+1,(u===1?w:1)*(v===1?w:1));
        }
        knots=array(oc.NCollection_Array1_double,[0,1]);mults=array(oc.NCollection_Array1_int,[3,3]);surface=new oc.Geom_BSplineSurface(poles,weights,knots,knots,mults,mults,2,2,false,false);
        maker=new oc.BRepBuilderAPI_MakeFace(surface,1e-7);if(!maker.IsDone())throw new Error('椭球有理面片构造失败');face=maker.Face();if(sx*sy*sz<0)face.Reverse();faces.push(cad.cast(face));face=null;
      }finally{[face,maker,surface,mults,knots,weights,poles,...points].forEach(dispose);}
    }
    solid=sewFaces({faces,tolerance:1e-7,makeSolid:true},cad);
    const properties=new oc.GProp_GProps();let volume;
    try{oc.BRepGProp.VolumePropertiesGK(solid.wrapped,properties,1e-9,true,true,false,false,false);volume=Math.abs(properties.Mass());}finally{dispose(properties);}
    const expected=4*Math.PI/3*radiiMm.reduce((a,b)=>a*b,1),relativeError=Math.abs(volume-expected)/expected;
    if(!Number.isFinite(volume)||relativeError>.005)throw new Error('椭球体积未通过解析校验');
    solid.ellipsoidReport={method:'exact-rational-quadratic-octants',faceCount:8,radiiMm:[...radiiMm],centerMm:[...centerMm],expectedVolumeMm3:expected,volumeMm3:volume,relativeVolumeError:relativeError};const out=solid;solid=null;return out;
  }finally{dispose(solid);faces.forEach(dispose);}
}
