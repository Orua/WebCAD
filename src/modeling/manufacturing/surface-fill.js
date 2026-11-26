import {buildFaceThickness} from '../../surface-thickness.js';
import {unit} from '../sweep-continuity.js';

const JOIN_MM = 1e-6;
const VERTEX_PICK_MM = 0.05;
const ANGLE_RAD = 0.01;
const CURVATURE_PER_MM = 0.1;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const coordinates = p => [p.X(),p.Y(),p.Z()];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const fail = (code,message) => {
  throw Object.assign(new Error(message), {code});
};

function edgeSamples(edge, oc, segments = 1) {
  const curve = new oc.BRepAdaptor_Curve(edge.wrapped), p = new oc.gp_Pnt();
  try {
    const first = curve.FirstParameter(), span = curve.LastParameter()-first;
    return Array.from({length:segments+1}, (_,i) => {
      curve.D0(first+span*i/segments,p);
      return coordinates(p);
    });
  } finally {p.delete();curve.delete();}
}

function closedOrder(items, oc, hold) {
  const pending = items.map(item => ({...item, ends:edgeSamples(item.edge,oc)}));
  for (const item of pending) {
    if (item.ends.some(end => pending.flatMap(other => other.ends)
      .filter(other => distance(end,other)<=JOIN_MM).length!==2)) {
      fail('SURFACE_FILL_BOUNDARY','边界含缺口或分支，端点必须连成一个闭环。');
    }
  }
  const first = pending.shift(), ordered = [first];
  const start = first.ends[0];
  let cursor = first.ends[1];
  while (pending.length && distance(cursor,start)>JOIN_MM) {
    const index = pending.findIndex(item => item.ends.some(end => distance(end,cursor)<=JOIN_MM));
    if (index<0) fail('SURFACE_FILL_BOUNDARY','边界含断开的边。');
    const [item] = pending.splice(index,1);
    const reverse = distance(item.ends[1],cursor)<=JOIN_MM;
    cursor = item.ends[reverse?0:1];
    ordered.push(reverse?{...item,edge:hold(item.edge.flipOrientation())}:item);
  }
  if (pending.length || distance(cursor,start)>JOIN_MM) fail('SURFACE_FILL_BOUNDARY','请只选择一个闭合边界。');
  return ordered;
}

function interpolateLoop(points, oc, cad, hold) {
  const data = hold(new oc.NCollection_Array1_gp_Pnt(1,points.length));
  points.forEach((p,i) => data.SetValue(i+1,hold(new oc.gp_Pnt(...p))));
  const array = hold(new oc.NCollection_HArray1_gp_Pnt(data));
  const interp = hold(new oc.GeomAPI_Interpolate(array,true,JOIN_MM/10));
  interp.Perform();
  if (!interp.IsDone()) fail('SURFACE_FILL_BOUNDARY','无法用选定的点闭合光顺轮廓。');
  const curve = hold(interp.Curve()), maker = hold(new oc.BRepBuilderAPI_MakeEdge(curve));
  return hold(cad.cast(maker.Edge()));
}

function maxDistance(points, shape, cad) {
  if (!points.length) return 0;
  const query = new cad.DistanceQuery(shape);
  try {
    return points.reduce((max,point) => {
      const vertex = cad.makeVertex(point);
      try {return Math.max(max,query.distanceTo(vertex));}
      finally {vertex.delete();}
    },0);
  } finally {query.delete();}
}

