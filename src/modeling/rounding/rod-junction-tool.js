import {makeRodJunctionFaces} from './rod-junction.js';
const dispose=x=>{try{x?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const xyz=p=>[p.X(),p.Y(),p.Z()];
const fail=message=>{throw Object.assign(new Error(message),{code:'GEOMETRY_INVALID'});};

/** Local replacement of one explicitly selected straight, equal-wire T junction. */
export function buildRodJunction(source,p,oc,cad){
 const held=[],hold=x=>(held.push(x),x),faces=source.faces;faces.forEach(hold);let result;
 try{
  const solids=source.solids;solids.forEach(hold);if(solids.length!==1)fail('圆杆接头需要一个封闭实体。');const sourceSolid=solids[0];
  const ids=p.faceIds;
  if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1]||ids.some(i=>!Number.isInteger(i)||!faces[i])||!(p.radiusMm>0)||p.radiusMm>20)fail('请明确选择同一实体上的两张圆柱面，并设置 0～20 mm 的正 R。第一张为贯通主杆，第二张为支杆。');
  const cylinder=face=>{const a=hold(new oc.BRepAdaptor_Surface(face.wrapped,true));if(a.GetType()!==oc.GeomAbs_SurfaceType.GeomAbs_Cylinder)fail('所选面须为直圆柱面；不支持圆锥、环面、样条面或已经加工的接头面。');const c=hold(a.Cylinder()),axis=hold(c.Axis()),location=hold(axis.Location()),direction=hold(axis.Direction());return {r:c.Radius(),o:xyz(location),v:xyz(direction)};};
  const main=cylinder(faces[ids[0]]),bar=cylinder(faces[ids[1]]),r=main.r,R=p.radiusMm,L=5*(r+R)/3;
  if(Math.abs(r-bar.r)>1e-7||Math.abs(dot(main.v,bar.v))>1e-8||r>20)fail('当前只支持等径、轴线垂直且相交的圆杆 T 接头，线径≤40 mm。');
  const delta=sub(bar.o,main.o),node=add(main.o,mul(main.v,dot(delta,main.v))),toBar=sub(node,bar.o),axisDistance=Math.hypot(...sub(toBar,mul(bar.v,dot(toBar,bar.v))));
  if(axisDistance>1e-7)fail('两根圆杆轴线不相交；不会移动来源或猜测连接位置。');
  // DistShapeShape includes the solid interior; the WASM binding does not
  // expose SolidClassifier. These probes lie on the cylinder axes, away from
  // the periodic seam/torus surface extrema involved in source comparison.
  const inside=point=>{const vertex=hold(cad.makeVertex(point)),distance=hold(new oc.BRepExtrema_DistShapeShape());distance.LoadS1(sourceSolid.wrapped);distance.LoadS2(vertex.wrapped);distance.Perform();if(!distance.IsDone())fail('无法判定圆杆在连接点的延伸方向。');return distance.InnerSolution()||distance.Value()<=1e-7;};
  const positive=inside(add(node,mul(bar.v,L))),negative=inside(add(node,mul(bar.v,-L)));
  if(positive===negative||!inside(add(node,mul(main.v,L)))||!inside(add(node,mul(main.v,-L))))fail('接头须为一支杆、两侧贯通主杆的 T 形；接头空间不足、交叉杆或邻近框角不支持。');
  const X=mul(bar.v,positive?-1:1),Y=main.v,Z=cross(X,Y),map=point=>add(node,add(mul(X,point[0]),add(mul(Y,point[1]),mul(Z,point[2]))));
  const pad=Math.max(r,R,1)*.01,box=hold(cad.makeBox([-L,-L,-r-pad],[r+pad,L,r+pad])),mapping=hold(new cad.Transformation().coordSystemChange({origin:node,xDir:X,zDir:Z},'reference')),cutter=hold(cad.cast(mapping.transform(box.wrapped))),patch=hold(source.intersect(cutter));
  const capCenters=[map([-L,0,0]),map([0,-L,0]),map([0,L,0])],capNormals=[X,Y,Y],capFor=face=>{
   const a=hold(new oc.BRepAdaptor_Surface(face.wrapped,true));if(a.GetType()!==oc.GeomAbs_SurfaceType.GeomAbs_Plane)return -1;
   const plane=hold(a.Plane()),axis=hold(plane.Axis()),n=xyz(hold(axis.Direction())),o=xyz(hold(plane.Location())),bounds=hold(face.boundingBox).bounds,center=bounds[0].map((x,i)=>(x+bounds[1][i])/2);
   return capCenters.findIndex((c,i)=>Math.abs(Math.abs(dot(n,capNormals[i]))-1)<1e-8&&Math.abs(dot(sub(o,c),n))<1e-7&&Math.hypot(...sub(center,c))<=r+1e-7);
  };
  for(const face of patch.faces){hold(face);const a=hold(new oc.BRepAdaptor_Surface(face.wrapped,true));if(a.GetType()===oc.GeomAbs_SurfaceType.GeomAbs_Plane){if(capFor(face)<0)fail('接头局部包含端面或其它结构，无法保持来源。');}else{const c=cylinder(face);if(Math.abs(c.r-r)>1e-7||Math.max(Math.abs(dot(c.v,X)),Math.abs(dot(c.v,Y)))<1-1e-8)fail('局部包含其它圆杆或形状，不支持此次加工。');}}
  const remainder=hold(source.cut(cutter)),capAreas=[0,0,0],sewing=hold(new oc.BRepBuilderAPI_Sewing(1e-7,true,false,true,false));
  for(const face of remainder.faces){hold(face);const cap=capFor(face);if(cap>=0)capAreas[cap]+=cad.measureArea(face);else sewing.Add(face.wrapped);}
  if(capAreas.some(a=>Math.abs(a-Math.PI*r*r)>Math.max(1e-6,Math.PI*r*r*1e-6)))fail('接头边界不是三个完整圆截面；来源未改变。');
  const junction=makeRodJunctionFaces(cad,{wireRadius:r,radius:R,reach:L,map});junction.faces.forEach(f=>{hold(f);sewing.Add(f.wrapped);});sewing.Perform();
  if(sewing.NbFreeEdges()||sewing.NbMultipleEdges())fail('圆杆接头未闭合；原工程保留，不放宽公差。');
  const shells=Array.from(cad.iterTopo(sewing.SewedShape(),'shell'),s=>hold(cad.cast(s)));if(shells.length!==1)fail('接头结果不是单一封闭壳。');
  const maker=hold(new oc.BRepBuilderAPI_MakeSolid(shells[0].wrapped));if(!maker.IsDone())fail('接头无法形成实体。');result=cad.cast(maker.Shape());
  const checker=hold(new oc.BRepCheck_Analyzer(result.wrapped,true,false,false));if(!oc.BRepLib.OrientClosedSolid(result.wrapped)||!checker.IsValid()||cad.measureVolume(result)<=cad.measureVolume(source))fail('接头实体或加料方向不正确，原工程保留。');
  result.sourceJunctionReport={...junction.report,style:'rodJunction',junctionCount:1,sourceFaceIds:[...ids],centerMm:node,barDirection:mul(X,-1),mainDirection:Y,localBounds:{min:[-L,-L,-r],max:[r,L,r]},outsideRegion:'original BRep faces preserved'};
  const complete=result;result=null;return complete;
 }finally{dispose(result);held.reverse().forEach(dispose);}
}
