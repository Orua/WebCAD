import {topologyDetails} from './topology.js';
import {assertRoundingQualityEvidence, assertAutomaticPolishingQualityEvidence} from './quality-evidence.js';
import {measureKernelEdgeFaceNormal} from './kernel-normal.js';

const dispose = value => {try {value?.delete?.();} catch {}};
const vec = value => [value.X(), value.Y(), value.Z()];
const tuple = value => {try {return value.toTuple();} finally {dispose(value);}};
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const sub = (a, b) => a.map((value, i) => value - b[i]);
const mul = (a, scale) => a.map(value => value * scale);
const norm = value => Math.hypot(...value);
const distance = (a, b) => norm(sub(a, b));
const unit = value => {const length = norm(value); return length > 1e-12 ? mul(value, 1 / length) : null;};
const finitePoint = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (norm(a) * norm(b))))) * 180 / Math.PI;
const stations = [.0005, .01, .1, .25, .5, .75, .9, .99, .9995];
const positionToleranceMm = 1e-5;
const volumeToleranceMm3 = 1e-7;
function fail(check, message, details = {}, code = 'GEOMETRY_INVALID') {
  throw Object.assign(new Error(message), {code, recoveryAction: 'CORRECT_PARAMETERS',
    report: {qualityGate: 'rounding-measured-BREP-v1', failedCheck: check, ...details}});
}

function volume(shape, oc) {
  // OC returns a negative integration error for an empty Boolean compound.
  // Empty topology has exactly zero volume; a failed nonempty integral is
  // still rejected rather than treating a numerical error as no material.
  const faces = shape.faces, solids = shape.solids;
  try {if (!faces.length && !solids.length) return 0;}
  finally {faces.forEach(dispose); solids.forEach(dispose);}
  const properties = new oc.GProp_GProps();
  try {
    const error = oc.BRepGProp.VolumePropertiesGK(shape.wrapped, properties, 1e-11, true, true, false, false, false);
    const value = Math.abs(properties.Mass());
    if (!Number.isFinite(error) || error < 0 || !Number.isFinite(value)) fail('volume', 'BRep 材料差集体积量测未收敛');
    return value;
  } finally {dispose(properties);}
}

// Difference measurement must not raise tolerances, attach p-curves, or
// otherwise modify either source or candidate topology. The two-shape Cut
// constructor builds immediately, before safe processing could be enabled.
export function cutRoundingDifferenceNonDestructive(first, second, cad) {
  const oc = cad.getOC(); let builder, objects, tools, progress;
  try {
    builder = new oc.BRepAlgoAPI_Cut();
    builder.SetNonDestructive(true); builder.SetRunParallel(false); builder.SetToFillHistory(false);
    objects = new oc.NCollection_List_TopoDS_Shape(); tools = new oc.NCollection_List_TopoDS_Shape();
    objects.Append(first.wrapped); tools.Append(second.wrapped);
    builder.SetArguments(objects); builder.SetTools(tools);
    progress = new oc.Message_ProgressRange(); builder.Build(progress);
    if (!builder.IsDone() || builder.HasErrors() || !builder.NonDestructive()) {
      fail('material', '非破坏性 BRep 材料差集计算未完成', {}, 'MATERIAL_CHECK_FAILED');
    }
    return cad.cast(builder.Shape());
  } finally {[progress, tools, objects, builder].forEach(dispose);}
}

function bounds(shape) {
  const box = shape.boundingBox;
  try {return box.bounds.map(point => [...point]);} finally {dispose(box);}
}
const pointInBounds = (point, region, tolerance = positionToleranceMm) =>
  point.every((value, i) => value >= region[0][i] - tolerance && value <= region[1][i] + tolerance);
const boundsInBounds = (inner, outer) => inner.every(point => finitePoint(point) && pointInBounds(point, outer));

/** Determined from source geometry before computing any candidate differences. */
export function deriveRoundingInfluenceBounds(rows, sourceEdgeIds, sizeMm) {
  if (!Number.isFinite(sizeMm) || sizeMm <= 0 || !Array.isArray(sourceEdgeIds) || !sourceEdgeIds.length ||
      new Set(sourceEdgeIds).size !== sourceEdgeIds.length) fail('scope', '质量检查缺少明确来源边和正数大小');
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], edgeRegions = [];
  for (const edgeId of sourceEdgeIds) {
    const row = rows[edgeId];
    if (!Number.isInteger(edgeId) || edgeId < 0 || !row || !Array.isArray(row.bounds) ||
        !row.bounds.every(finitePoint) || !Number.isFinite(row.normalAngleDeg) || row.normalAngleDeg < 0 || row.normalAngleDeg >= 180) {
      fail('scope', '来源边的范围或支撑面夹角不能核对', {edgeId});
    }
    const marginMm = Math.max(2 * sizeMm, sizeMm * Math.tan(row.normalAngleDeg * Math.PI / 360));
    if (!Number.isFinite(marginMm)) fail('scope', '局部影响范围不能确定', {edgeId});
    const region = [row.bounds[0].map(value => value - marginMm), row.bounds[1].map(value => value + marginMm)];
    region[0].forEach((value, i) => {low[i] = Math.min(low[i], value);});
    region[1].forEach((value, i) => {high[i] = Math.max(high[i], value);});
    edgeRegions.push({sourceEdgeId: edgeId, marginMm, bounds: region});
  }
  return {bounds: [low, high], edgeRegions, method: 'source-contour-bounds-expanded-by-size-and-dihedral'};
}