function measureSeams(ordered, face, oc, toleranceMm, hold) {
  const seams = ordered.filter(item => item.support);
  let angleRad = 0, curvatureError = 0;
  if (!seams.length) return {angleRad,curvatureError};
  const surface = hold(oc.BRep_Tool.Surface(face.wrapped));
  const patch = hold(new oc.BRepAdaptor_Surface(face.wrapped,false));
  const p = hold(new oc.gp_Pnt()), tangent = hold(new oc.gp_Vec());
  const q = hold(new oc.gp_Pnt()), uv = hold(new oc.gp_Pnt2d());
  const du = hold(new oc.gp_Vec()), dv = hold(new oc.gp_Vec());
  const duu = hold(new oc.gp_Vec()), dvv = hold(new oc.gp_Vec()), duv = hold(new oc.gp_Vec());
  function jet(adaptor,u,v,g2) {
    if (g2) adaptor.D2(u,v,q,du,dv,duu,dvv,duv);
    else adaptor.D1(u,v,q,du,dv);
    const a = coordinates(du), b = coordinates(dv), n = unit(cross(a,b));
    if (!n) fail('SURFACE_FILL_TOLERANCE','邻接边上有无法验证切向的退化位置。');
    const second = g2?[coordinates(duu),coordinates(duv),coordinates(dvv)]:null;
    return {a,b,n,second};
  }
  function normalCurvature({a,b,n,second}, direction) {
    // Solve the first fundamental form for parametric components of a
    // shared physical tangent, then evaluate the second fundamental form.
    const orthogonal = cross(a,b), denominator = dot(orthogonal,orthogonal);
    const u = dot(cross(direction,b),orthogonal)/denominator;
    const v = dot(cross(a,direction),orthogonal)/denominator;
    return (u*u*dot(n,second[0])+2*u*v*dot(n,second[1])+v*v*dot(n,second[2])) /
      dot(a.map((component,i) => component*u+b[i]*v),direction);
  }
  for (const {edge,support,kind} of seams) {
    const g2 = kind==='G2';
    const neighbor = hold(new oc.BRepAdaptor_Surface(support.wrapped,false));
    const curve = hold(new oc.BRepAdaptor_Curve(edge.wrapped,support.wrapped));
    const pcurve = hold(new oc.BRepAdaptor_Curve2d(edge.wrapped,support.wrapped));
    const first = pcurve.FirstParameter(), span = pcurve.LastParameter()-first;
    for (let i=0;i<13;i++) {
      const parameter = first+span*(0.01+0.98*i/12);
      pcurve.D0(parameter,uv);
      curve.D1(parameter,p,tangent);
      const probe = new oc.GeomAPI_ProjectPointOnSurf(p,surface,1e-8);
      try {
        if (!probe.NbPoints() || probe.LowerDistance()>toleranceMm) {
          fail('SURFACE_FILL_TOLERANCE','拟合后的曲面无法在允许误差内沿邻面验证接缝。');
        }
        const {U,V} = probe.LowerDistanceParameters();
        const original = jet(neighbor,uv.X(),uv.Y(),g2), fitted = jet(patch,U,V,g2);
        const cosine = dot(original.n,fitted.n);
        angleRad = Math.max(angleRad,Math.atan2(Math.hypot(...cross(original.n,fitted.n)),Math.abs(cosine)));
        if (g2) {
          const along = unit(coordinates(tangent)), across = along&&unit(cross(original.n,along));
          if (!across) fail('SURFACE_FILL_TOLERANCE','邻接边上有无法验证曲率的退化位置。');
          const diagonal = unit(along.map((value,index) => value+across[index]));
          for (const direction of [along,across,diagonal]) {
            const error = normalCurvature(original,direction)-Math.sign(cosine)*normalCurvature(fitted,direction);
            curvatureError = Math.max(curvatureError,Math.abs(error));
          }
        }
      } finally {probe.delete();}
    }
  }
  return {angleRad,curvatureError};
}

