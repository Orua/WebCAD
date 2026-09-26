const dispose=value=>{try{value?.delete?.();}catch{}};
const vec=value=>[value.X(),value.Y(),value.Z()];
const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const delta=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>Math.hypot(...a);

export function measureRelationExact(input,getShape,oc,cad){
  const owned=[],hold=value=>{owned.push(value);return value;};
  const part=ref=>{if(!ref||typeof ref.bodyId!=='string'||!['body','edge','face'].includes(ref.kind))throw new Error('关系测量需要明确的当前实体、边或面');const shape=getShape(ref.bodyId);if(ref.kind==='body')return shape;const pieces=shape[ref.kind==='edge'?'edges':'faces'];if(!Number.isSafeInteger(ref.topologyId)||ref.topologyId<0||ref.topologyId>=pieces.length){pieces.forEach(dispose);throw new Error('关系测量的拓扑编号已失效');}const selected=pieces[ref.topologyId];pieces.forEach((piece,i)=>{if(i!==ref.topologyId)dispose(piece);});return hold(selected);};
  const extrema=(a,b)=>{const query=hold(new oc.BRepExtrema_DistShapeShape());query.LoadS1(a.wrapped);query.LoadS2(b.wrapped);query.Perform();if(!query.IsDone()||query.NbSolution()<1)throw new Error('精确距离计算未收敛');const p1=hold(query.PointOnShape1(1)),p2=hold(query.PointOnShape2(1));return {distanceMm:query.Value(),witnessPoints:[vec(p1),vec(p2)]};};
  const circle=ref=>{if(ref?.kind!=='edge')throw new Error('圆心/轴线关系须选择两条当前圆边');const edge=part(ref);if(edge.geomType!=='CIRCLE')throw new Error('选定边不是精确圆或圆弧');const adaptor=hold(new oc.BRepAdaptor_Curve(edge.wrapped)),c=hold(adaptor.Circle()),center=hold(c.Location()),axis=hold(c.Axis()),direction=hold(axis.Direction());return {center:vec(center),axis:vec(direction),radiusMm:c.Radius()};};
  try{
    if(input.mode==='shortest')return {mode:'shortest',...extrema(part(input.first),part(input.second)),scope:'finite-brep-shapes'};
    if(input.mode==='pointFace'){if(!finitePoint(input.pointWorld)||input.face?.kind!=='face')throw new Error('点到面需要世界坐标点与有限面');return {mode:'pointFace',...extrema(hold(cad.makeVertex(input.pointWorld)),part(input.face)),scope:'trimmed-finite-face'};}
    if(input.mode==='centerDistance'||input.mode==='axisAlignment'){
      const a=circle(input.first),b=circle(input.second),centerDistanceMm=norm(delta(a.center,b.center)),cos=Math.min(1,Math.max(-1,Math.abs(dot(a.axis,b.axis)))),axisAngleDeg=Math.acos(cos)*180/Math.PI,fromA=delta(b.center,a.center),coaxialDeviationMm=Math.sqrt(Math.max(0,dot(fromA,fromA)-dot(fromA,a.axis)**2));
      return {mode:input.mode,centerDistanceMm,axisAngleDeg,coaxialDeviationMm:axisAngleDeg<1e-5?coaxialDeviationMm:null,centers:[a.center,b.center],radiiMm:[a.radiusMm,b.radiusMm],scope:'exact-circle-axes'};
    }
    if(input.mode==='parallelFaces'){
      if(input.first?.kind!=='face'||input.second?.kind!=='face')throw new Error('法向距离须选择两个有限平面');const a=part(input.first),b=part(input.second);if(a.geomType!=='PLANE'||b.geomType!=='PLANE')throw new Error('法向距离只适用于真实平面面片');const an=hold(a.normalAt()),bn=hold(b.normalAt()),ac=hold(a.center),bc=hold(b.center),n=an.toTuple(),other=bn.toTuple();if(Math.abs(dot(n,other))<1-1e-6)throw new Error('两张面不平行');const normalDistanceMm=Math.abs(dot(delta(bc.toTuple(),ac.toTuple()),n)),shortest=extrema(a,b);return {mode:'parallelFaces',normalDistanceMm,shortestDistanceMm:shortest.distanceMm,witnessPoints:shortest.witnessPoints,finiteOverlap:shortest.distanceMm<=normalDistanceMm+1e-6,scope:'finite-trimmed-faces'};
    }
    throw new Error('未知关系测量模式');
  }finally{owned.reverse().forEach(dispose);}
}
