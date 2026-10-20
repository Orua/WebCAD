// Constant-radius rolling ball between perpendicular, equal, coplanar cylinders.
// C(t)=(-h cos(t), h cos(t), h sin(t)), h=wireRadius+R.
// Cylinder contacts and circular transverse sections are constructed together;
// no global affine distortion, source-patch scaling or reduced requested R.
const dispose=x=>{try{x?.delete?.();}catch{}};
const fail=message=>{throw Object.assign(new Error(message),{code:'GEOMETRY_INVALID'});};
const add=(...vectors)=>vectors[0].map((_,i)=>vectors.reduce((sum,v)=>sum+v[i],0));
const scale=(v,s)=>v.map(x=>x*s);

function canal(u,t,r,R){
 const s=Math.sin(t),c=Math.cos(t),h=r+R,d=Math.sqrt(2*(1+s*s)),k=[-Math.SQRT1_2,-Math.SQRT1_2,0],m=[-c/d,c/d,2*s/d];
 const mt=add([s/d,-s/d,2*c/d],scale(m,-s*c/(1+s*s))),alpha=Math.atan2(c*Math.sqrt(1+s*s),s*s),at=-2*s/Math.sqrt(1+s*s),beta=(u-.5)*alpha,bt=(u-.5)*at,co=Math.cos(beta),si=Math.sin(beta),q=add(scale(m,-si),scale(k,co)),n=add(scale(m,co),scale(k,si));
 return {p:add([-h*c,h*c,h*s],scale(n,-R)),pu:scale(q,-R*alpha),pt:add([h*s,-h*s,h*c],scale(add(scale(mt,co),scale(q,bt)),-R)),put:scale(add(scale(q,at),scale(add(scale(mt,-si),scale(n,-bt)),alpha)),-R),alpha,at};
}

export function makeRodJunctionFaces(cad,{wireRadius:r,radius:R,reach:L=5*(r+R)/3,map=p=>p}){
 if(![r,R,L].every(Number.isFinite)||r<=0||R<=0||r>20||R>20||L<=r+R)fail('圆杆接头要求线径与 R 为正，线径≤40 mm、R≤20 mm，且接头与相邻结构有足够间距。');
 const oc=cad.getOC(),N=Math.max(48,Math.ceil(48*Math.pow(Math.max(r+R,R)/3.2,.25))),dt=Math.PI/2/N,du=1/N,held=[],hold=x=>(held.push(x),x),faces=[];let maxBallResidualMm=0,maxCylinderResidualMm=0;
 const array=(values,kind)=>{const a=hold(new oc[kind](1,values.length));values.forEach((v,i)=>a.SetValue(i+1,v));return a;};
 const knotValues=Array.from({length:N+1},(_,i)=>i*dt),multiplicities=knotValues.map((_,i)=>i===0||i===N?4:3),vk=array(knotValues,'NCollection_Array1_double'),vm=array(multiplicities,'NCollection_Array1_int');
 function point(poles,i,j,p){const q=hold(new oc.gp_Pnt(...map(p)));poles.SetValue(i,j,q);dispose(q);held.pop();}
 function finish(poles,degreeU,uk,um,sy,sz,inspect){
  const surface=hold(new oc.Geom_BSplineSurface(poles,uk,vk,um,vm,degreeU,3,false,false)),maker=hold(new oc.BRepBuilderAPI_MakeFace(surface,1e-7));
  if(!maker.IsDone())fail('圆杆接头曲面无法建立，原工程保留。');
  faces.push(cad.cast(maker.Face()));
  if(inspect)for(let j=0;j<N;j+=Math.max(1,Math.floor(N/8)))for(const u of [.17,.53,.89]){
   const t=(j+.37)*dt,p=surface.Value(u,t),actual=[p.X(),p.Y(),p.Z()];dispose(p);const h=r+R,C=map([-h*Math.cos(t),sy*h*Math.cos(t),sz*h*Math.sin(t)]);
   maxBallResidualMm=Math.max(maxBallResidualMm,Math.abs(Math.hypot(...actual.map((v,i)=>v-C[i]))-R));
  }
 }
 try{
  const uk=array(Array.from({length:N+1},(_,i)=>i/N),'NCollection_Array1_double'),um=array(multiplicities,'NCollection_Array1_int');
  for(const sy of [-1,1])for(const sz of [-1,1]){
   const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,3*N+1,1,3*N+1));
   for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){
    const q=canal(i/N,j*dt,r,R),x=q.alpha*du/4,small=Math.abs(x)<1e-5,g=small?1+x*x/3+2*x**4/15:Math.tan(x)/x,gt=(small?2*x/3+8*x**3/15:(x/Math.cos(x)**2-Math.tan(x))/(x*x))*q.at*du/4;
    for(const a of i===0?[0,1]:i===N?[-1,0]:[-1,0,1])for(const b of j===0?[0,1]:j===N?[-1,0]:[-1,0,1]){
     const p=add(q.p,scale(q.pu,a*du/3*g),scale(q.pt,b*dt/3),scale(add(scale(q.put,g),scale(q.pu,gt)),a*b*du*dt/9));
     point(poles,3*i+1+a,3*j+1+b,[p[0],sy*p[1],sz*p[2]]);
    }
   }
   finish(poles,3,uk,um,sy,sz,sy===1&&sz===1);
  }
  const linear=array([0,1],'NCollection_Array1_double'),ends=array([2,2],'NCollection_Array1_int'),h=r+R;
  for(const kind of ['bar','inner','outer'])for(const sy of kind==='outer'?[1]:[-1,1])for(const sz of [-1,1]){
   const poles=hold(new oc.NCollection_Array2_gp_Pnt(1,2,1,3*N+1));
   for(const v of [0,1])for(let j=0;j<=N;j++){
    const t=j*dt,s=Math.sin(t),c=Math.cos(t);let p,pt;
    if(kind==='bar'){p=[-((1-v)*h*c+v*L),sy*r*c,sz*r*s];pt=[(1-v)*h*s,-sy*r*s,sz*r*c];}
    else if(kind==='inner'){p=[-r*c,sy*((1-v)*h*c+v*L),sz*r*s];pt=[r*s,-sy*(1-v)*h*s,sz*r*c];}
    else{p=[r*c,(2*v-1)*L,sz*r*s];pt=[-r*s,0,sz*r*c];}
    for(const b of j===0?[0,1]:j===N?[-1,0]:[-1,0,1])point(poles,v+1,3*j+1+b,add(p,scale(pt,b*dt/3)));
   }
   finish(poles,1,linear,ends,sy,sz,false);
  }
  // The common cylinder boundaries use the same cubic coordinates. Their
  // interpolation bound is separate from the ball-radius residual above.
  maxCylinderResidualMm=r*(dt**4)/384;
  if(maxBallResidualMm>1e-7||maxCylinderResidualMm>1e-7)fail('圆杆接头误差超过 0.0000001 mm，未提交；不会更改 R 或放宽容差。');
  return {faces,report:{method:'analytic-rolling-ball-canal',radiusMm:R,wireDiameterMm:2*r,reachMm:L,surfaceToleranceMm:1e-7,maxBallResidualMm,maxCylinderResidualMm,subdivisions:N,fixedRadius:true,independentRadius:true}};
 }catch(e){faces.forEach(dispose);throw e;}finally{held.reverse().forEach(dispose);}
}