// V3 has no requested radius. The source planner selects a finite margin before
// construction, and this function reconstructs the declared bounds from source.
export function derivePolishingInfluenceBounds(rows, sourceEdgeIds, marginMm) {
  if (!Number.isFinite(marginMm) || marginMm <= 0 || !Array.isArray(sourceEdgeIds) || !sourceEdgeIds.length ||
      new Set(sourceEdgeIds).size !== sourceEdgeIds.length) fail('scope', '自动打磨缺少来源依赖边及预声明局部余量');
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], edgeRegions = [];
  for (const sourceEdgeId of sourceEdgeIds) {
    const row = rows[sourceEdgeId];
    if (!Number.isInteger(sourceEdgeId) || sourceEdgeId < 0 || !row || !Array.isArray(row.bounds) || row.bounds.length !== 2 ||
        !row.bounds.every(finitePoint) || row.bounds[0].some((value, i) => value > row.bounds[1][i])) {
      fail('scope', '自动打磨来源依赖边的原始范围无效', {sourceEdgeId});
    }
    const region = [row.bounds[0].map(value => value - marginMm), row.bounds[1].map(value => value + marginMm)];
    if (!region.every(finitePoint)) fail('scope', '自动打磨预声明局部区域超出有限数值范围', {sourceEdgeId, marginMm});
    region[0].forEach((value, i) => {low[i] = Math.min(low[i], value);});
    region[1].forEach((value, i) => {high[i] = Math.max(high[i], value);});
    edgeRegions.push({sourceEdgeId, marginMm, bounds: region});
  }
  return {bounds: [low, high], edgeRegions, marginMm, sourceEdgeIds: [...sourceEdgeIds],
    method: 'source-dependency-edge-bounds-expanded-by-predeclared-local-margin',
    limitations: ['Containment uses the enclosing source-derived box, not the union of individual dependency-edge corridors.']};
}

// Evaluate the actual p-curve of an edge on its trimmed face. There is no
// projection fallback: a wrong surface branch cannot pass this measurement.
function edgeOnFace(edge, face, t, oc) {
  try {
    return measureKernelEdgeFaceNormal(edge, face, t, oc, {positionToleranceMm});
  } catch (error) {
    if (error?.report?.qualityGate) throw error;
    fail('seams', '接缝 p-curve 位置或法向不能量测', {detail: String(error?.message || error), ...(error?.report ? {normalDiagnostic: error.report} : {})});
  }
}

function sameSupportSurface(source, result, oc) {
  if (source.isSame(result)) return 'identity';
  let sourceSurface, resultSurface, a, b, planeA, planeB, locationA, locationB, axisA, axisB, directionA, directionB;
  try {
    sourceSurface = oc.BRep_Tool.Surface(source.wrapped); resultSurface = oc.BRep_Tool.Surface(result.wrapped);
    if (typeof sourceSurface?.isAliasOf === 'function' && sourceSurface.isAliasOf(resultSurface)) return 'underlying-surface';
    // A changed trim on a plane retains the exact support even if OC returns
    // independent surface wrappers. This covers normal box/radial end caps.
    if (source.geomType !== 'PLANE' || result.geomType !== 'PLANE') return null;
    a = new oc.BRepAdaptor_Surface(source.wrapped, false); b = new oc.BRepAdaptor_Surface(result.wrapped, false);
    planeA = a.Plane(); planeB = b.Plane(); locationA = planeA.Location(); locationB = planeB.Location();
    axisA = planeA.Axis(); axisB = planeB.Axis(); directionA = axisA.Direction(); directionB = axisB.Direction();
    const nA = vec(directionA), nB = vec(directionB), parallel = Math.abs(dot(nA, nB));
    if (parallel >= 1 - 1e-12 && Math.abs(dot(sub(vec(locationA), vec(locationB)), nA)) <= 1e-7) return 'underlying-surface';
    return null;
  } finally {[directionB, directionA, axisB, axisA, locationB, locationA, planeB, planeA, b, a, resultSurface, sourceSurface].forEach(dispose);}
}

function sourceTerminals(sourceEdges, sourceFaces, sourceEdgeIds, selectedSupportFaceIds, cad, oc, allowBranches = false) {
  const groups = [], owned = [];
  try {
    for (const sourceEdgeId of sourceEdgeIds) {
      const edge = sourceEdges[sourceEdgeId], vertices = [...cad.iterTopo(edge.wrapped, 'vertex')];
      for (const vertex of vertices) {
        owned.push(vertex);
        let group = groups.find(value => value.vertex.IsSame(vertex));
        if (!group) {group = {vertex, degree: 0, sourceEdgeIds: []}; groups.push(group);}
        group.degree += edge.isClosed && vertices.length === 1 ? 2 : 1;
        group.sourceEdgeIds.push(sourceEdgeId);
      }
    }
    const terminals = [];
    for (const group of groups.filter(value => value.degree === 1 || allowBranches && value.degree > 2)) {
      const value = oc.BRep_Tool.Pnt(group.vertex); let point;
      try {point = vec(value);} finally {dispose(value);}
      const capFaceIds = [];
      for (let sourceFaceId = 0; sourceFaceId < sourceFaces.length; sourceFaceId++) {
        if (selectedSupportFaceIds.has(sourceFaceId)) continue;
        const vertices = [...cad.iterTopo(sourceFaces[sourceFaceId].wrapped, 'vertex')];
        try {if (vertices.some(vertex => vertex.IsSame(group.vertex))) capFaceIds.push(sourceFaceId);}
        finally {vertices.forEach(dispose);}
      }
      terminals.push({id: `source-terminal:${terminals.length}`, point, sourceEdgeIds: group.sourceEdgeIds, capFaceIds, degree: group.degree,
        incidenceMethod: 'BRep-source-vertex-IsSame'});
    }
    if (!allowBranches && groups.some(value => value.degree > 2)) fail('scope', '来源轮廓在端部存在分叉');
    return terminals;
  } finally {owned.forEach(dispose);}
}

