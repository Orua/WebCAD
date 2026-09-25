// Exact planar LINE/three-point ARC contours. Coordinates are explicit XY millimetres.
const EPS=1e-9;
const JOIN=1e-6;
const dispose=value=>{try{value?.delete?.();}catch{}};
const fail=message=>{throw new Error(`解析线弧轮廓失败：${message}`);};
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

function checkedPath(segments,label){
  if(!Array.isArray(segments)||segments.length<2||segments.length>128)fail(`${label}须有 2–128 段`);
  for(let i=0;i<segments.length;i++){
    const segment=segments[i],count=segment?.type==='line'?2:segment?.type==='arc'?3:0;
    if(!count||!Array.isArray(segment.points)||segment.points.length!==count||!segment.points.every(point))fail(`${label}第${i+1}段必须是二维 line 两点或 arc 三点`);
    const [a,m,b]=segment.points;
    if(distance(a,segment.points.at(-1))<=EPS)fail(`${label}第${i+1}段端点重合`);
    if(count===3&&Math.abs((m[0]-a[0])*(b[1]-a[1])-(m[1]-a[1])*(b[0]-a[0]))<=EPS)fail(`${label}第${i+1}段圆弧三点共线`);
    if(i&&distance(segments[i-1].points.at(-1),a)>JOIN)fail(`${label}第${i+1}段与前段不连续`);
  }
  if(distance(segments.at(-1).points.at(-1),segments[0].points[0])>JOIN)fail(`${label}首尾不闭合`);
  return segments;
}

export function buildArcProfile(params,cad){
  if(!params||!cad)fail('缺少参数或 CAD 适配器');
  const outer=checkedPath(params.outer,'外轮廓');
  const holes=params.holes??[];
  if(!Array.isArray(holes)||holes.length>16)fail('孔轮廓最多16个');
  holes.forEach((path,i)=>checkedPath(path,`第${i+1}个孔`));
  const height=params.height;
  if(!Number.isFinite(height)||height===0||Math.abs(height)>1000)fail('拉伸高度须为非零有限数，绝对值不超过1000 mm');
  const owned=[],hold=value=>{owned.push(value);return value;};
  let result;
  const prism=path=>{
    const edges=path.map(segment=>{
      const xyz=segment.points.map(([x,y])=>[x,y,0]);
      return hold(segment.type==='line'?cad.makeLine(...xyz):cad.makeThreePointArc(...xyz));
    });
    const wire=hold(cad.assembleWire(edges));
    const face=hold(cad.makeFace(wire));
    const vector=hold(new (cad.getOC().gp_Vec)(0,0,height));
    const maker=hold(new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped,vector,false,true));
    return cad.cast(maker.Shape());
  };
  try{
    result=prism(outer);
    for(const path of holes){
      const tool=prism(path),before=cad.measureVolume(result);
      try{
        const next=result.cut(tool),after=cad.measureVolume(next);
        if(!(after>0&&after<before-1e-7)){dispose(next);fail('孔未从主体内部去除有效材料');}
        dispose(result);result=next;
      }finally{dispose(tool);}
    }
    const solids=result.solids,checker=new (cad.getOC().BRepCheck_Analyzer)(result.wrapped,true,false,false);
    try{if(solids.length!==1||!checker.IsValid())fail('未生成有效的单一实体');}
    finally{solids.forEach(dispose);dispose(checker);}
    const complete=result;result=null;return complete;
  }catch(error){
    if(error?.message?.startsWith('解析线弧轮廓失败：'))throw error;
    fail(error?.message||'内核拒绝当前线弧轮廓');
  }finally{dispose(result);owned.reverse().forEach(dispose);}
}
