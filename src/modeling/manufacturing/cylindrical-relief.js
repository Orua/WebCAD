// A rational circular base with radial height controls. A declared base layer
// keeps zero-valued image areas off the coincident analytic cylinder surface.
const dispose=x=>{try{x?.delete?.();}catch{}};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
function array(values,kind,oc){const a=new oc[kind](1,values.length);values.forEach((v,i)=>a.SetValue(i+1,v));return a;}
function faceOf(surface,oc,cad){const m=new oc.BRepBuilderAPI_MakeFace(surface,1e-7);try{if(!m.IsDone())fail('RELIEF_INVALID','柱面曲面构造失败');return cad.cast(m.Face());}finally{dispose(m);}}
function sample(values,x,y){
 x=Math.max(0,Math.min(1,x))*(values[0].length-1);y=Math.max(0,Math.min(1,y))*(values.length-1);
 const i=Math.min(values[0].length-2,Math.floor(x)),j=Math.min(values.length-2,Math.floor(y)),u=x-i,v=y-j;
 return (1-v)*((1-u)*values[j][i]+u*values[j][i+1])+v*((1-u)*values[j+1][i]+u*values[j+1][i+1]);
}
function circularPatch(radius,width,height,cols,rows,oc){
 const owned=[],hold=x=>(owned.push(x),x),half=width/radius/2;
 try{
  const p=hold(new oc.NCollection_Array2_gp_Pnt(1,3,1,4)),w=hold(new oc.NCollection_Array2_double(1,3,1,4));
  for(let i=0;i<3;i++)for(let j=0;j<4;j++){
   const a=(i-1)*half,r=i===1?radius/Math.cos(half):radius,pt=new oc.gp_Pnt(r*Math.cos(a),r*Math.sin(a),(j/3-.5)*height);
   try{p.SetValue(i+1,j+1,pt);w.SetValue(i+1,j+1,i===1?Math.cos(half):1);}finally{dispose(pt);}
  }
  const k=hold(array([0,1],'NCollection_Array1_double',oc)),um=hold(array([3,3],'NCollection_Array1_int',oc)),vm=hold(array([4,4],'NCollection_Array1_int',oc));
  const s=new oc.Geom_BSplineSurface(p,w,k,k,um,vm,2,3,false,false);s.IncreaseDegree(3,3);
  for(let i=1;i<=cols-4;i++)s.InsertUKnot(i/(cols-3),1,1e-12,false);
  for(let i=1;i<=rows-4;i++)s.InsertVKnot(i/(rows-3),1,1e-12,false);
  return s;
 }finally{owned.reverse().forEach(dispose);}
}
function side(top,bottom,alongU,index,oc,cad){
 const count=alongU?top.NbUPoles():top.NbVPoles(),nk=alongU?top.NbUKnots():top.NbVKnots(),owned=[],hold=x=>(owned.push(x),x);
 try{
  const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,count,1,2)),weights=hold(new oc.NCollection_Array2_double(1,count,1,2));
  for(let k=1;k<=count;k++)for(let j=1;j<=2;j++){const u=alongU?k:index,v=alongU?index:k,s=j===1?top:bottom,p=s.Pole(u,v);try{poles.SetValue(k,j,p);weights.SetValue(k,j,s.Weight(u,v));}finally{dispose(p);}}
  const knots=hold(array(Array.from({length:nk},(_,i)=>alongU?top.UKnot(i+1):top.VKnot(i+1)),'NCollection_Array1_double',oc)),mults=hold(array(Array.from({length:nk},(_,i)=>alongU?top.UMultiplicity(i+1):top.VMultiplicity(i+1)),'NCollection_Array1_int',oc));
  const linear=hold(array([0,1],'NCollection_Array1_double',oc)),ends=hold(array([2,2],'NCollection_Array1_int',oc));
  const s=hold(new oc.Geom_BSplineSurface(poles,weights,knots,linear,mults,ends,alongU?top.UDegree():top.VDegree(),1,false,false));return faceOf(s,oc,cad);
 }finally{owned.reverse().forEach(dispose);}
}
export function cylindricalReliefTool(face,p,oc,cad){
 if(face.geomType!=='CYLINDRE')fail('RELIEF_UNSUPPORTED','浮雕目前支持平面和外凸圆柱面');
 if(!Array.isArray(p.point)||p.point.length!==3||p.point.some(v=>!Number.isFinite(v)))fail('RELIEF_UNSUPPORTED','柱面浮雕需要在目标面点击放置点');
 if(!(p.baseMm>=.005&&p.baseMm<=1))fail('RELIEF_LIMIT','柱面需要明确的 0.005–1 mm 基底层厚度');
 if((p.angleDeg??0)!==0)fail('RELIEF_UNSUPPORTED','柱面浮雕暂不支持图案旋转，请设为 0°');
 const owned=[],hold=x=>(owned.push(x),x);let tool;
 try{
  const adapter=hold(new oc.BRepAdaptor_Surface(face.wrapped,true)),cylinder=hold(adapter.Cylinder()),axes=hold(cylinder.Position());
  const tuple=point=>{try{return [point.X(),point.Y(),point.Z()];}finally{dispose(point);}};
  const radius=cylinder.Radius(),origin=tuple(axes.Location()),x=tuple(axes.XDirection()),y=tuple(axes.YDirection()),z=tuple(axes.Direction());
  if(radius<1||radius>10000||p.widthMm/radius>Math.PI/2||p.depthMm+p.baseMm>radius*.2)fail('RELIEF_LIMIT','柱面半径须为 1–10000 mm，图案角宽≤90°，总起伏≤半径的20%');
  const anchor=hold(cad.makeVertex(p.point)),query=hold(new cad.DistanceQuery(face));
  if(query.distanceTo(anchor)>.1)fail('RELIEF_OUTSIDE_FACE','放置点不在目标柱面内（允许0.1 mm显示网格吸附）');
  const snapped=tuple(query.wrapped.PointOnShape1(1)),local=snapped.map((v,i)=>v-origin[i]),theta=Math.atan2(dot(local,y),dot(local,x))+(p.offsetX??0)/radius,heightCenter=dot(local,z)+(p.offsetY??0);
  const radial=x.map((v,i)=>v*Math.cos(theta)+y[i]*Math.sin(theta)),center=origin.map((v,i)=>v+heightCenter*z[i]),point=center.map((v,i)=>v+radius*radial[i]);
  const shifted=hold(cad.makeVertex(point));if(cad.measureDistanceBetween(face,shifted)>1e-5)fail('RELIEF_OUTSIDE_FACE','偏移后的图案中心超出有限柱面');
  const normal=hold(face.normalAt(point)).toTuple();if(dot(normal,radial)/Math.hypot(...normal)<.999)fail('RELIEF_UNSUPPORTED','当前仅支持外凸柱面，不支持内孔柱面');
  const rows=p.values.length,cols=p.values[0].length,base=hold(circularPatch(radius,p.widthMm,p.heightMm,cols,rows,oc));
  const mapping=hold(new cad.Transformation().coordSystemChange({origin:center,xDir:radial,zDir:z},'reference'));
  const baseFace=hold(faceOf(base,oc,cad)),footprint=hold(cad.cast(mapping.transform(baseFace.wrapped))),edges=face.edges;owned.push(...edges);
  for(const edge of edges)if(cad.measureDistanceBetween(footprint,edge)<=1e-5)fail('RELIEF_OUTSIDE_FACE','图案跨越柱面边界、接缝或孔，请缩小或移动');
  const top=hold(new oc.Geom_BSplineSurface(base)),bottom=hold(new oc.Geom_BSplineSurface(base)),sign=p.mode==='engrave'?-1:1,half=p.widthMm/radius/2;
  for(let i=1;i<=base.NbUPoles();i++)for(let j=1;j<=base.NbVPoles();j++){
   const q=base.Pole(i,j),a=q.X(),b=q.Y(),c=q.Z(),h=p.baseMm+p.depthMm*sample(p.values,(Math.atan2(b,a)+half)/(2*half),c/p.heightMm+.5);
   const t=new oc.gp_Pnt(a*(1+sign*h/radius),b*(1+sign*h/radius),c),floor=new oc.gp_Pnt(a*(1-sign*.001/radius),b*(1-sign*.001/radius),c);
   try{top.SetPole(i,j,t);bottom.SetPole(i,j,floor);}finally{[q,t,floor].forEach(dispose);}
  }
  const faces=[hold(faceOf(top,oc,cad)),hold(faceOf(bottom,oc,cad)),hold(side(top,bottom,true,1,oc,cad)),hold(side(top,bottom,true,rows,oc,cad)),hold(side(top,bottom,false,1,oc,cad)),hold(side(top,bottom,false,cols,oc,cad))];
  const localTool=hold(cad.makeSolid(faces));tool=cad.cast(mapping.transform(localTool.wrapped));
  if(!(tool instanceof cad.Solid)||!oc.BRepLib.OrientClosedSolid(tool.wrapped))fail('RELIEF_INVALID','柱面浮雕刀具未闭合');
  const out=tool;tool=null;return {tool:out,report:{kind:'cylindrical-bspline-heightfield',radiusMm:radius,baseMm:p.baseMm,totalControlHeightMm:p.baseMm+p.depthMm,origin:point,normal:radial,axis:z,limitations:['outer-cylinder-only','full-rectangle-base-layer','maximum-angle-90-degrees','no-image-rotation','image-brightness-is-not-photo-depth']}};
 }finally{dispose(tool);owned.reverse().forEach(dispose);}
}