function classifyPointOnTrimmedFace(face, point, cad, oc, toleranceMm) {
  let vertex, query, support;
  try {
    vertex = cad.makeVertex(point); query = new oc.BRepExtrema_DistShapeShape();
    query.SetDeflection(Math.min(1e-9, toleranceMm / 10));
    query.LoadS1(vertex.wrapped); query.LoadS2(face.wrapped); query.Perform();
    if (!query.IsDone() || query.NbSolution() < 1 || !Number.isFinite(query.Value())) {
      fail('material', '有限支撑面局部点分类未收敛', {point}, 'MATERIAL_CHECK_FAILED');
    }
    const gapMm = query.Value(); support = query.SupportOnShape2(1);
    const inside = gapMm <= toleranceMm && support.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE && support.IsSame(face.wrapped);
    return {inside, gapMm, supportIsFace: support.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE};
  } finally {[support, query, vertex].forEach(dispose);}
}

// FaceClassifier is not exported by this OC build. Exact point-to-finite-face
// extrema provide the available trim-aware test, including inner wires. A
// surface point is accepted only when its distance is numerical zero and the
// nearest support is the actual face interior, rather than an edge/vertex.
export function measureTrimmedFaceInwardRay(edge, face, t, sizeMm, cad) {
  const oc = cad.getOC();
  let curve, uv, derivative, surface, basePoint, du, dv;
  try {
    curve = new oc.BRepAdaptor_Curve2d(edge.wrapped, face.wrapped);
    uv = new oc.gp_Pnt2d(); derivative = new oc.gp_Vec2d();
    const parameter = curve.FirstParameter() + t * (curve.LastParameter() - curve.FirstParameter());
    curve.D1(parameter, uv, derivative);
    const uvDirection = unit([-derivative.Y(), derivative.X()]);
    if (!uvDirection) fail('material', '支撑面 p-curve 局部切向不可用', {t}, 'MATERIAL_CHECK_FAILED');
    surface = new oc.BRepAdaptor_Surface(face.wrapped, false);
    basePoint = new oc.gp_Pnt(); du = new oc.gp_Vec(); dv = new oc.gp_Vec();
    surface.D1(uv.X(), uv.Y(), basePoint, du, dv);
    const base = vec(basePoint), tangent = unit(tuple(edge.tangentAt(t)));
    const derivative3d = vec(du).map((value, i) => value * uvDirection[0] + vec(dv)[i] * uvDirection[1]);
    if (!tangent || !finitePoint(base) || !finitePoint(derivative3d)) {
      fail('material', '支撑面局部参数度量不可用', {t}, 'MATERIAL_CHECK_FAILED');
    }
    const across = sub(derivative3d, mul(tangent, dot(derivative3d, tangent))), metric = norm(across);
    if (!Number.isFinite(metric) || metric < 1e-12) fail('material', '支撑面局部跨边方向退化', {t}, 'MATERIAL_CHECK_FAILED');
    const faceTolerance = oc.BRep_Tool.Tolerance(face.wrapped);
    if (!Number.isFinite(faceTolerance) || faceTolerance < 0) fail('material', '支撑面的几何精度不可用', {t}, 'MATERIAL_CHECK_FAILED');
    const classificationToleranceMm = Math.max(faceTolerance * 2, 1e-8);
    const initialStepMm = Math.max(classificationToleranceMm * 20, Math.min(sizeMm * .001, edge.length * .0001, .001));
    const trials = [];
    for (const stepMm of [initialStepMm, initialStepMm / 4, initialStepMm * 4]) {
      const deltaUV = stepMm / metric, candidates = [];
      for (const sign of [-1, 1]) {
        const point = surface.Value(uv.X() + sign * deltaUV * uvDirection[0], uv.Y() + sign * deltaUV * uvDirection[1]);
        try {
          const position = vec(point);
          if (!finitePoint(position)) fail('material', '支撑面局部采样不是有限坐标', {t}, 'MATERIAL_CHECK_FAILED');
          candidates.push({sign, point: position, ...classifyPointOnTrimmedFace(face, position, cad, oc, classificationToleranceMm)});
        } finally {dispose(point);}
      }
      trials.push({stepMm, candidates});
      const inside = candidates.filter(candidate => candidate.inside);
      const outside = candidates.filter(candidate => !candidate.inside && candidate.gapMm > classificationToleranceMm * 4);
      if (inside.length !== 1 || outside.length !== 1) continue;
      const inward = sub(inside[0].point, base), ray = unit(sub(inward, mul(tangent, dot(inward, tangent))));
      if (!ray) continue;
      return {ray, method: 'pcurve-local-UV-perturbation-and-exact-trimmed-face-distance',
        t, uv: [uv.X(), uv.Y()], uvDirection, acceptedSign: inside[0].sign,
        stepMm, classificationToleranceMm, insideDistanceMm: inside[0].gapMm,
        outsideDistanceMm: outside[0].gapMm, trials};
    }
    fail('material', '有限支撑面的局部内外两侧不能唯一分类', {t, trials}, 'MATERIAL_CHECK_FAILED');
  } catch (error) {
    if (error?.report?.qualityGate) throw error;
    fail('material', '支撑面局部内向射线量测失败', {t, detail: String(error?.message || error)}, 'MATERIAL_CHECK_FAILED');
  } finally {[dv, du, basePoint, surface, derivative, uv, curve].forEach(dispose);}
}

