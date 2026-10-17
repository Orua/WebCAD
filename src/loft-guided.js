const TAU = Math.PI * 2;
const EPS = 1e-9;
const dispose = value => { try { value?.delete?.(); } catch {} };
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = (a, name) => { const n = norm(a); if (!(n > EPS)) throw coded('GUIDED_LOFT_INVALID_FRAME', `${name} must be non-zero`); return mul(a, 1 / n); };
const close = (a, b, t) => norm(sub(a, b)) <= t;
const coded = (code, message, fields = {}) => Object.assign(new Error(message), { code, ...fields });
const finitePoint = (p, name, size = 3) => {
  if (!Array.isArray(p) || p.length !== size || p.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw coded('GUIDED_LOFT_INVALID_INPUT', `${name} must be a finite ${size}-component point`);
  return p.slice();
};

function ellipseEdges(widthMm, depthMm) {
  const a = widthMm / 2, b = depthMm / 2, k = 4 * Math.tan(Math.PI / 8) / 3;
  return [
    [[0, b], [k * a, b], [a, k * b], [a, 0]],
    [[a, 0], [a, -k * b], [k * a, -b], [0, -b]],
    [[0, -b], [-k * a, -b], [-a, -k * b], [-a, 0]],
    [[-a, 0], [-a, k * b], [-k * a, b], [0, b]],
  ];
}

function prepareProfile(profile, index) {
  if (!profile || typeof profile !== 'object') throw coded('GUIDED_LOFT_INVALID_PROFILE', `sections[${index}].profile is required`);
  let edges;
  if (profile.kind === 'ellipse') {
    if (!(Number.isFinite(profile.widthMm) && profile.widthMm > 0 && Number.isFinite(profile.depthMm) && profile.depthMm > 0)) throw coded('GUIDED_LOFT_INVALID_PROFILE', `sections[${index}] ellipse widthMm/depthMm must be positive`);
    edges = ellipseEdges(profile.widthMm, profile.depthMm);
  } else if (profile.kind === 'quad') {
    if (!Array.isArray(profile.edges) || profile.edges.length !== 4) throw coded('GUIDED_LOFT_INVALID_PROFILE', `sections[${index}] quad requires four ordered cubic profile edges`);
    edges = profile.edges.map((edge, i) => {
      if (!Array.isArray(edge) || edge.length !== 4) throw coded('GUIDED_LOFT_INVALID_PROFILE', `sections[${index}].profile.edges[${i}] requires four cubic Bezier poles`);
      return edge.map((p, j) => finitePoint(p, `sections[${index}].profile.edges[${i}][${j}]`, 2));
    });
    for (let i = 0; i < 4; i++) if (!close(edges[i][3], edges[(i + 1) % 4][0], 1e-7)) throw coded('GUIDED_LOFT_PROFILE_OPEN', `sections[${index}] profile edge ${i} does not join edge ${(i + 1) % 4}`);
  } else throw coded('GUIDED_LOFT_INVALID_PROFILE', `sections[${index}].profile.kind must be ellipse or quad`);
  return edges;
}

function frameAxes(frame, index) {
  if (!frame || typeof frame !== 'object') throw coded('GUIDED_LOFT_INVALID_FRAME', `sections[${index}].frame is required`);
  const origin = finitePoint(frame.centerMm, `sections[${index}].frame.centerMm`);
  const normal = unit(finitePoint(frame.normal, `sections[${index}].frame.normal`), `sections[${index}].frame.normal`);
  const rawX = unit(finitePoint(frame.widthDirection, `sections[${index}].frame.widthDirection`), `sections[${index}].frame.widthDirection`);
  const projected = sub(rawX, mul(normal, dot(rawX, normal)));
  if (norm(projected) < 1e-7) throw coded('GUIDED_LOFT_INVALID_FRAME', `sections[${index}].frame.widthDirection is parallel to normal`);
  const x = unit(projected, `sections[${index}].frame.widthDirection`), y = unit(cross(normal, x), `sections[${index}].frame secondary axis`);
  return { origin, normal, x, y };
}

function mapProfile(edges, axes) {
  return edges.map(edge => edge.map(([x, y]) => add(axes.origin, add(mul(axes.x, x), mul(axes.y, y)))));
}

function validate(params) {
  if (!params || typeof params !== 'object') throw coded('GUIDED_LOFT_INVALID_INPUT', 'guidedLoft parameters are required');
  if (!Array.isArray(params.sections) || params.sections.length < 2 || params.sections.length > 32) throw coded('GUIDED_LOFT_INVALID_SECTIONS', 'sections must contain 2–32 ordered profile+frame sections');
  const sections = params.sections.map((s, i) => ({ axes: frameAxes(s?.frame, i), edges: prepareProfile(s?.profile, i) }));
  const centers = sections.map(s => s.axes.origin);
  const increments = centers.slice(1).map((p, i) => norm(sub(p, centers[i])));
  if (increments.some(d => !(d > 1e-7))) throw coded('GUIDED_LOFT_INVALID_SECTIONS', 'adjacent section centers must be distinct');
  const stations = [0]; increments.forEach(d => stations.push(stations.at(-1) + d));
  const worldEdges = sections.map(s => mapProfile(s.edges, s.axes));
  const conditions = { start: params.startCondition ?? 'G0', end: params.endCondition ?? 'G0' };
  for (const [end, condition] of Object.entries(conditions)) if (!['G0', 'G1', 'G2'].includes(condition)) throw coded('GUIDED_LOFT_INVALID_CONDITION', `${end}Condition must be G0, G1, or G2`);
  const matchTo = params.matchTo;
  if ((conditions.start !== 'G0' || conditions.end !== 'G0') && !matchTo) throw coded('GUIDED_LOFT_MATCH_REQUIRED', 'G1/G2 连续约束需要 matchTo，以读取来源特征的实际 B-rep 端部导数。');
  if (matchTo && (!['start', 'end'].includes(matchTo.end) || typeof matchTo.featureId !== 'string' || !matchTo.featureId.trim())) throw coded('GUIDED_LOFT_INVALID_MATCH', 'matchTo 必须提供有效的 featureId 和来源端 end:start|end。');
  if (matchTo && conditions.start !== 'G0' && conditions.end !== 'G0') throw coded('GUIDED_LOFT_SINGLE_MATCH_LIMIT', '单个 matchTo 只能连接一个端点；请将另一端条件设为 G0。');
  if (matchTo && conditions.start === 'G0' && conditions.end === 'G0') throw coded('GUIDED_LOFT_INVALID_MATCH', 'matchTo 需要 startCondition 或 endCondition 中恰有一个为 G1/G2。');
  const fitToleranceMm = params.fitToleranceMm ?? 0.01;
  const guideToleranceMm = params.guideToleranceMm ?? 0.05;
  const matchToleranceMm = params.matchToleranceMm ?? 0.05;
  for (const [name, value] of Object.entries({ fitToleranceMm, guideToleranceMm, matchToleranceMm })) if (!(Number.isFinite(value) && value > 0 && value <= 0.5)) throw coded('GUIDED_LOFT_INVALID_TOLERANCE', `${name} must be in (0,0.5] mm`);
  const guides = params.guides ?? [];
  if (!Array.isArray(guides) || guides.length < 1 || guides.length > 2) throw coded('GUIDED_LOFT_INVALID_GUIDES', 'guided loft requires one or two boundary guides');
  const guideKeys = new Set();
  const preparedGuides = guides.map((guide, gi) => {
    if (!['dorsal', 'ventral', 'lateral'].includes(guide?.role)) throw coded('GUIDED_LOFT_INVALID_GUIDES', `guides[${gi}].role must be dorsal, ventral, or lateral`);
    if (!Array.isArray(guide.pointsMm) || guide.pointsMm.length !== sections.length) throw coded('GUIDED_LOFT_INVALID_GUIDES', `guides[${gi}].pointsMm must have one point per section`);
    const points = guide.pointsMm.map((p, i) => finitePoint(p, `guides[${gi}].pointsMm[${i}]`));
    let key = null;
    for (let i = 0; i < sections.length; i++) {
      let best = { distance: Infinity };
      for (let edge = 0; edge < 4; edge++) for (const pole of [0, 3]) {
        const candidate = worldEdges[i][edge][pole], distance = norm(sub(candidate, points[i]));
        if (distance < best.distance) best = { distance, edge, pole };
      }
      if (best.distance > guideToleranceMm) throw coded('GUIDED_LOFT_GUIDE_OFF_PROFILE', `guide ${gi} section ${i} misses the actual profile boundary by ${best.distance.toFixed(6)} mm`, { deviationMm: best.distance, limitMm: guideToleranceMm });
      const candidateKey = `${best.edge}:${best.pole}`;
      if (key !== null && key !== candidateKey) throw coded('GUIDED_LOFT_GUIDE_REORDERED', `guide ${gi} changes profile boundary corner between sections`);
      key = candidateKey;
    }
    if (guideKeys.has(key)) throw coded('GUIDED_LOFT_GUIDE_DUPLICATE', `two guides cannot occupy the same profile boundary corner ${key}`);
    guideKeys.add(key);
    return { role: guide.role, points, edge: Number(key.split(':')[0]), pole: Number(key.split(':')[1]) };
  });
  // The supplied rails replace the corresponding measured profile corners in the control net.
  for (const guide of preparedGuides) for (let i = 0; i < sections.length; i++) worldEdges[i][guide.edge][guide.pole] = guide.points[i].slice();
  return { sections, worldEdges, stations, conditions, matchTo, guides: preparedGuides, fitToleranceMm, guideToleranceMm, matchToleranceMm };
}

function derivativeAt(values, x, i, order) {
  const n = values.length;
  if (n === 2) return order === 1 ? mul(sub(values[1], values[0]), 1 / (x[1] - x[0])) : [0, 0, 0];
  let a = i, b = i + 1, c = i + 2;
  if (i === n - 1) { a = n - 3; b = n - 2; c = n - 1; }
  else if (i > 0) { a = i - 1; b = i; c = i + 1; }
  const x0 = x[a], x1 = x[b], x2 = x[c], p0 = values[a], p1 = values[b], p2 = values[c];
  if (order === 2) return add(add(mul(p0, 2 / ((x0 - x1) * (x0 - x2))), mul(p1, 2 / ((x1 - x0) * (x1 - x2)))), mul(p2, 2 / ((x2 - x0) * (x2 - x1))));
  return add(add(mul(p0, (2 * x[i] - x1 - x2) / ((x0 - x1) * (x0 - x2))), mul(p1, (2 * x[i] - x0 - x2) / ((x1 - x0) * (x1 - x2)))), mul(p2, (2 * x[i] - x0 - x1) / ((x2 - x0) * (x2 - x1))));
}

function quinticPoles(p0, p1, d0, d1, dd0, dd1, interval) {
  const h = interval, D0 = mul(d0, h), D1 = mul(d1, h), DD0 = mul(dd0, h * h), DD1 = mul(dd1, h * h);
  return [p0, add(p0, mul(D0, 1 / 5)), add(add(p0, mul(D0, 2 / 5)), mul(DD0, 1 / 20)), add(sub(p1, mul(D1, 2 / 5)), mul(DD1, 1 / 20)), sub(p1, mul(D1, 1 / 5)), p1];
}

function recipeSections(matchFeature) {
  if (!matchFeature || typeof matchFeature !== 'object') return null;
  const params = matchFeature.params ?? matchFeature;
  return Array.isArray(params.sections) ? params.sections : null;
}

function endpointSurfaceJets(shape, sourceStart, sourceEnd, sourceEndName, h, tol, oc) {
  const expected = [sourceStart, sourceEnd], faces = shape.faces, found = [];
  const point = value => [value.X(), value.Y(), value.Z()];
  const boundary = (surface, vIndex) => Array.from({ length: 4 }, (_, u) => {
    const p = surface.Pole(u + 1, vIndex); try { return point(p); } finally { dispose(p); }
  });
  const curveDistance = (a, b, reversed) => Math.max(...a.map((p, i) => norm(sub(p, b[reversed ? 3 - i : i]))));
  try {
    for (const face of faces) {
      if (face.geomType !== 'BSPLINE_SURFACE') continue;
      let surface;
      try {
        surface = oc.BRep_Tool.Surface(face.wrapped);
        if (surface.UDegree() !== 3 || surface.VDegree() !== 5 || surface.NbUPoles() !== 4 || surface.NbVPoles() !== 6) { dispose(surface); surface = null; continue; }
        const ends = [boundary(surface, 1), boundary(surface, 6)];
        const begins = [boundary(surface, 1), boundary(surface, 6)];
        const assignments = [];
        for (const [startSide, startPoles] of ends.entries()) for (const [endSide, endPoles] of begins.entries()) {
          if (startSide === endSide) continue;
          const matches = [];
          for (let edge = 0; edge < 4; edge++) {
            const a = expected[0][edge], b = expected[1][edge];
            const forward = Math.max(curveDistance(startPoles, a, false), curveDistance(endPoles, b, false));
            const reverse = Math.max(curveDistance(startPoles, a, true), curveDistance(endPoles, b, true));
            const best = Math.min(forward, reverse);
            if (best <= tol) matches.push({ edge, reverse: reverse < forward, error: best });
          }
          if (matches.length === 1) assignments.push({ startSide, endSide, ...matches[0] });
        }
        if (assignments.length === 1) found.push({ surface, face, ...assignments[0] });
        else dispose(surface);
      } catch { dispose(surface); }
    }
    const byEdge = new Map();
    for (const item of found) {
      const list = byEdge.get(item.edge) ?? []; list.push(item); byEdge.set(item.edge, list);
    }
    if (found.length !== 4 || byEdge.size !== 4 || [...byEdge.values()].some(rows => rows.length !== 1)) throw coded('GUIDED_LOFT_MATCH_SOURCE_UNCONFIRMED', '来源不是可唯一确认的 guidedLoft 末区间四个 B-spline 面；拒绝推测接缝导数。');
    const d1 = Array(16), d2 = Array(16);
    for (const item of found) for (let profilePole = 0; profilePole < 4; profilePole++) {
      const u = item.reverse ? 4 - profilePole : profilePole + 1;
      const endpointSide = sourceEndName === 'start' ? item.startSide : item.endSide;
      const indices = endpointSide === 0 ? [1, 2, 3] : [6, 5, 4];
      const poles = indices.map(v => item.surface.Pole(u, v));
      try {
        const [p0, p1, p2] = poles.map(point), key = item.edge * 4 + profilePole;
        d1[key] = mul(sub(sourceEndName === 'start' ? p1 : p0, sourceEndName === 'start' ? p0 : p1), 5 / h);
        d2[key] = mul(add(sub(p2, mul(p1, 2)), p0), 20 / (h * h));
      } finally { poles.forEach(dispose); }
    }
    return { d1, d2 };
  } finally {
    const unique = new Set(found.map(row => row.surface)); unique.forEach(dispose);
    faces.forEach(dispose);
  }
}

function prepareMatch(input, context, cad) {
  if (!input.matchTo) return null;
  const feature = context?.matchFeature, shape = context?.matchShape;
  if (!feature || feature.id !== input.matchTo.featureId || !shape) throw coded('GUIDED_LOFT_MATCH_CONTEXT_REQUIRED', 'matchTo 来源特征或其当前 B-rep 不存在，或 featureId 不匹配。');
  const priorSections = recipeSections(feature);
  if (!priorSections || priorSections.length < 2 || priorSections.length > 32) throw coded('GUIDED_LOFT_MATCH_RECIPE_INVALID', 'matchTo 来源配方必须包含 2–32 个带 frame 的 profile 截面。');
  const priorInput = validate({ sections: priorSections, guides: [{ role: 'lateral', pointsMm: priorSections.map((s, i) => {
    const axes = frameAxes(s.frame, i), profile = prepareProfile(s.profile, i), world = mapProfile(profile, axes); return world[0][3];
  }) }] });
  const priorWorld = priorInput.worldEdges;
  const targetEnd = input.conditions.start !== 'G0' ? 'start' : 'end';
  const currentIndex = targetEnd === 'start' ? 0 : input.worldEdges.length - 1;
  const priorIndex = input.matchTo.end === 'start' ? 0 : priorWorld.length - 1;
  const tol = input.matchToleranceMm;
  for (let e = 0; e < 4; e++) for (let p = 0; p < 4; p++) if (!close(input.worldEdges[currentIndex][e][p], priorWorld[priorIndex][e][p], tol)) throw coded('GUIDED_LOFT_MATCH_SECTION_MISMATCH', `当前目标端与来源 ${input.matchTo.end} 端的截面控制点 ${e}:${p} 相差超过 ${tol} mm。`);
  const probes = [];
  for (let e = 0; e < 4; e++) for (let k = 0; k <= 4; k++) probes.push(bezierPoint(priorWorld[priorIndex][e], k / 4));
  for (const xyz of probes) {
    const vertex = cad.makeVertex(xyz);
    try {
      const distance = cad.measureDistanceBetween(shape, vertex);
      if (!Number.isFinite(distance) || distance > tol) throw coded('GUIDED_LOFT_MATCH_BREP_MISMATCH', `来源 B-rep 未在 ${tol} mm 内覆盖其配方端部边界（距离 ${distance} mm）。`, { deviationMm: distance, limitMm: tol });
    } finally { dispose(vertex); }
  }
  const pair = priorIndex === 0 ? [0, 1] : [priorWorld.length - 2, priorWorld.length - 1];
  const h = norm(sub(priorSections[pair[1]].frame.centerMm, priorSections[pair[0]].frame.centerMm));
  const jets = endpointSurfaceJets(shape, priorWorld[pair[0]], priorWorld[pair[1]], input.matchTo.end, h, tol, cad.getOC());
  const reverseD1 = targetEnd === input.matchTo.end;
  return { featureId: feature.id, targetEnd, sourceEnd: input.matchTo.end, currentIndex, d1: jets.d1.map(v => reverseD1 ? mul(v, -1) : v), d2: jets.d2, shape };
}

function bezierPoint(poles, t) {
  let values = poles.map(p => p.slice());
  while (values.length > 1) values = values.slice(0, -1).map((p, i) => add(mul(p, 1 - t), mul(values[i + 1], t)));
  return values[0];
}

function heldArray1(oc, values, Type, hold) {
  const array = hold(new Type(1, values.length));
  values.forEach((value, i) => array.SetValue(i + 1, value));
  return array;
}

function makeBezierCurve(poles, oc, hold) {
  const points = poles.map(p => hold(new oc.gp_Pnt(...p)));
  const array = heldArray1(oc, points, oc.NCollection_Array1_gp_Pnt, hold);
  return hold(new oc.Geom_BezierCurve(array));
}

function makeWire(edges, oc, hold) {
  const wireBuilder = hold(new oc.BRepBuilderAPI_MakeWire());
  for (const poles of edges) {
    const curve = makeBezierCurve(poles, oc, hold);
    const edgeBuilder = hold(new oc.BRepBuilderAPI_MakeEdge(curve));
    if (!edgeBuilder.IsDone()) throw coded('GUIDED_LOFT_CAP_FAILED', 'OCCT could not build a closed section edge');
    const edge = hold(edgeBuilder.Edge());
    wireBuilder.Add(edge);
  }
  if (!wireBuilder.IsDone()) throw coded('GUIDED_LOFT_CAP_FAILED', 'OCCT could not close a section wire');
  return hold(wireBuilder.Wire());
}

function makePatchSurface(edgePoles, oc, hold) {
  const poles = hold(new oc.NCollection_Array2_gp_Pnt(1, 4, 1, 6));
  for (let v = 0; v < 4; v++) for (let u = 0; u < 6; u++) {
    const point = hold(new oc.gp_Pnt(...edgePoles[v][u]));
    poles.SetValue(v + 1, u + 1, point);
  }
  const uKnots = heldArray1(oc, [0, 1], oc.NCollection_Array1_double, hold);
  const vKnots = heldArray1(oc, [0, 1], oc.NCollection_Array1_double, hold);
  const uMults = heldArray1(oc, [4, 4], oc.NCollection_Array1_int, hold);
  const vMults = heldArray1(oc, [6, 6], oc.NCollection_Array1_int, hold);
  // NCollection_Array2 rows are the U direction in this binding: 4 cubic profile poles.
  // Columns are V: 6 quintic longitudinal Hermite poles.
  return hold(new oc.Geom_BSplineSurface(poles, uKnots, vKnots, uMults, vMults, 3, 5, false, false));
}

function validateResult(shape, cad, oc, hold) {
  const analyzer = hold(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
  if (!analyzer.IsValid()) throw coded('GUIDED_LOFT_INVALID_BREP', 'guided loft sewn B-rep failed BRepCheck_Analyzer');
  const solids = shape.solids;
  try {
    let volumeMm3 = cad.measureVolume(shape);
    if (solids.length === 1 && Number.isFinite(volumeMm3) && volumeMm3 < 0) {
      shape.wrapped.Reverse();
      volumeMm3 = cad.measureVolume(shape);
    }
    if (solids.length !== 1 || !(Number.isFinite(volumeMm3) && volumeMm3 > 1e-9)) throw coded('GUIDED_LOFT_INVALID_SOLID', 'guided loft must produce one valid positive-volume solid', { solids: solids.length, volumeMm3 });
    return volumeMm3;
  } finally { solids.forEach(dispose); }
}

function evalQuintic(poles, t) { return bezierPoint(poles, t); }

function buildProfileLoft(input, cad, context) {
  const oc = cad?.getOC?.();
  if (!oc) throw coded('GUIDED_LOFT_NO_OCCT', 'OpenCascade runtime is not initialized');
  const match = prepareMatch(input, context, cad);
  if (input.matchTo && input.conditions[input.matchTo.end] === 'G1' && match?.d1.some(v => !v.every(Number.isFinite))) throw coded('GUIDED_LOFT_MATCH_JET_INVALID', 'preceding feature endpoint tangent is not finite');
  const held = [], hold = value => { held.push(value); return value; };
  let result, stage = 'create patches';
  try {
    const faces = [];
    // Each original profile edge remains a separate corresponding face patch; no mesh conversion occurs.
    for (let intervalIndex = 0; intervalIndex < input.sections.length - 1; intervalIndex++) {
      const h = input.stations[intervalIndex + 1] - input.stations[intervalIndex];
      for (let edge = 0; edge < 4; edge++) {
        stage = `construct spline patch poles for interval ${intervalIndex}, edge ${edge}`;
        const patchPoles = [];
        for (let profilePole = 0; profilePole < 4; profilePole++) {
          const values = input.worldEdges.map(row => row[edge][profilePole]);
          const d0 = derivativeAt(values, input.stations, intervalIndex, 1);
          const d1 = derivativeAt(values, input.stations, intervalIndex + 1, 1);
          const dd0 = derivativeAt(values, input.stations, intervalIndex, 2);
          const dd1 = derivativeAt(values, input.stations, intervalIndex + 1, 2);
          const key = edge * 4 + profilePole;
          let startD = d0, startDD = dd0, endD = d1, endDD = dd1;
          if (match && match.currentIndex === intervalIndex) {
            const condition = input.conditions.start;
            if (condition !== 'G0') { startD = match.d1[key]; if (condition === 'G2') startDD = match.d2[key]; }
          }
          if (match && match.currentIndex === intervalIndex + 1) {
            const condition = input.conditions.end;
            if (condition !== 'G0') { endD = match.d1[key]; if (condition === 'G2') endDD = match.d2[key]; }
          }
          patchPoles.push(quinticPoles(values[intervalIndex], values[intervalIndex + 1], startD, endD, startDD, endDD, h));
        }
        const rows = patchPoles;
        stage = `construct Geom_BSplineSurface for interval ${intervalIndex}, edge ${edge}`;
        const surface = makePatchSurface(rows, oc, hold);
        stage = `make B-rep face for interval ${intervalIndex}, edge ${edge}`;
        const faceBuilder = hold(new oc.BRepBuilderAPI_MakeFace(surface, input.fitToleranceMm));
        if (!faceBuilder.IsDone()) throw coded('GUIDED_LOFT_PATCH_FAILED', `OCCT could not make profile patch ${edge} for section interval ${intervalIndex}`);
        faces.push(hold(faceBuilder.Face()));
      }
    }
    stage = 'build planar end caps';
    const startWire = makeWire(input.worldEdges[0], oc, hold);
    const endWire = makeWire(input.worldEdges.at(-1), oc, hold);
    for (const wire of [startWire, endWire]) {
      const faceBuilder = hold(new oc.BRepBuilderAPI_MakeFace(wire, true));
      if (!faceBuilder.IsDone()) throw coded('GUIDED_LOFT_CAP_FAILED', 'OCCT could not create an end plane cap from the quad profile wire');
      faces.push(hold(faceBuilder.Face()));
    }
    stage = 'sew faces';
    const sewing = hold(new oc.BRepBuilderAPI_Sewing(input.fitToleranceMm, true, true, true, false));
    for (const face of faces) sewing.Add(face);
    sewing.Perform();
    if (sewing.NbFreeEdges() !== 0 || sewing.NbMultipleEdges() !== 0) throw coded('GUIDED_LOFT_SEW_FAILED', 'four B-rep profile patches and two planar caps did not sew into a closed shell', { freeEdges: sewing.NbFreeEdges(), multipleEdges: sewing.NbMultipleEdges() });
    const sewed = hold(sewing.SewedShape());
    const shell = hold(oc.TopoDS.Shell(sewed));
    stage = 'make solid';
    const solidBuilder = hold(new oc.BRepBuilderAPI_MakeSolid(shell));
    if (!solidBuilder.IsDone()) throw coded('GUIDED_LOFT_SOLID_FAILED', 'OCCT could not create a solid from the sewn quad shell');
    result = cad.cast(solidBuilder.Solid());
    stage = 'validate solid';
    const volumeMm3 = validateResult(result, cad, oc, hold);
    stage = 'measure guide rails';
    const maxGuideDeviationMm = measureGuideDeviation(input, result, cad, oc, hold, match);
    const fitErrorMm = measureSectionFit(input, result, cad);
    if (fitErrorMm > input.fitToleranceMm) throw coded('GUIDED_LOFT_FIT_TOLERANCE', `actual section-to-B-rep deviation ${fitErrorMm} mm exceeds fit tolerance ${input.fitToleranceMm} mm`, { fitErrorMm, limitMm: input.fitToleranceMm });
    if (maxGuideDeviationMm > input.guideToleranceMm) throw coded('GUIDED_LOFT_GUIDE_DEVIATION', `actual B-rep boundary differs from guide by ${maxGuideDeviationMm} mm (limit ${input.guideToleranceMm} mm)`, { maxGuideDeviationMm, limitMm: input.guideToleranceMm });
    const report = {
      mechanism: 'four exact cubic-profile × quintic-Hermite B-spline B-rep patches per section interval, two planar caps, OCCT sewing and solid validation',
      sectionCount: input.sections.length, patchCount: (input.sections.length - 1) * 4, volumeMm3,
      maxGuideDeviationMm, fitToleranceMm: input.fitToleranceMm, fitErrorMm,
      guides: input.guides.map(g => ({ role: g.role, boundaryEdge: g.edge, boundaryPole: g.pole })),
      startJet: endpointJet(input, 'start', match), endJet: endpointJet(input, 'end', match),
      matchTo: match ? { featureId: match.featureId, sourceEnd: match.sourceEnd, targetEnd: match.targetEnd, matchedActualBrep: true } : null,
    };
    const complete = result;
    Object.defineProperty(complete, 'guidedLoftReport', { value: report, enumerable: false });
    result = null;
    return complete;
  } catch (error) {
    if (error?.code) throw error;
    throw coded('GUIDED_LOFT_BUILD_FAILED', `guided loft B-rep construction failed during ${stage}: ${error?.message ?? String(error)}`, { cause: error, stage });
  } finally { dispose(result); held.reverse().forEach(dispose); }
}

function endpointJet(input, end, match) {
  const index = end === 'start' ? 0 : input.worldEdges.length - 1;
  const condition = input.conditions[end];
  const result = { condition, sectionIndex: index, source: 'section profile derivatives' };
  if (match?.currentIndex === index) {
    result.source = `matchTo:${match.featureId}`;
    result.d1Mm = match.d1.map(v => v.slice());
    if (condition === 'G2') result.d2Mm = match.d2.map(v => v.slice());
  } else {
    result.d1Mm = input.worldEdges[0].flat().map((_, k) => {
      const e = Math.floor(k / 4), p = k % 4, vals = input.worldEdges.map(row => row[e][p]); return derivativeAt(vals, input.stations, index, 1);
    });
    if (condition === 'G2') result.d2Mm = input.worldEdges[0].flat().map((_, k) => {
      const e = Math.floor(k / 4), p = k % 4, vals = input.worldEdges.map(row => row[e][p]); return derivativeAt(vals, input.stations, index, 2);
    });
  }
  return result;
}

function measureSectionFit(input, shape, cad) {
  let maximum = 0;
  for (const row of input.worldEdges) for (const edge of row) for (let sample = 0; sample <= 8; sample++) {
    const vertex = cad.makeVertex(bezierPoint(edge, sample / 8));
    try { maximum = Math.max(maximum, cad.measureDistanceBetween(shape, vertex)); }
    finally { dispose(vertex); }
  }
  return maximum;
}

function measureGuideDeviation(input, shape, cad, oc, hold, match = null) {
  let maxDeviationMm = 0;
  for (const guide of input.guides) {
    for (let interval = 0; interval < guide.points.length - 1; interval++) {
      const key = guide.edge * 4 + guide.pole;
      const values = input.worldEdges.map(row => row[guide.edge][guide.pole]);
      const h = input.stations[interval + 1] - input.stations[interval];
      let d0 = derivativeAt(values, input.stations, interval, 1), d1 = derivativeAt(values, input.stations, interval + 1, 1);
      let dd0 = derivativeAt(values, input.stations, interval, 2), dd1 = derivativeAt(values, input.stations, interval + 1, 2);
      if (match?.currentIndex === interval && input.conditions.start !== 'G0') { d0 = match.d1[key]; if (input.conditions.start === 'G2') dd0 = match.d2[key]; }
      if (match?.currentIndex === interval + 1 && input.conditions.end !== 'G0') { d1 = match.d1[key]; if (input.conditions.end === 'G2') dd1 = match.d2[key]; }
      const poles = quinticPoles(values[interval], values[interval + 1], d0, d1, dd0, dd1, h);
      for (let sample = 0; sample <= 8; sample++) {
        const xyz = evalQuintic(poles, sample / 8), vertex = cad.makeVertex(xyz);
        try { maxDeviationMm = Math.max(maxDeviationMm, cad.measureDistanceBetween(shape, vertex)); }
        finally { dispose(vertex); }
      }
    }
  }
  return maxDeviationMm;
}

function measureCurveDeviation(curve, shape, cad, oc, hold) {
  let maxDeviationMm = 0;
  const first = curve.FirstParameter(), last = curve.LastParameter();
  for (let sample = 0; sample <= 32; sample++) {
    const point = hold(new oc.gp_Pnt()), parameter = first + (last - first) * sample / 32;
    curve.D0(parameter, point);
    const vertex = cad.makeVertex([point.X(), point.Y(), point.Z()]);
    try { maxDeviationMm = Math.max(maxDeviationMm, cad.measureDistanceBetween(shape, vertex)); }
    finally { dispose(vertex); }
  }
  return maxDeviationMm;
}

function buildCircularPipe(params, cad) {
  const fail = (code, message) => { throw coded(code, message); };
  if (!Array.isArray(params.sections) || params.sections.length !== 2 || params.sections.some(s => !(Number.isFinite(s.radiusMm) && s.radiusMm > 0))) fail('GUIDED_LOFT_INVALID_INPUT', 'legacy circular mode requires exactly two centerMm/radiusMm sections');
  const a = params.sections[0], b = params.sections[1];
  if (Math.abs(a.radiusMm - b.radiusMm) > 1e-8) fail('GUIDED_LOFT_CIRCULAR_RADIUS_CHANGE', 'legacy circular pipe mode requires equal end radii');
  const points = params.spinePointsMm ?? [a.centerMm, b.centerMm];
  if (!Array.isArray(points) || points.length < 2 || points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(v => !Number.isFinite(v)))) fail('GUIDED_LOFT_INVALID_INPUT', 'spinePointsMm must contain finite XYZ points');
  const guides = params.guides ?? [];
  if (guides.length > 1 || guides.some(g => !Array.isArray(g.pointsMm) || g.pointsMm.length !== points.length)) fail('GUIDED_LOFT_INVALID_GUIDES', 'legacy circular pipe accepts at most one guide with one point per spine point');
  const oc = cad?.getOC?.();
  if (!oc) fail('GUIDED_LOFT_NO_OCCT', 'OpenCascade runtime is not initialized');
  const held = [], hold = value => { held.push(value); return value; };
  let result;
  try {
    const makeCurve = list => {
      const array = hold(new oc.NCollection_Array1_gp_Pnt(1, list.length));
      list.forEach((p, i) => array.SetValue(i + 1, hold(new oc.gp_Pnt(...p))));
      const harray = hold(new oc.NCollection_HArray1_gp_Pnt(array));
      const interpolate = hold(new oc.GeomAPI_Interpolate(harray, false, 1e-7));
      const startTangent = params.startTangentMm, endTangent = params.endTangentMm;
      if ((params.startCondition ?? 'G0') === 'G1' || (params.endCondition ?? 'G0') === 'G1') {
        if (!startTangent || !endTangent) fail('GUIDED_LOFT_MATCH_REQUIRED', 'legacy circular G1 requires startTangentMm and endTangentMm');
        const first = hold(new oc.gp_Vec(...startTangent)), last = hold(new oc.gp_Vec(...endTangent)); interpolate.Load(first, last, false);
      }
      interpolate.Perform();
      if (!interpolate.IsDone()) fail('GUIDED_LOFT_CURVE_FAILED', 'OCCT interpolation failed');
      return hold(interpolate.Curve());
    };
    const spine = makeCurve(points);
    const edgeBuilder = hold(new oc.BRepBuilderAPI_MakeEdge(spine));
    const edge = hold(edgeBuilder.Edge()), wireBuilder = hold(new oc.BRepBuilderAPI_MakeWire(edge)), wire = hold(wireBuilder.Wire());
    const builder = hold(new oc.BRepOffsetAPI_MakePipeShell(wire)); builder.SetMode(false);
    let guideCurve;
    if (guides.length) {
      guideCurve = makeCurve(guides[0].pointsMm);
      const guideEdge = hold(new oc.BRepBuilderAPI_MakeEdge(guideCurve));
      const guideWireBuilder = hold(new oc.BRepBuilderAPI_MakeWire(guideEdge.Edge()));
      const guideWire = hold(guideWireBuilder.Wire());
      builder.SetMode(guideWire, true, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
    }
    const endpointTangents = ['start', 'end'].map(end => {
      const parameter = end === 'start' ? spine.FirstParameter() : spine.LastParameter(), p = hold(new oc.gp_Pnt()), v = hold(new oc.gp_Vec());
      spine.D1(parameter, p, v); return [v.X(), v.Y(), v.Z()];
    });
    for (const [i, section] of [a, b].entries()) {
      const tangent = unit(endpointTangents[i], `${i ? 'end' : 'start'} tangent`), center = section.centerMm;
      let x = guides.length ? sub(guides[0].pointsMm[i ? guides[0].pointsMm.length - 1 : 0], center) : [1, 0, 0];
      x = sub(x, mul(tangent, dot(x, tangent)));
      if (norm(x) < 1e-7) x = sub([0, 1, 0], mul(tangent, tangent[1]));
      const plane = hold(new cad.Plane(center, unit(x, 'profile width'), tangent));
      const circle = hold(cad.drawCircle(section.radiusMm)), sketch = hold(circle.sketchOnPlane(plane)), sectionWire = hold(sketch.wire), location = hold(cad.makeVertex(center));
      builder.Add(sectionWire.wrapped, location.wrapped, false, true);
    }
    builder.SetTolerance(1e-5, 1e-5, 1e-3); builder.SetMaxDegree(8); builder.Build();
    if (!builder.IsDone() || !builder.MakeSolid()) fail('GUIDED_LOFT_PIPE_FAILED', 'OCCT could not build and cap the circular pipe shell');
    result = cad.cast(builder.Shape());
    const volumeMm3 = validateResult(result, cad, oc, hold);
    const maxGuideDeviationMm = guides.length ? measureCurveDeviation(guideCurve, result, cad, oc, hold) : null;
    if (maxGuideDeviationMm !== null && maxGuideDeviationMm > (params.guideToleranceMm ?? 0.05)) fail('GUIDED_LOFT_GUIDE_DEVIATION', `actual circular B-rep guide deviation ${maxGuideDeviationMm} mm exceeds tolerance`);
    const report = { mechanism: 'OCCT MakePipeShell circular profile', volumeMm3, maxGuideDeviationMm };
    const complete = result; Object.defineProperty(complete, 'guidedLoftReport', { value: report }); result = null; return complete;
  } catch (error) { if (error?.code) throw error; throw coded('GUIDED_LOFT_BUILD_FAILED', `circular guided loft failed: ${error?.message ?? String(error)}`, { cause: error }); }
  finally { dispose(result); held.reverse().forEach(dispose); }
}

/** Build a generic four-patch guided B-rep loft. The circular prototype signature remains supported. */
export function buildGuidedLoft(params, cad, context = {}) {
  if (params?.sections?.[0]?.profile && params.sections[0]?.frame) return buildProfileLoft(validate(params), cad, context);
  return buildCircularPipe(params, cad);
}

export function validateGuidedLoftParams(params) { return validate(params); }
