// B-Rep edge midpoint by travelled length. Curve parameter 0.5 is not generally
// half way along a spline; keep this calculation independent of display mesh.
const dispose=value=>{try{value?.delete?.();}catch{}};
const nodes=[0.1834346424956498,0.525532409916329,0.7966664774136267,0.9602898564975363];
const weights=[0.362683783378362,0.3137066458778873,0.2223810344533745,0.1012285362903763];

export function halfLengthPoint(edge,oc,lengthMm){
  // Revolved surfaces can have an exact degenerate pole edge. Its vertex is
  // the only geometric point; there is no nonzero arc to integrate.
  if(oc.BRep_Tool.Degenerated(edge.wrapped)){const p=edge.startPoint;try{return p.toTuple();}finally{dispose(p);}}
  if(['LINE','CIRCLE'].includes(edge.geomType)){
    const p=edge.pointAt(.5);try{return p.toTuple();}finally{dispose(p);}
  }
  let adaptor,point,derivative;
  try{
    adaptor=new oc.BRepAdaptor_Curve(edge.wrapped);point=new oc.gp_Pnt();derivative=new oc.gp_Vec();
    const first=adaptor.FirstParameter(),last=adaptor.LastParameter();
    if(!Number.isFinite(first)||!Number.isFinite(last)||last<=first||!Number.isFinite(lengthMm)||lengthMm<=0)throw new Error('边弧长参数无效');
    const speed=u=>{adaptor.D1(u,point,derivative);return Math.hypot(derivative.X(),derivative.Y(),derivative.Z());};
    const gauss=(a,b)=>{const mid=(a+b)/2,half=(b-a)/2;let sum=0;for(let i=0;i<4;i++)sum+=weights[i]*(speed(mid-half*nodes[i])+speed(mid+half*nodes[i]));return sum*half;};
    const integrate=(a,b,whole,depth)=>{const mid=(a+b)/2,left=gauss(a,mid),right=gauss(mid,b);if(depth===0||Math.abs(left+right-whole)<=Math.max(1e-9,1e-10*lengthMm))return left+right;return integrate(a,mid,left,depth-1)+integrate(mid,b,right,depth-1);};
    const lengthTo=u=>integrate(first,u,gauss(first,u),14);
    const measured=lengthTo(last);
    // Replicad's length uses its own integration tolerance, which can differ
    // by a few thousandths on a strongly nonuniform spline. The quadrature
    // above is the authority for locating the half-length parameter.
    if(!Number.isFinite(measured)||measured<=0||Math.abs(measured-lengthMm)>Math.max(.05,.01*lengthMm))throw new Error('曲线弧长求解无效');
    let low=first,high=last,u=(first+last)/2;
    for(let i=0;i<45;i++){
      u=(low+high)/2;const delta=lengthTo(u)-measured/2;
      if(Math.abs(delta)<=Math.max(1e-7,1e-9*lengthMm))break;
      if(delta>0)high=u;else low=u;
      if(i===44)throw new Error('无法收敛到边的半弧长位置');
    }
    const p=adaptor.Value(u);try{return [p.X(),p.Y(),p.Z()];}finally{dispose(p);}
  }finally{[derivative,point,adaptor].forEach(dispose);}
}