function materialDirection(sourceEdges, sourceFaces, sourceRows, sourceEdgeIds, sizeMm, cad, oc) {
  const observed = [], directions = new Set();
  for (const sourceEdgeId of sourceEdgeIds) {
    const edge = sourceEdges[sourceEdgeId], row = sourceRows[sourceEdgeId];
    if (row.adjacentFaceIds.length !== 2) fail('material', '来源边没有两侧明确材料支撑面', {sourceEdgeId}, 'MATERIAL_CHECK_FAILED');
    const faces = row.adjacentFaceIds.map(id => sourceFaces[id]);
    for (const t of [.2, .5, .8]) {
      const measuredInward = faces.map(face => measureTrimmedFaceInwardRay(edge, face, t, sizeMm, cad));
      const inward = measuredInward.map(measured => measured.ray);
      const normals = faces.map(face => unit(edgeOnFace(edge, face, t, oc).normal));
      if (inward.some(value => !value) || normals.some(value => !value)) {
        fail('material', '支撑面的局部内向方向不明确', {sourceEdgeId, t}, 'MATERIAL_CHECK_FAILED');
      }
      const sideA = dot(inward[0], normals[1]), sideB = dot(inward[1], normals[0]);
      if (Math.abs(sideA) < 1e-5 || Math.abs(sideB) < 1e-5 || sideA * sideB <= 0) {
        fail('material', '支撑面不能给出一致的凹凸材料方向', {sourceEdgeId, t, sideA, sideB}, 'MATERIAL_CHECK_FAILED');
      }
      const direction = sideA < 0 ? 'remove' : 'add'; directions.add(direction);
      observed.push({sourceEdgeId, t, sideA, sideB, direction, trimmedFaceInwardEvidence: measuredInward});
    }
  }
  if (directions.size !== 1) fail('material', '本轮统一质量检查不接受未划分局部区的混合凹凸材料方向', {observed}, 'MATERIAL_CHECK_FAILED');
  return {direction: [...directions][0], method: 'source-trimmed-face-local-inward-rays-and-oriented-BRep-normals', observed};
}

/** Source-only planning step. Call before candidate construction, never infer
 * intent from the sign of a candidate's volume change. Conditioning edges are
 * excluded here: the user authorized them to participate in local polishing. */
export function derivePolishingMaterialIntent(source, {selectedSourceEdgeIds, scaleMm}, cad) {
  const oc = cad.getOC(), sourceRows = topologyDetails(source), sourceEdges = source.edges, sourceFaces = source.faces;
  try {
    if (!Number.isFinite(scaleMm) || scaleMm <= 0 || !Array.isArray(selectedSourceEdgeIds) || !selectedSourceEdgeIds.length ||
        new Set(selectedSourceEdgeIds).size !== selectedSourceEdgeIds.length ||
        selectedSourceEdgeIds.some(id => !Number.isInteger(id) || id < 0 || !sourceEdges[id] ||
          sourceRows[id]?.adjacentFaceIds?.length !== 2)) {
      fail('material', '来源预规划需要有效原选边和有限内部构造尺度', {}, 'MATERIAL_CHECK_FAILED');
    }
    const observation = materialDirection(sourceEdges, sourceFaces, sourceRows, selectedSourceEdgeIds, scaleMm, cad, oc);
    return {materialIntent: observation.direction, method: observation.method, observed: observation.observed,
      selectedSourceEdgeIds: [...selectedSourceEdgeIds], derivedBeforeConstruction: true};
  } finally {sourceEdges.forEach(dispose); sourceFaces.forEach(dispose);}
}

function measureEndpoints(terminals, rows, seams, influence) {
  const smooth = seams.filter(seam => seam.kind !== 'natural-termination');
  return terminals.map(terminal => {
    const margin = Math.max(...influence.edgeRegions.filter(region => terminal.sourceEdgeIds.includes(region.sourceEdgeId)).map(region => region.marginMm));
    const region = [terminal.point.map(value => value - margin), terminal.point.map(value => value + margin)];
    const capRows = rows.filter(row => terminal.capFaceIds.includes(row.sourceCapFaceId) &&
      [row.startPoint, row.endPoint].some(point => pointInBounds(point, region)));
    if (!capRows.length) fail('endpoints', '来源端部没有可核对的原端面接触边界', {terminal});
    const checked = new Set(), closureGaps = [], endpointAngles = [], natural = [];
    for (const capRow of capRows) {
      const capSeam = seams.find(seam => seam.edgeId === capRow.edgeId);
      if (!capSeam) continue;
      if (capSeam.kind === 'natural-termination') natural.push(capSeam);
      else {checked.add(capSeam.edgeId); endpointAngles.push(...capSeam.samples.map(sample => sample.angleDeg));}
      for (const capPoint of [capRow.startPoint, capRow.endPoint]) {
        if (!pointInBounds(capPoint, region)) continue;
        for (const seam of smooth) {
          if (seam.edgeId === capRow.edgeId) continue;
          const row = rows.find(value => value.edgeId === seam.edgeId);
          if (!row) continue;
          for (const [index, seamPoint] of [row.startPoint, row.endPoint].entries()) {
            const gapMm = distance(capPoint, seamPoint);
            if (gapMm > positionToleranceMm) continue;
            checked.add(seam.edgeId); closureGaps.push(gapMm);
            endpointAngles.push(seam.samples[index === 0 ? 0 : seam.samples.length - 1].angleDeg);
          }
        }
      }
    }
    if (checked.size < 2 || !closureGaps.length) fail('endpoints', '端部没有两侧实际光顺接触缝的共同连接量测', {terminal, checkedSeamEdgeIds: [...checked]});
    return {id: terminal.id, kind: natural.length ? 'natural-termination' : 'smooth',
      gapMm: Math.max(...closureGaps), angleDeg: Math.max(0, ...endpointAngles), checkedSeamEdgeIds: [...checked],
      ...(natural.length ? {provenance: natural[0].provenance} : {}),
      sourcePoint: terminal.point, sourceCapFaceIds: terminal.capFaceIds, measurementMethod: 'BRep-terminal-cap-and-contact-seam-junctions'};
  });
}

