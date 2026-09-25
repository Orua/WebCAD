// 有界曲线扫掠：路径由三点圆弧、BSpline 或连续直线/圆弧段生成。
const MIN_TOLERANCE = 1e-5;
const MAX_TOLERANCE = 0.5;
const EPS = 1e-9;

function fail(message) { throw new Error(`曲线扫掠失败：${message}`); }
function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function validPoint(point) { return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(v) { return Math.hypot(...v); }
function tuple(value) {
  if (Array.isArray(value)) return value.slice();
  if (typeof value?.toTuple === 'function') return value.toTuple();
  return [value?.x, value?.y, value?.z];
}
function dispose(value) { try { value?.delete?.(); } catch {} }

export function buildCurveSweep(params, cad) {
  if (!params || !cad) fail('缺少参数或 CAD 适配器');
  const { pathType, points, segments, radius } = params;
  const section = params.section ?? 'round';
  if (!['round','chamferedSquare','ellipse'].includes(section)) fail('截面必须为 round、chamferedSquare 或 ellipse');
  if (params.closed !== undefined && typeof params.closed !== 'boolean') fail('closed 须为布尔值');
  if (params.closed === true && pathType !== 'segments') fail('closed:true 只用于分段路径');
  if (!['arc','spline','segments'].includes(pathType)) fail('路径类型必须是 arc、spline 或 segments');
  let pathPoints;
  if (pathType === 'segments') {
    if (!Array.isArray(segments) || segments.length < 2 || segments.length > 64) fail('分段路径需要 2 至 64 段');
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const count = segment?.type === 'line' ? 2 : segment?.type === 'arc' ? 3 : 0;
      if (!count || !Array.isArray(segment.points) || segment.points.length !== count || !segment.points.every(validPoint)) fail(`第 ${i+1} 段必须是 line 的两点或 arc 的三点 XYZ`);
      if (distance(segment.points[0],segment.points.at(-1)) <= EPS) fail(`第 ${i+1} 段端点重合`);
      if (count === 3) {
        const a=segment.points[1].map((v,k)=>v-segment.points[0][k]),b=segment.points[2].map((v,k)=>v-segment.points[0][k]);
        if (norm(cross(a,b)) <= EPS) fail(`第 ${i+1} 段圆弧三点不能共线`);
      }
      if (i && distance(segments[i-1].points.at(-1),segment.points[0]) > 1e-6) fail(`第 ${i+1} 段与前段端点不连续`);
    }
    pathPoints=segments.flatMap(segment=>segment.points);
    const closes=distance(segments[0].points[0],segments.at(-1).points.at(-1)) <= 1e-6;
    if (closes !== (params.closed === true)) fail(params.closed ? '闭合路径首尾端点不连续' : '分段路径必须开放；闭环请指定 closed:true');
  } else {
    if (!Array.isArray(points) || points.length < 3 || (pathType === 'arc' && points.length !== 3) || (pathType === 'spline' && points.length > 30)) fail(pathType === 'arc' ? '圆弧路径必须恰好有3个点' : '样条路径需要3至30个点');
    if (!points.every(validPoint)) fail('路径点必须是有限的 XYZ 三维坐标');
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (distance(points[i], points[j]) <= EPS) fail('路径不允许重复点或闭合路径');
    pathPoints=points;
  }
  const sectionSize = params.sectionSize;
  const sectionChamfer = params.sectionChamfer;
  const sectionWidth = params.sectionWidth;
  const sectionDepth = params.sectionDepth;
  if (section === 'round' && (!Number.isFinite(radius) || radius <= 0)) fail('圆截面半径必须大于0');
  if (section === 'chamferedSquare' && (!Number.isFinite(sectionSize) || sectionSize <= 0 || !Number.isFinite(sectionChamfer) || sectionChamfer <= 0 || sectionChamfer >= sectionSize/2)) fail('倒角方线须满足 sectionSize>0 且 0<sectionChamfer<sectionSize/2');
  if (section === 'ellipse' && (!Number.isFinite(sectionWidth) || !Number.isFinite(sectionDepth) || sectionWidth <= 0 || sectionDepth <= 0 || sectionWidth === sectionDepth)) fail('椭圆截面须提供不同的正面料宽 sectionWidth 和侧深 sectionDepth，均大于0');
  const span = Math.max(...pathPoints.map((point, i) => Math.max(...pathPoints.slice(i + 1).map(other => distance(point, other)), 0)));
  const frontWidth=section==='round'?2*radius:section==='ellipse'?sectionWidth:sectionSize;
  if (!span || frontWidth > span * 20) fail('截面相对路径过大，无法生成有效实体');
  if (section !== 'round' && pathPoints.some(p=>Math.abs(p[2]-pathPoints[0][2])>1e-6)) fail('倒角方线和椭圆截面目前只支持同一 XY 平面的路径');
  const tolerance = params.tolerance ?? 0.01;
  if (!Number.isFinite(tolerance) || tolerance < MIN_TOLERANCE || tolerance > MAX_TOLERANCE) fail('样条公差必须在0.00001至0.5毫米之间');
  let edge, edges=[], circle, ellipse, drawing, plane, sketch, profile, spine, start, tangent, solid;
  try {
    if (pathType === 'arc') {
      const a = [points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]];
      const b = [points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]];
      if (norm(cross(a, b)) <= EPS) fail('圆弧三点不能共线');
      edge = cad.makeThreePointArc(points[0], points[1], points[2]);
    } else if (pathType === 'spline') {
      edge = cad.makeBSplineApproximation(points, { tolerance });
    } else {
      for (const segment of segments) edges.push(segment.type==='line'
        ? cad.makeLine(...segment.points)
        : cad.makeThreePointArc(...segment.points));
      edge=edges[0];
    }
    if (!edge?.pointAt || !edge?.tangentAt) fail('CAD 路径边缺少 pointAt/tangentAt 接口');
    start = edge.pointAt(0);
    tangent = edge.tangentAt(0);
    const tangentLength = norm(tuple(tangent));
    if (!Number.isFinite(tangentLength) || tangentLength <= EPS) fail('路径起点切线无效');
    const center = tuple(start);
    const normal = tuple(tangent);
    if (section === 'round') {
      circle = cad.makeCircle(radius, center, normal);
      profile = cad.assembleWire([circle]);
    } else if (section === 'ellipse') {
      const length=Math.hypot(normal[0],normal[1]);
      if (length <= EPS) fail('椭圆截面路径起点切线不得垂直 XY 平面');
      const radial=[normal[1]/length,-normal[0]/length,0];
      ellipse=cad.makeEllipse(Math.max(sectionWidth,sectionDepth)/2,Math.min(sectionWidth,sectionDepth)/2,
        center,normal,sectionDepth>sectionWidth?[0,0,1]:radial);
      profile=cad.assembleWire([ellipse]);
    } else {
      const length = Math.hypot(normal[0],normal[1]);
      if (length <= EPS) fail('倒角方线路径起点切线不得垂直 XY 平面');
      plane = new cad.Plane(center,[normal[1]/length,-normal[0]/length,0],normal);
      const half=sectionSize/2,c=sectionChamfer;
      drawing=cad.draw([-half+c,-half]).lineTo([half-c,-half]).lineTo([half,-half+c])
        .lineTo([half,half-c]).lineTo([half-c,half]).lineTo([-half+c,half])
        .lineTo([-half,half-c]).lineTo([-half,-half+c]).close();
      sketch=drawing.sketchOnPlane(plane);
      profile=sketch.wire;
    }
    spine = cad.assembleWire(edges.length ? edges : [edge]);
    solid = cad.genericSweep(profile, spine, { frenet: false, transitionMode: pathType==='segments'&&!params.closed?'transformed':'right' });
    if (!solid) fail('CAD 内核未生成单一有效实体');
    const solids = solid.solids;
    try { if (Array.isArray(solids) && solids.length !== 1) fail('CAD 内核未生成单一有效实体'); }
    finally { solids?.forEach(dispose); }
    if (pathType==='segments') {
      const checker=new (cad.getOC().BRepCheck_Analyzer)(solid.wrapped,true,false,false);
      try { if (!checker.IsValid()) fail('分段扫掠拓扑无效'); }
      finally { dispose(checker); }
    }
    const result=solid;solid=null;return result;
  } catch (error) {
    if (error?.message?.startsWith('曲线扫掠失败：')) throw error;
    throw new Error(`曲线扫掠失败：${error?.message || 'CAD 内核拒绝该路径或截面'}`);
  } finally {
    // Sweep 已复制所需 BRep；临时 edge/profile/spine 与 point/vector 句柄必须释放。
    dispose(solid);dispose(spine); if(!sketch)dispose(profile); dispose(sketch);dispose(drawing);dispose(plane);dispose(circle);dispose(ellipse); edges.forEach(dispose); if(!edges.length)dispose(edge); dispose(start); dispose(tangent);
  }
}