export function buildSurfaceFill(sources, params, cad) {
  const oc = cad.getOC(), owned = [], hold = item => {owned.push(item);return item;};
  const topology = new Map(), usedRefs = new Set();
  let face, solid;
  function topologies(refIndex,key) {
    const source = sources[refIndex];
    if (!source?.wrapped) fail('SURFACE_FILL_REFERENCE','请引用当前工程中含精确边或面的对象。');
    usedRefs.add(refIndex);
    const group = topology.get(refIndex) ?? {};
    topology.set(refIndex,group);
    return group[key] ??= source[key].map(hold);
  }
  function edgeFor({refIndex,edgeId}) {
    const edge = topologies(refIndex,'edges')[edgeId];
    if (!edge) fail('SURFACE_FILL_REFERENCE',`来源 ${refIndex+1} 找不到边 ${edgeId}，请重选。`);
    return edge;
  }
  function resolvePoint(value) {
    if (Array.isArray(value)) return value;
    const [a,b] = edgeSamples(edgeFor(value),oc);
    const da = distance(a,value.nearMm), db = distance(b,value.nearMm);
    if (Math.min(da,db)>VERTEX_PICK_MM ||
        (Math.abs(da-db)<=JOIN_MM && distance(a,b)>JOIN_MM)) {
      fail('SURFACE_FILL_REFERENCE','无法唯一吸附到所选边的端点，请靠近顶点重选。');
    }
    return da<=db?a:b;
  }
  try {
    const {boundary, output} = params;
    const toleranceMm = params.toleranceMm ?? 0.01;
    const points = (params.points??[]).map(resolvePoint);
    const guides = (params.guideEdges??[]).map(edgeFor);
    let entries, outlinePoints = [];
    if (boundary.kind==='points') {
      outlinePoints = boundary.points.map(resolvePoint);
      if (outlinePoints.some((p,i) => outlinePoints.slice(0,i).some(q => distance(p,q)<=JOIN_MM))) {
        fail('SURFACE_FILL_BOUNDARY','边界点重复。闭合边界会自动连接末点和首点。');
      }
      const edges = boundary.curve==='smooth' ? [interpolateLoop(outlinePoints,oc,cad,hold)] :
        outlinePoints.map((p,i) => hold(cad.makeLine(p,outlinePoints[(i+1)%outlinePoints.length])));
      entries = edges.map(edge => ({edge,kind:'G0'}));
    } else {
      entries = boundary.edges.map((item,i) => {
        const edge = edgeFor(item);
        if (item.kind==='G0') return {edge,kind:'G0'};
        const support = topologies(item.refIndex,'faces')[item.supportFaceId];
        const neighbors = support?.edges.map(hold) ?? [];
        if (!neighbors.some(other => other.wrapped.IsSame(edge.wrapped))) {
          fail('SURFACE_FILL_SUPPORT',`第 ${i+1} 条边必须与选定的 G1/G2 邻面共边。`);
        }
        return {edge,kind:item.kind,support};
      });
    }
    const all = [...entries.map(entry => entry.edge),...guides];
    if (all.some((edge,i) => all.slice(0,i).some(other => other.wrapped.IsSame(edge.wrapped)))) {
      fail('SURFACE_FILL_BOUNDARY','同一条边只能选一次，请检查边界和导向边。');
    }
    if (usedRefs.size!==sources.length) fail('SURFACE_FILL_REFERENCE','请移除没有用于约束的来源对象。');
    const ordered = closedOrder(entries,oc,hold);
    const order = oc.GeomAbs_Shape;
    // BRepFill passes the numeric GeomAbs_Shape value through as the plate
    // constraint order (0, 1, 2). GeomAbs_C1 is the binding's value for 2.
    const orders = {G0:order.GeomAbs_C0,G1:order.GeomAbs_G1,G2:order.GeomAbs_C1};
    const degree = ordered.some(item => item.kind==='G2') ? 4 : 3;
    const samples = ordered.length===1 ? 36 : 16;
    const builder = hold(new oc.BRepOffsetAPI_MakeFilling(
      degree,samples,3,false,1e-5,toleranceMm/4,ANGLE_RAD,CURVATURE_PER_MM,8,12,
    ));
    for (const {edge,kind,support} of ordered) {
      if (support) builder.Add(edge.wrapped,support.wrapped,orders[kind],true);
      else builder.Add(edge.wrapped,orders[kind],true);
    }
    guides.forEach(edge => builder.Add(edge.wrapped,orders.G0,false));
    points.forEach(point => builder.Add(hold(new oc.gp_Pnt(...point))));
    builder.Build(hold(new oc.Message_ProgressRange()));
    if (!builder.IsDone()) fail('SURFACE_FILL_SOLVER','无法在这些约束下生成曲面，请检查边界形状和导向位置。');
    face = cad.cast(builder.Shape());
    const check = hold(new oc.BRepCheck_Analyzer(face.wrapped,true,false,false));
    if (!(face instanceof cad.Face) || !check.IsValid() || !(cad.measureArea(face)>1e-8)) {
      fail('SURFACE_FILL_SOLVER','约束生成的面无效，请检查边界是否交叉或有过急的起伏。');
    }
    const trim = hold(new cad.Wire(oc.BRepTools.OuterWire(face.wrapped)));
    const trimEdges = trim.edges.map(hold);
    const curvePoints = edges => edges.flatMap(edge => edgeSamples(edge,oc,12));
    const sourceWire = hold(cad.assembleWire(ordered.map(item => item.edge)));
    const boundaryDeviationMm = Math.max(
      maxDistance([...outlinePoints,...curvePoints(ordered.map(item => item.edge))],trim,cad),
      maxDistance(curvePoints(trimEdges),sourceWire,cad),
    );
    const pointDeviationMm = maxDistance(points,face,cad);
    const guideDeviationMm = maxDistance(curvePoints(guides),face,cad);
    const solverDeviationMm = builder.G0Error();
    const {angleRad,curvatureError} = measureSeams(ordered,face,oc,toleranceMm,hold);
    const deviation = Math.max(boundaryDeviationMm,pointDeviationMm,guideDeviationMm,solverDeviationMm);
    if (!Number.isFinite(deviation) || deviation>toleranceMm) {
      fail('SURFACE_FILL_TOLERANCE',`约束残差 ${deviation.toFixed(4)} mm 超过 ${toleranceMm} mm，请检查边界、点和导向位置。`);
    }
    if (!(angleRad<=ANGLE_RAD) || !(curvatureError<=CURVATURE_PER_MM)) {
      fail('SURFACE_FILL_TOLERANCE','邻面连续性超出允许误差，请检查选边与起伏约束是否相容。');
    }
    if (output.kind==='thickened') {
      try {solid = buildFaceThickness(face,{faceId:0,thickness:output.thicknessMm},cad);}
      catch (error) {fail('SURFACE_FILL_THICKNESS',`曲面已求解，法向增厚失败：${error.message||'请检查厚度与最小曲率半径。'}`);}
    }
    const result = solid ?? face;
    result.surfaceFillReport = {
      boundaryEdgeCount:ordered.length, guideCount:guides.length, pointCount:points.length,
      g1EdgeCount:ordered.filter(c => c.kind==='G1').length,
      g2EdgeCount:ordered.filter(c => c.kind==='G2').length,
      toleranceMm, boundaryDeviationMm, pointDeviationMm, guideDeviationMm, solverDeviationMm,
      maxNormalAngleDeg:angleRad*180/Math.PI, curvatureErrorPerMm:curvatureError,
      output:output.kind, ...(solid?{thicknessMm:output.thicknessMm}:{}),
    };
    if (solid) solid=null; else face=null;
    return result;
  } catch (error) {
    if (error?.code || error instanceof WebAssembly.RuntimeError) throw error;
    let detail = error?.message;
    if (!detail && error instanceof WebAssembly.Exception) detail = oc.getExceptionMessage(error).filter(Boolean).join(' · ');
    throw Object.assign(new Error('曲面求解未完成，请检查边界、导向边和邻面的相容性。',{cause:error}),
      {code:'SURFACE_FILL_SOLVER',detail});
  } finally {
    solid?.delete();face?.delete();
    owned.reverse().forEach(item => item.delete());
  }
}