function measurePolishingEndpoints(terminals, rows, seams, influence) {
  return terminals.map(terminal => {
    const margin = Math.max(...influence.edgeRegions.filter(region => terminal.sourceEdgeIds.includes(region.sourceEdgeId)).map(region => region.marginMm));
    const region = [terminal.point.map(value => value - margin), terminal.point.map(value => value + margin)];
    const checks = [];
    for (const row of rows) {
      const seam = seams.find(value => value.edgeId === row.edgeId);
      for (const [index, point] of [row.startPoint, row.endPoint].entries()) {
        if (!pointInBounds(point, region)) continue;
        const sample = seam.trueEndpointSamples[index];
        checks.push({edgeId: row.edgeId, t: index, point, angleDeg: sample.angleDeg, gapMm: sample.gapMm});
      }
    }
    if (!checks.length) fail('endpoints', '原选边端部的预声明来源区域内没有实际生成接缝端点覆盖', {terminal, region});
    return {id: terminal.id, kind: 'smooth', gapMm: Math.max(...checks.map(check => check.gapMm)),
      angleDeg: Math.max(...checks.map(check => check.angleDeg)), checkedSeamEdgeIds: [...new Set(checks.map(check => check.edgeId))],
      sourcePoint: terminal.point, sourceCapFaceIds: terminal.capFaceIds, checkedTrueEnds: checks,
      measurementMethod: 'all-generated-seam-true-ends-in-source-endpoint-region',
      limitations: ['Source endpoint association uses the declared source region. Every generated seam is independently checked, without natural-cap or nearest-face exemptions.']};
  });
}

/** Measure the original selected edge against every final face, including 0/1. */
export function measureSelectedPolishingEdgeEffects(source, result, selectedSourceEdgeIds, cad) {
  const sourceEdges = source.edges, resultFaces = result.faces, clones = [];
  let finalBoundary;
  try {
    if (!Array.isArray(selectedSourceEdgeIds) || !selectedSourceEdgeIds.length ||
        new Set(selectedSourceEdgeIds).size !== selectedSourceEdgeIds.length ||
        selectedSourceEdgeIds.some(id => !Number.isInteger(id) || id < 0 || !sourceEdges[id])) {
      fail('selected-edge-effect', '自动打磨原选边清单无效');
    }
    resultFaces.forEach(face => clones.push(face.clone()));
    finalBoundary = cad.makeCompound(clones);
    return selectedSourceEdgeIds.map(sourceEdgeId => {
      const measure = t => {
        let point, vertex;
        try {
          point = sourceEdges[sourceEdgeId].pointAt(t); const sourcePoint = point.toTuple();
          vertex = cad.makeVertex(sourcePoint);
          const distanceMm = cad.measureDistanceBetween(finalBoundary, vertex);
          if (!Number.isFinite(distanceMm) || distanceMm < 0) fail('selected-edge-effect', '原选边到全部结果面的实际距离无法量测', {sourceEdgeId, t, distanceMm});
          return {t, sourcePoint, distanceMm};
        } finally {[vertex, point].forEach(dispose);}
      };
      return {sourceEdgeId, method: 'source-selected-edge-to-all-final-BRep-faces-distance',
        samples: stations.map(measure), sourceEndpointSamples: [0, 1].map(measure)};
    });
  } finally {
    dispose(finalBoundary); clones.forEach(dispose); resultFaces.forEach(dispose); sourceEdges.forEach(dispose);
  }
}

// Diagnostics only. A native degenerate incidence or preserved old vertex is
// never a license to exempt a nondegenerate new edge or to infer regular G1.
function diagnosePolishingEndpoint(source, edge, t, sourceEdges, sourceFaces, resultEdges, resultFaces,
  sourceMap, selectedSourceEdgeIds, cad, oc) {
  const owned = [];
  try {
    const point = tuple(edge.pointAt(t));
    const vertices = [...cad.iterTopo(edge.wrapped, 'vertex')]; owned.push(...vertices);
    const incident = vertices.filter(vertex => {
      const nativePoint = oc.BRep_Tool.Pnt(vertex);
      try {return distance(point, vec(nativePoint)) <= Math.max(oc.BRep_Tool.Tolerance(vertex), 1e-7);}
      finally {dispose(nativePoint);}
    });
    if (incident.length !== 1) return {classification: 'unverified-native-endpoint-incidence', t, point, candidateVertexCount: incident.length, accepted: false};
    const vertex = incident[0], sourceVertices = [...cad.iterTopo(source.wrapped, 'vertex')]; owned.push(...sourceVertices);
    const nativeSourceVertex = sourceVertices.find(value => value.IsSame(vertex));
    const incidentDegenerateEdgeIds = [];
    resultEdges.forEach((resultEdge, edgeId) => {
      if (!oc.BRep_Tool.Degenerated(resultEdge.wrapped)) return;
      const edgeVertices = [...cad.iterTopo(resultEdge.wrapped, 'vertex')]; owned.push(...edgeVertices);
      if (edgeVertices.some(value => value.IsSame(vertex))) incidentDegenerateEdgeIds.push(edgeId);
    });
    if (!nativeSourceVertex) return {classification: incidentDegenerateEdgeIds.length ?
      'native-degenerate-incidence-with-unverified-source-vertex' : 'unverified-singular-endpoint',
      t, point, incidentDegenerateEdgeIds, sourceVertexIsSame: false, accepted: false};
    const sourceIncidentFaceIds = [], selectedIncidentEdgeIds = [], preservedNeighborEvidence = [];
    sourceFaces.forEach((face, sourceFaceId) => {
      const faceVertices = [...cad.iterTopo(face.wrapped, 'vertex')]; owned.push(...faceVertices);
      if (!faceVertices.some(value => value.IsSame(nativeSourceVertex))) return;
      sourceIncidentFaceIds.push(sourceFaceId);
      const matches = [];
      sourceMap.forEach((originalId, resultFaceId) => {
        if (originalId !== sourceFaceId) return;
        const resultVertices = [...cad.iterTopo(resultFaces[resultFaceId].wrapped, 'vertex')]; owned.push(...resultVertices);
        if (!resultVertices.some(value => value.IsSame(vertex))) return;
        const geometryMatch = sameSupportSurface(face, resultFaces[resultFaceId], oc);
        const sameOrientation = face.wrapped.Orientation() === resultFaces[resultFaceId].wrapped.Orientation();
        if (geometryMatch && sameOrientation) matches.push({resultFaceId, geometryMatch, sameOrientation,
          normalEvidence: 'identical-oriented-underlying-support-on-native-incident-retained-face'});
      });
      preservedNeighborEvidence.push({sourceFaceId, matches, verified: matches.length > 0});
    });
    for (const selectedSourceEdgeId of selectedSourceEdgeIds) {
      const edgeVertices = [...cad.iterTopo(sourceEdges[selectedSourceEdgeId].wrapped, 'vertex')]; owned.push(...edgeVertices);
      if (edgeVertices.some(value => value.IsSame(nativeSourceVertex))) selectedIncidentEdgeIds.push(selectedSourceEdgeId);
    }
    const preservedUnselected = !selectedIncidentEdgeIds.length && sourceIncidentFaceIds.length > 0 &&
      preservedNeighborEvidence.every(value => value.verified);
    return {classification: preservedUnselected ? 'preserved-original-unselected-native-vertex' :
      incidentDegenerateEdgeIds.length ? 'native-degenerate-incidence-at-source-vertex-with-incomplete-preservation' :
        'source-native-vertex-with-incomplete-preservation',
      t, point, sourceVertexIsSame: true, selectedIncidentEdgeIds, sourceIncidentFaceIds,
      incidentDegenerateEdgeIds, preservedNeighborEvidence, preservedUnselected, accepted: false,
      limitations: ['Native incidence and unchanged oriented supports do not establish a globally regular G1 normal at this singular point. Strict acceptance remains pending; no distance-only exemption is applied.']};
  } catch (error) {
    return {classification: 'endpoint-diagnostic-unavailable', t, accepted: false, detail: String(error?.message || error)};
  } finally {owned.forEach(dispose);}
}

