// A rational circular base with radial height controls. A declared base layer
// keeps zero-valued image areas off the coincident analytic cylinder surface.
import {validateLocalPatch} from '../../relief-local-patch.js';
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
function localPatchSolid(radius,domain,crest,floor,delta,center,radial,axis,tangent,oc,cad){
 const owned=[],hold=x=>(owned.push(x),x),rows=delta.length,cols=delta[0].length,[u0,v0,u1,v1]=domain,theta=(u0+u1)/2/radius,localRadial=radial.map((x,i)=>x*Math.cos(theta)+tangent[i]*Math.sin(theta)),localCenter=center.map((x,i)=>x+(v0+v1)/2*axis[i]);
 try{
  const base=hold(circularPatch(radius,u1-u0,v1-v0,cols,rows,oc)),top=hold(new oc.Geom_BSplineSurface(base)),bottom=hold(new oc.Geom_BSplineSurface(base));
  for(let i=1;i<=cols;i++)for(let j=1;j<=rows;j++){const q=base.Pole(i,j),h=crest+delta[j-1][i-1],t=new oc.gp_Pnt(q.X()*(1+h/radius),q.Y()*(1+h/radius),q.Z()),b=new oc.gp_Pnt(q.X()*(1+floor/radius),q.Y()*(1+floor/radius),q.Z());try{top.SetPole(i,j,t);bottom.SetPole(i,j,b);}finally{[q,t,b].forEach(dispose);}}
  const faces=[hold(faceOf(top,oc,cad)),hold(faceOf(bottom,oc,cad)),hold(side(top,bottom,true,1,oc,cad)),hold(side(top,bottom,true,rows,oc,cad)),hold(side(top,bottom,false,1,oc,cad)),hold(side(top,bottom,false,cols,oc,cad))],solid=hold(cad.makeSolid(faces)),mapping=hold(new cad.Transformation().coordSystemChange({origin:localCenter,xDir:localRadial,zDir:axis},'reference')),result=cad.cast(mapping.transform(solid.wrapped));
  if(!(result instanceof cad.Solid)||!oc.BRepLib.OrientClosedSolid(result.wrapped)){dispose(result);fail('RELIEF_PATCH_INVALID','局部柱面精修刀具未闭合');}return result;
 }finally{owned.reverse().forEach(dispose);}
}
function protectedPatch(p,patch,radius,crest){
 const [u0,v0,u1,v1]=patch.domainMm,maxDelta=Math.max(...patch.deltaMm.flat()),minDelta=Math.min(...patch.deltaMm.flat()),radialMin=radius+crest+Math.min(0,minDelta),radialMax=radius+crest+Math.max(0,maxDelta),xs=[radialMin*Math.sin(u0/radius),radialMin*Math.sin(u1/radius),radialMax*Math.sin(u0/radius),radialMax*Math.sin(u1/radius)],x0=Math.min(...xs),x1=Math.max(...xs),rect=[[x0,v0],[x1,v0],[x1,v1],[x0,v1]],guard=patch.protectionMm;
 const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);},inside=(point,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 const project=ring=>ring.map(([x,y])=>[radius*Math.sin(x*p.widthMm/radius),y*p.heightMm]);
 const inBox=q=>q[0]>=x0-guard&&q[0]<=x1+guard&&q[1]>=v0-guard&&q[1]<=v1+guard;
 const fits=(p.regions??[]).some(region=>{const rings=[project(region.outer),...(region.holes??[]).map(project)];if(!rect.every(q=>inside(q,rings[0])&&!rings.slice(1).some(r=>inside(q,r))))return false;for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(inBox(a)||inBox(b))return false;for(let k=0;k<4;k++){const c=rect[k],d=rect[(k+1)%4];const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(orient(a,b,c)*orient(a,b,d)<=0&&orient(c,d,a)*orient(c,d,b)<=0)return false;if(Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<guard)return false;}}return true;});
 if(!fits)fail('RELIEF_PATCH_PROTECTION','局部域及保护带跨越轮廓或孔；请选择更小的内部域');
}
// A source projection LINE intersects the cylinder in a rational spatial curve.
// Shearing the exact circular poles by y=m*x+b keeps that common boundary exact.
// Cubic transverse controls [low,low,high,high] meet both cylinders tangentially.
// Two unchanged pole columns at either end fade into the original crest; only
// the central third-to-two-thirds strip claims the lower-cylinder G1 connection.
export function straightShoulderCutter(frame,{start,end,lowHeightMm,highHeightMm,widthMm},oc,cad){
 const {radius:R,normal,axis,origin}=frame;
 if(![R,lowHeightMm,highHeightMm,widthMm,...start,...end].every(Number.isFinite)||R<1||lowHeightMm<0||highHeightMm<=lowHeightMm||highHeightMm>20||widthMm<.02||widthMm>10)fail('RELIEF_SHOULDER_INVALID','明确毫米肩带、高低承托与直线端点');
 const dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy),m=dy/dx;
 if(Math.abs(dx)<.02||Math.abs(m)>4||length<widthMm*4)fail('RELIEF_SHOULDER_UNSUPPORTED','首版肩带需要无分叉的投影直线，斜率绝对值≤4且长度至少四倍带宽');
 const b=start[1]-m*start[0],offset=Math.sign(dx)*widthMm*Math.sqrt(1+m*m),tangent=[axis[1]*normal[2]-axis[2]*normal[1],axis[2]*normal[0]-axis[0]*normal[2],axis[0]*normal[1]-axis[1]*normal[0]],center=origin.map((v,i)=>v-R*normal[i]),angles=[Math.asin(start[0]/(R+lowHeightMm)),Math.asin(end[0]/(R+lowHeightMm))],theta=(angles[0]+angles[1])/2,span=Math.abs(angles[1]-angles[0])*R,radial=normal.map((v,i)=>v*Math.cos(theta)+tangent[i]*Math.sin(theta)),owned=[],hold=x=>(owned.push(x),x);
 if(!Number.isFinite(span)||span<=1e-7||span/R>Math.PI/2)fail('RELIEF_SHOULDER_INVALID','肩带角范围越界');
 try{
  const cols=9,rows=4,base=hold(circularPatch(R,span,1,cols,rows,oc)),top=hold(new oc.Geom_BSplineSurface(base)),bottom=hold(new oc.Geom_BSplineSurface(base));
  for(let i=1;i<=cols;i++)for(let j=1;j<=rows;j++){
   const pole=base.Pole(i,j),fade=i<=2||i>=cols-1?0:1,low=highHeightMm-(highHeightMm-lowHeightMm)*fade*(j<=2?1:0),make=h=>{const scale=1+h/R,x=pole.X()*scale,y=pole.Y()*scale,projectedX=x*Math.sin(theta)+y*Math.cos(theta);return new oc.gp_Pnt(x,y,m*projectedX+b+offset*(j-1)/3);},a=make(highHeightMm+.001),z=make(low);
   try{top.SetPole(i,j,a);bottom.SetPole(i,j,z);}finally{[pole,a,z].forEach(dispose);}
  }
  const faces=[hold(faceOf(top,oc,cad)),hold(faceOf(bottom,oc,cad)),hold(side(top,bottom,true,1,oc,cad)),hold(side(top,bottom,true,rows,oc,cad)),hold(side(top,bottom,false,1,oc,cad)),hold(side(top,bottom,false,cols,oc,cad))],solid=hold(cad.makeSolid(faces)),mapping=hold(new cad.Transformation().coordSystemChange({origin:center,xDir:radial,zDir:axis},'reference')),result=cad.cast(mapping.transform(solid.wrapped));
  if(!(result instanceof cad.Solid)||!oc.BRepLib.OrientClosedSolid(result.wrapped)){dispose(result);fail('RELIEF_SHOULDER_INVALID','连续肩带刀具未形成有效封闭实体');}return {tool:result,report:{kind:'rational-cubic-straight-shoulder',fixedRadius:false,widthMm,lowHeightMm,highHeightMm,sourceProjectionLine:{start,end},centralContinuityRange:[1/3,2/3],outerEndPolicy:'fade-to-original-crest; original step retained outside central shoulder',kernelTopOverlapMm:.001}};
 }finally{owned.reverse().forEach(dispose);}
}
export function cylindricalReliefTool(face,p,oc,cad,{sculptFlat=false,startHeightMm=0}={}){
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
  const shifted=hold(cad.makeVertex(point));if(!p.regions&&!p.strokes&&cad.measureDistanceBetween(face,shifted)>1e-5)fail('RELIEF_OUTSIDE_FACE','偏移后的图案中心超出有限柱面');
  const normal=hold(face.normalAt(point)).toTuple();if(dot(normal,radial)/Math.hypot(...normal)<.999)fail('RELIEF_UNSUPPORTED','当前仅支持外凸柱面，不支持内孔柱面');
  const tangent=[z[1]*radial[2]-z[2]*radial[1],z[2]*radial[0]-z[0]*radial[2],z[0]*radial[1]-z[1]*radial[0]];
  const frame={normal:radial,radius,axis:z,origin:point,point:(u,v,h)=>point.map((n,i)=>n+radius*Math.sin(u/radius)*tangent[i]+v*z[i]+h*radial[i])};
  const anchorNormal=hold(face.normalAt(snapped)).toTuple(),normalLength=Math.hypot(...anchorNormal);
  const report={kind:'cylindrical-bspline-heightfield',radiusMm:radius,baseMm:p.baseMm,totalControlHeightMm:p.baseMm+p.depthMm,origin:point,normal:radial,axis:z,sourceSelection:{point:snapped,normal:anchorNormal.map(v=>v/normalLength),reference:'original clicked trimmed support; image center may lie in a source opening'},limitations:['outer-cylinder-only','full-rectangle-base-layer','maximum-angle-90-degrees','no-image-rotation','image-brightness-is-not-photo-depth']};
  if(p.localPatches&&(!(p.regions?.length)||p.mode==='engrave'||p.surfaceMode==='flat'||sculptFlat||p.sculpt||!p.values.every(row=>row.every(v=>v===1))))fail('RELIEF_PATCH_UNSUPPORTED','独立局部域目前需要等高外凸柱面轮廓层');
  // A uniform vector layer has an exact cylindrical crest. Avoid converting it
  // into a spline before every small letter/ornament boolean.
  if((p.regions||p.strokes)&&p.surfaceMode!=='flat'&&!sculptFlat&&p.values.every(row=>row.every(v=>v===p.values[0][0]))){
   const h=p.baseMm+p.depthMm*p.values[0][0],positive=p.mode!=='engrave',start=center.map((v,i)=>v-p.heightMm*.5*z[i]);
   const location=hold(new oc.gp_Pnt(...start)),axis=hold(new oc.gp_Dir(...z)),back=hold(new oc.gp_Dir(...radial.map(v=>-v))),placement=hold(new oc.gp_Ax2(location,axis,back));
   const cylinder=r=>{const builder=hold(new oc.BRepPrimAPI_MakeCylinder(placement,r,p.heightMm));return hold(new cad.Solid(builder.Shape()));};
   const outer=cylinder(radius+(positive?h:-startHeightMm+.001));
   const inner=cylinder(radius+(positive?startHeightMm-.001:-h));
   const shell=hold(outer.cut(inner)),solids=shell.solids;owned.push(...solids);
   if(solids.length!==1)fail('RELIEF_INVALID','等高柱面层未形成单个刀具体');
   let patched=solids[0].clone();
   if(p.localPatches){
    try{for(const patch of p.localPatches){validateLocalPatch(patch,p);if(Math.min(...patch.deltaMm.flat())+p.depthMm<startHeightMm||Math.max(...patch.deltaMm.flat())+h>20||h+Math.max(...patch.deltaMm.flat())>radius*.2)fail('RELIEF_PATCH_INVALID','局部精修高度越过本层起点或柱面起伏限制');protectedPatch(p,patch,radius,h);const zero=patch.deltaMm.map(row=>row.map(()=>0)),carve=hold(localPatchSolid(radius,patch.domainMm,h+.001,startHeightMm-.002,zero,center,radial,z,tangent,oc,cad)),replacement=hold(localPatchSolid(radius,patch.domainMm,h,startHeightMm-.001,patch.deltaMm,center,radial,z,tangent,oc,cad)),cleared=hold(patched.cut(carve)),next=cleared.fuse(replacement);dispose(patched);patched=next;}}
    catch(error){dispose(patched);throw error;}
   }
   return{tool:patched,frame,report:{...report,kind:p.localPatches?'cylindrical-local-patch-relief':'cylindrical-analytic-relief',...(p.localPatches?{localPatches:p.localPatches.map(patch=>({id:patch.id,domainMm:patch.domainMm,protectionMm:patch.protectionMm,rows:patch.deltaMm.length,columns:patch.deltaMm[0].length,boundary:'two zero control rows; exact original circular boundary and tangent'}))}:{})}};
  }
  const rows=p.values.length,cols=p.values[0].length,base=hold(circularPatch(radius,p.widthMm,p.heightMm,cols,rows,oc));
  const mapping=hold(new cad.Transformation().coordSystemChange({origin:center,xDir:radial,zDir:z},'reference'));
  const baseFace=hold(faceOf(base,oc,cad)),footprint=hold(cad.cast(mapping.transform(baseFace.wrapped))),edges=face.edges;owned.push(...edges);
  if(!p.regions&&!p.strokes)for(const edge of edges)if(cad.measureDistanceBetween(footprint,edge)<=1e-5)fail('RELIEF_OUTSIDE_FACE','图案跨越柱面边界、接缝或孔，请缩小或移动');
  const top=hold(new oc.Geom_BSplineSurface(base)),bottom=hold(new oc.Geom_BSplineSurface(base)),sign=p.mode==='engrave'?-1:1,half=p.widthMm/radius/2;
  for(let i=1;i<=base.NbUPoles();i++)for(let j=1;j<=base.NbVPoles();j++){
   const q=base.Pole(i,j),a=q.X(),b=q.Y(),c=q.Z(),h=p.surfaceMode==='flat'?p.depthMm+radius*(1-Math.cos(half))+.01:p.baseMm+p.depthMm*sample(p.values,(Math.atan2(b,a)+half)/(2*half),c/p.heightMm+.5);
   // A flat crest is measured from the tangent plane, not from the cylindrical
   // host. Preserve that plane outside edited controls during local sculpting.
   const flatH=sculptFlat?p.depthMm*sample(p.values,(Math.atan2(b,a)+half)/(2*half),c/p.heightMm+.5):0;
   const t=sculptFlat?new oc.gp_Pnt(radius+sign*flatH,b,c):new oc.gp_Pnt(a*(1+sign*h/radius),b*(1+sign*h/radius),c),floor=new oc.gp_Pnt(a*(1+sign*(startHeightMm-.001)/radius),b*(1+sign*(startHeightMm-.001)/radius),c);
   try{top.SetPole(i,j,t);bottom.SetPole(i,j,floor);}finally{[q,t,floor].forEach(dispose);}
  }
  const faces=[hold(faceOf(top,oc,cad)),hold(faceOf(bottom,oc,cad)),hold(side(top,bottom,true,1,oc,cad)),hold(side(top,bottom,true,rows,oc,cad)),hold(side(top,bottom,false,1,oc,cad)),hold(side(top,bottom,false,cols,oc,cad))];
  const localTool=hold(cad.makeSolid(faces));tool=cad.cast(mapping.transform(localTool.wrapped));
  if(!(tool instanceof cad.Solid)||!oc.BRepLib.OrientClosedSolid(tool.wrapped))fail('RELIEF_INVALID','柱面浮雕刀具未闭合');
  const out=tool;tool=null;return {tool:out,frame,report};
 }finally{dispose(tool);owned.reverse().forEach(dispose);}
}
