// Exact reference profiles. Input shapes are borrowed; returned handles belong to the caller.
const dispose = value => { try { value?.delete?.(); } catch {} };
const check = (ok, message) => { if (!ok) throw new Error(`参考轮廓：${message}`); };
const point = vector => { try { return vector.toTuple(); } finally { dispose(vector); } };
const same = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) <= 1e-7;
const closed = shape => { const curve = shape.curve; try { return curve.isClosed; } finally { dispose(curve); } };
const endpoints = edge => {
  const curve = edge.curve;
  try { return [point(curve.startPoint), point(curve.endPoint), curve.isClosed]; }
  finally { dispose(curve); }
};
export function planarFace(shape, cad) {
  if (shape.geomType === 'PLANE') return true;
  // A STEP/IGES planar patch is often encoded as a degree-one BSpline surface.
  // Every control point on a single plane is a sufficient exact geometric proof.
  if (shape.geomType !== 'BSPLINE_SURFACE') return false;
  let adaptor, spline;
  try {
    adaptor = new (cad.getOC().BRepAdaptor_Surface)(shape.wrapped, false);
    spline = adaptor.BSpline();
    const poles = [];
    for (let u = 1; u <= spline.NbUPoles(); u++) for (let v = 1; v <= spline.NbVPoles(); v++) {
      const pole = spline.Pole(u, v);
      try { poles.push([pole.X(), pole.Y(), pole.Z()]); }
      finally { dispose(pole); }
    }
    const origin = poles[0];
    let normal;
    for (let i = 1; i < poles.length && !normal; i++) for (let j = i + 1; j < poles.length && !normal; j++) {
      const a = poles[i].map((n, k) => n - origin[k]), b = poles[j].map((n, k) => n - origin[k]);
      const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      const length = Math.hypot(...cross);
      if (length > 1e-12) normal = cross.map(n => n / length);
    }
    return !!normal && poles.every(p => Math.abs(p.reduce((sum, n, k) => sum + (n - origin[k]) * normal[k], 0)) <= 1e-7);
  } finally { dispose(spline); dispose(adaptor); }
}

export function checkShape(shape, cad, description = '轮廓') {
  let analyzer;
  try {
    analyzer = new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
    check(!shape.isNull && analyzer.IsValid(), `${description}无效或自交`);
  } finally { dispose(analyzer); }
}

function assembleClosed(edges, cad) {
  check(edges.length > 0, '没有边');
  const nodes = [];
  const node = p => {
    let index = nodes.findIndex(n => same(n.point, p));
    if (index < 0) { index = nodes.length; nodes.push({ point: p, incident: [] }); }
    return index;
  };
  const links = edges.map((edge, index) => {
    const [start, end, edgeClosed] = endpoints(edge);
    const a = node(start), b = node(end);
    check(a !== b || edgeClosed, '存在零长度或退化边');
    nodes[a].incident.push(index);
    nodes[b].incident.push(index);
    return [a, b];
  });
  check(nodes.every(n => n.incident.length === 2), '轮廓有开口或分叉，或端点偏差超过 1e-7 mm。源文件的闭合标志可能依赖较大容差；本工具未自动补缝');
  const seen = new Set(), ordered = [];
  let current = links[0][0];
  while (seen.size < edges.length) {
    const next = nodes[current].incident.find(index => !seen.has(index));
    check(next !== undefined, '轮廓包含多个环；复合边只支持一个环');
    seen.add(next);
    const [a, b] = links[next];
    // BRepBuilderAPI_MakeWire can reorder and orient exact original edges.
    ordered.push(edges[next]);
    current = current === a ? b : a;
  }
  check(current === links[0][0], '轮廓未闭合');
  let wire;
  try {
    wire = cad.assembleWire(ordered);
    check(closed(wire), '内核未确认轮廓闭合');
    checkShape(wire, cad);
    return wire;
  } catch (error) { dispose(wire); throw error; }
}

export function prepareReferenceProfile(shape, cad, { allowHoles = false } = {}) {
  check(shape && cad?.getOC && cad?.assembleWire && cad?.makeFace, '缺少源形状或 CAD 适配器');
  const resources = [], hold = value => { resources.push(value); return value; };
  let face;
  try {
    if (shape instanceof cad.Face) {
      checkShape(shape, cad);
      check(planarFace(shape, cad), '源 Face 非几何平面');
      const wires = shape.wires; resources.push(...wires);
      check(wires.length >= 1, 'Face 没有边界');
      check(allowHoles || wires.length === 1, '放样截面不支持孔');
      for (const wire of wires) {
        const edges = wire.edges;
        try { const rebuilt = hold(assembleClosed(edges, cad)); checkShape(rebuilt, cad); }
        finally { edges.forEach(dispose); }
      }
      const outer = hold(shape.clone().outerWire());
      check(closed(outer), '外轮廓未闭合');
      face = shape;
      check(cad.measureArea(face) > 1e-10, '截面面积必须为正');
      return { wire: outer, face, release: () => resources.reverse().forEach(dispose) };
    }
    check(shape instanceof cad.Wire || shape instanceof cad.Compound || shape instanceof cad.Edge, '仅接受平面 Face、Wire 或纯边 Compound');
    if (shape instanceof cad.Compound) {
      const faces = shape.faces, solids = shape.solids, wires = shape.wires;
      const edges = shape.edges;
      try {
        check(solids.length === 0 && faces.length <= 1, 'Compound 不能包含实体或多张 Face');
        if (faces.length === 1) {
          const faceEdges = faces[0].edges, faceWires = faces[0].wires;
          try {
            check(edges.length === faceEdges.length && edges.every(edge => faceEdges.some(other => edge.isSame(other))) &&
              wires.length === faceWires.length && wires.every(wire => faceWires.some(other => wire.isSame(other))),
            'Compound 的单 Face 外还有游离边或 Wire');
          } finally { faceEdges.forEach(dispose); faceWires.forEach(dispose); }
          const profile = prepareReferenceProfile(faces[0], cad, { allowHoles });
          const face = faces[0]; faces.length = 0;
          return { ...profile, release: () => { profile.release(); dispose(face); } };
        }
        check(wires.length === 0, '纯边 Compound 不能包含 Wire');
      } finally { faces.forEach(dispose); solids.forEach(dispose); wires.forEach(dispose); edges.forEach(dispose); }
    }
    const edges = shape.edges; resources.push(...edges);
    const wire = hold(assembleClosed(edges, cad));
    face = hold(cad.makeFace(wire));
    check(planarFace(face, cad), '截面不共面');
    checkShape(face, cad, '截面 Face');
    check(cad.measureArea(face) > 1e-10, '截面面积必须为正');
    return { wire, face, release: () => resources.reverse().forEach(dispose) };
  } catch (error) { resources.reverse().forEach(dispose); throw error; }
}