/**
 * Measure a finished candidate in the caller's existing OC/WASM instance.
 * Builder identity/Modified histories must be supplied for all retained faces.
 * Returns {report, evidence}; no source mutation, instance creation, or render.
 */
export function measureRoundingQuality(source, result, options, cad) {
  return measureFinishedQuality(source, result, options, cad, false);
}

export function measureAutomaticPolishingQuality(source, result, options, cad) {
  try {return measureFinishedQuality(source, result, options, cad, true);}
  catch (error) {
    if (error?.report?.qualityGate) error.report.qualityGate = 'automatic-polishing-measured-BREP-v3';
    throw error;
  }
}

function measureFinishedQuality(source, result, {
  sizeMm, sourceEdgeIds, generatedFaceIds, resultFaceSourceIds,
  dimensionKind, measuredScaleMm, adaptiveScaleRatios,
  selectedSourceEdgeIds, materialIntent, localityScope, constructionContourEdgeIds, conditioningContours = []
}, cad, polishing) {
  const oc = cad.getOC(), sourceFaces = source.faces, sourceEdges = source.edges, resultFaces = result.faces, resultEdges = result.edges;
  let analyzer, removedShape, addedShape;
  const ownedSolids = [];
  try {
    const sourceRows = topologyDetails(source);
    if (polishing && (!['remove', 'add'].includes(materialIntent) ||
        localityScope?.declaredBeforeConstruction !== true || !Array.isArray(localityScope.sourceEdgeIds) ||
        !Array.isArray(sourceEdgeIds) || localityScope.sourceEdgeIds.length !== sourceEdgeIds.length ||
        new Set(localityScope.sourceEdgeIds).size !== localityScope.sourceEdgeIds.length ||
        sourceEdgeIds.some(id => !localityScope.sourceEdgeIds.includes(id)) ||
        !Array.isArray(selectedSourceEdgeIds) || !selectedSourceEdgeIds.length ||
        new Set(selectedSourceEdgeIds).size !== selectedSourceEdgeIds.length ||
        selectedSourceEdgeIds.some(id => !sourceEdgeIds.includes(id)))) {
      fail('scope', '自动打磨必须先声明材料意图、原选边及完整联动依赖区域');
    }
    const influence = polishing ? derivePolishingInfluenceBounds(sourceRows, sourceEdgeIds, localityScope.marginMm) :
      deriveRoundingInfluenceBounds(sourceRows, sourceEdgeIds, sizeMm);
    if (!Array.isArray(generatedFaceIds) || !generatedFaceIds.length || new Set(generatedFaceIds).size !== generatedFaceIds.length ||
        generatedFaceIds.some(id => !Number.isInteger(id) || id < 0 || !resultFaces[id]) || !Array.isArray(resultFaceSourceIds)) {
      fail('coverage', '缺少最终生成面和保留面出处映射');
    }
    const generated = new Set(generatedFaceIds), sourceMap = new Map();
    for (const mapping of resultFaceSourceIds) {
      if (!Number.isInteger(mapping?.faceId) || !resultFaces[mapping.faceId] || !Number.isInteger(mapping.sourceFaceId) ||
          !sourceFaces[mapping.sourceFaceId] || generated.has(mapping.faceId) ||
          sourceMap.has(mapping.faceId) && sourceMap.get(mapping.faceId) !== mapping.sourceFaceId) {
        fail('coverage', '保留面出处映射无效或含混', {mapping});
      }
      sourceMap.set(mapping.faceId, mapping.sourceFaceId);
    }
    if (resultFaces.some((_, id) => !generated.has(id) && !sourceMap.has(id))) fail('coverage', '部分最终面没有来源或生成出处');
    const endpointSourceEdgeIds = polishing ? constructionContourEdgeIds || sourceEdgeIds : sourceEdgeIds;
    if (polishing && !Array.isArray(conditioningContours)) fail('scope', '自动打磨辅助构造轮廓清单无效');
    const declaredContours = polishing ? [{id: 'primary', role: 'primary', sourceEdgeIds: endpointSourceEdgeIds},
      ...conditioningContours.map(contour => ({...contour, role: 'conditioning'}))] : null;
    if (polishing && (!Array.isArray(conditioningContours) || !Array.isArray(endpointSourceEdgeIds) || !endpointSourceEdgeIds.length ||
        new Set(declaredContours.map(contour => contour.id)).size !== declaredContours.length ||
        declaredContours.some(contour => typeof contour.id !== 'string' || !contour.id || !Array.isArray(contour.sourceEdgeIds) ||
          !contour.sourceEdgeIds.length || new Set(contour.sourceEdgeIds).size !== contour.sourceEdgeIds.length ||
          contour.sourceEdgeIds.some(id => !sourceEdgeIds.includes(id))) ||
        selectedSourceEdgeIds.some(id => !endpointSourceEdgeIds.includes(id)))) {
      fail('scope', '自动打磨主构造轮廓与辅助轮廓必须预声明且覆盖原选边');
    }
    const supportIds = new Set(endpointSourceEdgeIds.flatMap(id => sourceRows[id].adjacentFaceIds));
    const terminals = polishing ? declaredContours.flatMap(contour => {
      const contourSupportIds = new Set(contour.sourceEdgeIds.flatMap(id => sourceRows[id].adjacentFaceIds));
      return sourceTerminals(sourceEdges, sourceFaces, contour.sourceEdgeIds, contourSupportIds, cad, oc, true)
        .map(terminal => ({...terminal, id: `${contour.id}:${terminal.id}`, contourId: contour.id, contourRole: contour.role}));
    }) : sourceTerminals(sourceEdges, sourceFaces, endpointSourceEdgeIds, supportIds, cad, oc);
    const naturalCapIds = new Set(terminals.flatMap(terminal => terminal.capFaceIds));
    const sourceMaterial = polishing ? {direction: materialIntent, plannedIntent: materialIntent,
      method: 'explicit-source-planning-material-intent-before-construction',
      relatedSourceDihedrals: sourceEdgeIds.map(sourceEdgeId => ({sourceEdgeId,
        normalAngleDeg: sourceRows[sourceEdgeId].normalAngleDeg,
        role: selectedSourceEdgeIds.includes(sourceEdgeId) ? 'selected' : 'conditioning-dependency'}))} :
      materialDirection(sourceEdges, sourceFaces, sourceRows, sourceEdgeIds, sizeMm, cad, oc);
    const boundaryRows = topologyDetails(result, {connectivityOnly: true}).filter(row => row.adjacentFaceIds.some(id => generated.has(id)));
    const seams = [], exemptBoundaries = [], measuredRows = [];
    for (const row of boundaryRows) {
      const edge = resultEdges[row.edgeId], degenerate = oc.BRep_Tool.Degenerated(edge.wrapped);
      const periodic = row.adjacentFaceIds.length === 1 && oc.BRep_Tool.IsClosed(edge.wrapped, resultFaces[row.adjacentFaceIds[0]].wrapped);
      if (degenerate || periodic) {exemptBoundaries.push({edgeId: row.edgeId, kind: degenerate ? 'degenerate' : 'periodic-seam', verified: true}); continue;}
      if (row.adjacentFaceIds.length !== 2) fail('seams', '生成面出现非封闭或非流形边界', {row});
      const measure = t => {
        try {
          const [a, b] = row.adjacentFaceIds.map(id => edgeOnFace(edge, resultFaces[id], t, oc));
          const measurement = {t, angleDeg: angle(a.normal, b.normal), gapMm: Math.max(a.gapMm, b.gapMm, distance(a.point, b.point)),
            normalEvidence: [a, b].map(side => ({relativeJacobian: side.normalMeasurement.relativeJacobian,
              alignmentAbsDot: side.normalMeasurement.alignmentAbsDot, rawNormalMagnitude: side.normalMeasurement.rawNormalMagnitude,
              method: side.normalMeasurement.method,
              ...(side.normalMeasurement.analyticSpherePoleCertificate ? {analyticSpherePoleCertificate: side.normalMeasurement.analyticSpherePoleCertificate} : {})}))};
          if (polishing && (t === 0 || t === 1) && measurement.angleDeg > .1) {
            measurement.endpointDiagnostic = diagnosePolishingEndpoint(source, edge, t, sourceEdges, sourceFaces,
              resultEdges, resultFaces, sourceMap, selectedSourceEdgeIds, cad, oc);
          }
          return measurement;
        } catch (error) {
          if (!polishing || t !== 0 && t !== 1) throw error;
          const endpointDiagnostic = diagnosePolishingEndpoint(source, edge, t, sourceEdges, sourceFaces,
            resultEdges, resultFaces, sourceMap, selectedSourceEdgeIds, cad, oc);
          fail('endpoints', '真实生成接缝端点的正则法向无法核对；保留原生退化或旧点诊断，尚未批准豁免',
            {edgeId: row.edgeId, adjacentFaceIds: row.adjacentFaceIds, t, endpointDiagnostic, cause: error.report || String(error?.message || error)});
        }
      };
      const samples = stations.map(measure), trueEndpointSamples = polishing ? [0, 1].map(measure) : null;
      const otherFaceId = row.adjacentFaceIds.find(id => !generated.has(id)), sourceFaceId = sourceMap.get(otherFaceId);
      let provenance = null;
      if (!polishing && otherFaceId !== undefined && naturalCapIds.has(sourceFaceId)) {
        const geometryMatch = sameSupportSurface(sourceFaces[sourceFaceId], resultFaces[otherFaceId], oc);
        if (geometryMatch) provenance = {sourceFaceId, resultFaceId: otherFaceId, sourceTerminal: true,
          unselected: !supportIds.has(sourceFaceId), preservedSupport: true, geometryMatch,
          incidenceMethod: 'BRep-source-vertex-IsSame-and-builder-history'};
      }
      const kind = !polishing && provenance && Math.max(...samples.map(sample => sample.angleDeg)) > .1 ? 'natural-termination' :
        otherFaceId === undefined ? 'patch-contact' : 'support-contact';
      seams.push({edgeId: row.edgeId, adjacentFaceIds: row.adjacentFaceIds, kind, samples,
        ...(polishing ? {trueEndpointSamples} : {}), ...(provenance ? {provenance} : {})});
      measuredRows.push({...row, startPoint: tuple(edge.startPoint), endPoint: tuple(edge.endPoint),
        sourceCapFaceId: provenance ? sourceFaceId : naturalCapIds.has(sourceFaceId) ? sourceFaceId : undefined});
    }
    const endpoints = polishing ? measurePolishingEndpoints(terminals, measuredRows, seams, influence) :
      measureEndpoints(terminals, measuredRows, seams, influence);
    analyzer = new oc.BRepCheck_Analyzer(result.wrapped, true, false, false);
    ownedSolids.push(...result.solids);
    const sourceVolumeMm3 = volume(source, oc), resultVolumeMm3 = volume(result, oc);
    removedShape = cutRoundingDifferenceNonDestructive(source, result, cad);
    addedShape = cutRoundingDifferenceNonDestructive(result, source, cad);
    const removedVolumeMm3 = volume(removedShape, oc), addedVolumeMm3 = volume(addedShape, oc);
    const differenceChecks = [];
    for (const [kind, shape, amount] of [['removed', removedShape, removedVolumeMm3], ['added', addedShape, addedVolumeMm3]]) {
      const changedBounds = amount > volumeToleranceMm3 ? bounds(shape) : null;
      if (changedBounds && !boundsInBounds(changedBounds, influence.bounds)) {
        fail('locality', '圆润材料变化越过来源边预定局部影响区', {kind, changedBounds, influence});
      }
      differenceChecks.push({kind, volumeMm3: amount, bounds: changedBounds, contained: true});
    }
    const selectedEdgeEffects = polishing ? measureSelectedPolishingEdgeEffects(source, result, selectedSourceEdgeIds, cad) : null;
    const scales = polishing ? selectedEdgeEffects.flatMap(effect => effect.samples.filter(sample => sample.t >= .01 && sample.t <= .99).map(sample => sample.distanceMm)) :
      Array.isArray(measuredScaleMm) ? measuredScaleMm : [measuredScaleMm];
    const localityLimitations = [
      'Locality uses full-dimensional BRep material differences and their exact-kernel bounds.',
      'Differences at or below the stated volume tolerance are numerical zero; this is not an independent global surface-distance or curvature proof.',
      ...(polishing ? influence.limitations : [])
    ];
    const materialLimitations = [
      'Independent Boolean differences may resplit the BRep representation. Their volume reconciliation with source/result volumes uses a separate fixed 1e-6 mm3 tolerance.',
      'Zero material change, wrong-direction material and outside-region changes retain the 1e-7 mm3 tolerance. This reconciliation is a numerical check, not a mathematical global material-equality proof or a measured quadrature-error bound.'
    ];
    const evidence = {
      request: polishing ? {dimensionKind: 'automatic-local-scale', materialIntent, selectedSourceEdgeIds: [...selectedSourceEdgeIds]} : {sizeMm, dimensionKind},
      ...(polishing ? {scope: {...localityScope, sourceEdgeIds: [...sourceEdgeIds], constructionContours: declaredContours, influence}, selectedEdgeEffects} : {}),
      solid: {valid: analyzer.IsValid(), solidCount: ownedSolids.length, sourceVolumeMm3, resultVolumeMm3},
      material: {...sourceMaterial, removedVolumeMm3, addedVolumeMm3,
        volumeBalanceErrorMm3: Math.abs((resultVolumeMm3 - sourceVolumeMm3) - (addedVolumeMm3 - removedVolumeMm3)),
        volumeToleranceMm3, volumeBalanceToleranceMm3: 1e-6, limitations: materialLimitations}, generatedFaceIds: [...generatedFaceIds],
      boundaryEdgeIds: boundaryRows.map(row => row.edgeId), exemptBoundaries, seams,
      requiredEndpointIds: terminals.map(terminal => terminal.id), endpoints,
      scale: {method: polishing ? 'observed-source-selected-edge-to-final-boundary-displacement' : 'candidate-measured-BRep-scale', samplesMm: scales,
        ...(!polishing && dimensionKind === 'rounding-scale' ? adaptiveScaleRatios : {})},
      locality: {verified: true, method: 'BRep-material-differences-contained-in-source-derived-expanded-bounds',
        preservedCheckCount: differenceChecks.length, checkedPreservedCount: differenceChecks.length,
        maxOutsideDeviationMm: 0, outsideChangedVolumeMm3: 0, inferredFromDifferenceContainment: true,
        influence, differenceChecks, limitations: localityLimitations}, sourceTerminals: terminals.map(({vertex, ...terminal}) => terminal)
    };
    const report = polishing ? assertAutomaticPolishingQualityEvidence(evidence) : assertRoundingQualityEvidence(evidence);
    report.localityLimitations = localityLimitations;
    report.materialLimitations = materialLimitations;
    report.materialDirectionMethod = sourceMaterial.method;
    return {report, evidence};
  } finally {
    [addedShape, removedShape, analyzer].forEach(dispose); ownedSolids.forEach(dispose);
    resultEdges.forEach(dispose); resultFaces.forEach(dispose); sourceEdges.forEach(dispose); sourceFaces.forEach(dispose);
  }
}
