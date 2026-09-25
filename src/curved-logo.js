import { validateRegions } from './logo-model.js';

const dispose = object => { try { object?.delete(); } catch {} };
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const unit = vector => {const v=vector.toTuple(),length=Math.hypot(...v);check(length>1e-12,'曲面法向退化');return v.map(n=>n/length);};
const check = (ok,message) => { if(!ok) throw new Error(message); };
const finite = (value,name) => {
  check(typeof value==='number' && Number.isFinite(value),`${name} 必须为有限数值`);
  return value;
};
function valid(shape,cad) {
  const test=new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false);
  try { check(!shape.isNull && test.IsValid(),'曲面偏移生成无效几何，请减小深度或缩小 LOGO'); }
  finally {dispose(test);}
}
function solidCount(shape) {
  const solids=shape.solids;
  try{return solids.length;}finally{solids.forEach(dispose);}
}

// Orthographic projection onto one selected face, then NORMAL offset of the
// trimmed face. The bottom is not a planar extrusion. Reject seams/boundaries,
// grazing projections, disconnected patches and offsets that escape the source.
export function buildCurvedLogo(source,params,cad) {
  const regions=validateRegions(params),depth=finite(params.depth,'深度');
  const scale=finite(params.scale??1,'比例'),angle=finite(params.angle??0,'旋转角');
  check(depth>0 && scale>0,'深度与比例须大于 0');
  check((params.draftAngle??0)===0,'曲面等深刻字暂不支持脱模斜度');
  check(params.mode===undefined || params.mode==='engrave','曲面 LOGO 当前仅支持凹刻');
  check(params.mirrorX===undefined || typeof params.mirrorX==='boolean','镜像必须是布尔值');
  check(Array.isArray(params.point)&&params.point.length===3&&params.point.every(Number.isFinite),'请在目标曲面点击 LOGO 中心，或填写有效 XYZ');
  check(solidCount(source)===1,'曲面刻字需要一个封闭实体；散面或复合体请先处理');
  const resources=[],hold=o=>{resources.push(o);return o;},faces=source.faces;
  resources.push(...faces);
  let current=null;
  try {
    check(Number.isInteger(params.faceId)&&faces[params.faceId],'请选择有效曲面');
    const face=faces[params.faceId],anchor=hold(cad.makeVertex(params.point));
    const query=hold(new cad.DistanceQuery(face));
    // Picking hits the display triangulation, not the exact surface. Snap only
    // within a documented 0.1 mm limit, never silently accept a remote point.
    check(query.distanceTo(anchor)<=.1,'LOGO 中心不在所选曲面内（允许 0.1 mm 显示网格吸附）');
    const projectedAnchor=hold(query.wrapped.PointOnShape1(1));
    const point=[projectedAnchor.X(),projectedAnchor.Y(),projectedAnchor.Z()];
    const normal=unit(hold(face.normalAt(point)));
    if(params.frameNormal&&dot(params.frameNormal,normal)<1-1e-6)throw Object.assign(new Error('工作基准法向与目标曲面法向不一致'),{code:'FRAME_SURFACE_MISMATCH'});
    const seed=params.frameX|| (Math.abs(normal[0])<.9?[1,0,0]:[0,1,0]);
    const x=seed.map((v,i)=>v-dot(seed,normal)*normal[i]),length=Math.hypot(...x);
    if(length<1e-8)throw Object.assign(new Error('工作基准 X 方向与目标曲面法向平行'),{code:'FRAME_SURFACE_MISMATCH'});
    x.forEach((v,i)=>x[i]=v/length);
    const y=[normal[1]*x[2]-normal[2]*x[1],normal[2]*x[0]-normal[0]*x[2],normal[0]*x[1]-normal[1]*x[0]];
    const offsetX=finite(params.offsetX??0,'X偏移'),offsetY=finite(params.offsetY??0,'Y偏移');
    const bbox=hold(source.boundingBox),[min,max]=bbox.bounds;
    const reach=Math.hypot(...max.map((v,i)=>v-min[i]))+1;
    const origin=point.map((v,i)=>v+normal[i]*reach+x[i]*offsetX+y[i]*offsetY);
    const plane=hold(new cad.Plane(origin,x,normal)),edges=face.edges;
    resources.push(...edges);
    const theta=angle*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
    const drawRing=ring=>{
      const pts=ring.map(([a,b])=>{a*=scale*(params.mirrorX?-1:1);b*=scale;return [a*c-b*s,a*s+b*c];});
      const pen=hold(cad.draw(pts[0]));for(const p of pts.slice(1))pen.lineTo(p);
      return hold(pen.close());
    };
    current=cad.deserializeShape(source.serialize());
    for(const region of regions) {
      const local=[],own=o=>{local.push(o);return o;};
      try {
        let drawing=drawRing(region.outer);
        for(const hole of region.holes)drawing=own(drawing.cut(drawRing(hole)));
        const sketch=own(drawing.sketchOnPlane(plane)),mask=own(sketch.extrude(-2*reach));
        const common=own(new (cad.getOC().BRepAlgoAPI_Common)(face.wrapped,mask.wrapped));
        common.Build();const projected=own(cad.cast(common.Shape())),patches=projected.faces;
        local.push(...patches);
        const front=patches.filter(patch=>dot(unit(own(patch.normalAt())),normal)>0);
        check(front.length===1,'投影为空、跨接缝或分成多片，请缩小或移动 LOGO');
        const patch=front[0],patchEdges=patch.edges;local.push(...patchEdges);
        for(const edge of edges)check(cad.measureDistanceBetween(patch,edge)>1e-5,'LOGO 跨越所选面的边界、孔洞或接缝');
        for(const edge of patchEdges)for(const t of [0,.5,1]){
          const v=own(edge.pointAt(t)),n=unit(own(patch.normalAt(v)));
          check(dot(n,normal)>.15,'LOGO 接近曲面侧缘，投影过于倾斜，请缩小或重新选中心');
        }
        const thick=own(new (cad.getOC().BRepOffsetAPI_MakeThickSolid)());
        thick.MakeThickSolidBySimple(patch.wrapped,-depth);
        const tool=own(cad.cast(thick.Shape()));
        if(tool instanceof cad.Solid)check(cad.getOC().BRepLib.OrientClosedSolid(tool.wrapped),'曲面刀具方向无效');
        valid(tool,cad);
        check(solidCount(tool)===1,'无法生成闭合的曲面等深刀具');
        const volume=Math.abs(cad.measureVolume(tool)),inside=own(tool.intersect(source));
        check(volume>1e-8 && Math.abs(volume-Math.abs(cad.measureVolume(inside)))<Math.max(1e-6,volume*1e-6),'偏移刀具超出实体：可能穿透薄壁、方向错误或自交');
        const next=own(current.cut(tool));valid(next,cad);
        check(solidCount(next)===1,'刻字使实体断开，请减小深度');
        check(Math.abs(cad.measureVolume(current))-Math.abs(cad.measureVolume(next))>1e-8,'刻字未实际去除材料');
        dispose(current);current=next;local.splice(local.indexOf(next),1);
      } finally {local.reverse().forEach(dispose);}
    }
    const result=current;current=null;return result;
  } catch(error) {
    throw new Error('曲面等深刻字失败：'+(error.message||String(error)));
  } finally {dispose(current);resources.reverse().forEach(dispose);}
}
