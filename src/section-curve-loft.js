// Ordered ellipse sections on independently oriented planes. The source of
// each station must be supplied explicitly; no dimensions are inferred here.
const dispose=v=>{try{v?.delete?.()}catch{}};
const point=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const norm=v=>Math.hypot(...v);
export function buildSectionCurveLoft(params,cad){
  const stations=params.stations;
  if(!Array.isArray(stations)||stations.length<2||stations.length>24)throw new Error('多截面模式需要 2–24 个有序截面');
  if(params.closed===true)throw new Error('多截面模式暂不支持闭环');
  const degree=params.loftDegree??8;
  if(!Number.isInteger(degree)||degree<2||degree>8)throw new Error('放样最高次数须为 2–8 的整数');
  const prepared=stations.map((s,i)=>{
    if(!point(s.centerMm)||!point(s.normal)||!point(s.widthDirection))throw new Error(`截面 ${i} 的中心、法向及料宽方向必须是有限 XYZ`);
    if(!(Number.isFinite(s.widthMm)&&s.widthMm>0&&Number.isFinite(s.depthMm)&&s.depthMm>0))throw new Error(`截面 ${i} 的宽深必须为正`);
    const n=norm(s.normal),w=norm(s.widthDirection);
    if(n<1e-9||w<1e-9)throw new Error(`截面 ${i} 方向不得为零`);
    const normal=s.normal.map(v=>v/n),x=s.widthDirection.map(v=>v/w);
    if(Math.abs(normal.reduce((sum,v,j)=>sum+v*x[j],0))>1e-6)throw new Error(`截面 ${i} 料宽方向须垂直于法向`);
    if(i&&Math.hypot(...s.centerMm.map((v,j)=>v-stations[i-1].centerMm[j]))<1e-6)throw new Error('相邻截面中心不得重合');
    return {...s,normal,widthDirection:x};
  });
  const held=[],hold=v=>{held.push(v);return v;};let result;
  try{
    const wires=prepared.map(s=>{
      const plane=hold(new cad.Plane(s.centerMm,s.widthDirection,s.normal));
      // Two analytic halves keep corresponding seam positions even when the
      // width/depth ordering changes along the product.
      const drawing=hold(cad.drawEllipse(s.widthMm/2,s.depthMm/2));
      const sketch=hold(drawing.sketchOnPlane(plane));return sketch.wire;
    });
    // A high degree interpolant can overshoot on mixed straight/curved paths.
    // Keep the historical default, and let callers explicitly bound the degree.
    const builder=hold(new (cad.getOC().BRepOffsetAPI_ThruSections)(true,false,1e-6));
    builder.SetMaxDegree(degree);
    wires.forEach(w=>builder.AddWire(w.wrapped));builder.Build();
    result=cad.cast(builder.Shape());
    const analyzer=hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false));
    if(!analyzer.IsValid())throw new Error('多截面放样拓扑无效，请检查截面顺序、自交及宽深');
    const solids=result.solids;try{if(solids.length!==1||cad.measureVolume(result)<=1e-9)throw new Error('多截面放样须得到一个正体积实体');}finally{solids.forEach(dispose)}
    const complete=result;result=null;return complete;
  }finally{dispose(result);held.reverse().forEach(dispose)}
}
