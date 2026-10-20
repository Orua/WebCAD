// A planar junction R and a rolling-ball edge fillet are different geometry.
// The full-round envelope has an exact circular sweep of radius d/2 on a path
// of radius junctionR+d/2, plus the small planar core. This remains well-defined
// when a general edge fillet fails at the full section thickness.
export function buildProfileJunction(base,p,cad){
 const diameter=Number(p.sectionSize),bar=Number(p.barDiameter),radius=Number(p.jointRadius),offset=Number(p.barOffset??0);
 const a=(Number(p.innerWidth)+diameter)/2,q=radius+diameter/2;
 if(p.section!=='round'||bar!==diameter||!(radius>0)||!(q<a)||Math.abs(offset)+q>Number(p.innerHeight)/2-Number(p.innerRadius))throw Object.assign(new Error('平面 R 接头需要等径圆线和横杆、R>0，且接头完整位于外框直腿内。请缩小接头 R 或调整尺寸。'),{code:'PARAM_RANGE_INVALID'});
 const dispose=o=>{try{o?.delete?.();}catch{}};
 let result=cad.deserializeShape(base.serialize());
 try{
  for(const sx of [-1,1])for(const sy of [-1,1]){
   const resources=[],hold=o=>{resources.push(o);return o;};
   try{
    const point=angle=>[sx*(a-q+q*Math.cos(angle)),offset+sy*(q+q*Math.sin(angle)),0];
    const start=point(-Math.PI/2),middle=point(-Math.PI/4),end=point(0),corner=[sx*a,offset,0],r=diameter/2;
    const path=hold(cad.assembleWire([hold(cad.makeThreePointArc(start,middle,end))]));
    const section=hold(cad.assembleWire([hold(cad.makeCircle(r,start,[sx,0,0]))]));
    const tube=hold(cad.genericSweep(section,path,{frenet:false,transitionMode:'right'}));
    const wire=hold(cad.assembleWire([hold(cad.makeLine(start,corner)),hold(cad.makeLine(corner,end)),hold(cad.makeThreePointArc(end,middle,start))]));
    const face=hold(cad.makeFace(wire).translate([0,0,-r])),oc=cad.getOC(),vector=hold(new oc.gp_Vec(0,0,2*r));
    const maker=hold(new oc.BRepPrimAPI_MakePrism(face.wrapped,vector,false,true)),core=hold(cad.cast(maker.Shape()));
    for(const part of [core,tube]){const old=result;result=old.fuse(part);dispose(old);}
   }finally{resources.reverse().forEach(dispose);}
  }
  const checker=new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false),solids=result.solids;
  try{if(!checker.IsValid()||solids.length!==1||cad.measureVolume(result)<=cad.measureVolume(base))throw Object.assign(new Error('平面 R 接头未形成有效单实体，原参数保留。'),{code:'GEOMETRY_INVALID'});}finally{dispose(checker);solids.forEach(dispose);}
  const complete=result;result=null;return complete;
 }finally{dispose(result);}
}
