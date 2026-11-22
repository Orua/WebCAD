import {releaseNativeBoolean} from './modeling/io/native-boolean-lifetime.js';
import {
  measureSignedVolume
} from './signed-volume.js';
import {
  projectPointToFace,
  normalAtFace
} from './surface-projection.js';
import {
  measureRegionVolume
} from './modeling/inspection/region-volume.js';
const dispose = v => {
  try {
    v?.delete?.();
  } catch {}
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
  cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm = v => Math.hypot(...v),
  mul = (v, s) => v.map(x => x * s),
  add = (...vs) => vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0)),
  dist = (a, b) => norm(add(a, mul(b, -1)));
const unit = v => {
  const n = norm(v);
  if (n < 1e-9) throw new Error('曲面阵列无法构造非零切向');
  return mul(v, 1 / n);
};
const check = (ok, message, code = 'GEOMETRY_INVALID', path) => {
  if (!ok) throw Object.assign(new Error(message), {
    code,
    ...(path ? {
      path
    } : {})
  });
};
const lengthOf = points => points.slice(1).reduce((s, p, i) => s + dist(p.point, points[i].point), 0);

function atLength(points, target) {
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i].point, points[i - 1].point);
    if (s + d >= target || i === points.length - 1) {
      const t = Math.max(0, Math.min(1, (target - s) / Math.max(d, 1e-12)));
      return {
        point: add(mul(points[i - 1].point, 1 - t), mul(points[i].point, t)),
        tangent: unit(add(points[i].point, mul(points[i - 1].point, -1)))
      };
    }
    s += d;
  }
}

function solids(shape) {
  const rows = shape.solids;
  try {
    return rows.length;
  } finally {
    rows.forEach(dispose);
  }
}
export function buildProjectedPattern(source, params, cad, makeTool) {
  const p = params.pattern,
    positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0,
    point = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  check(p && typeof p === 'object' && !Array.isArray(p), 'pattern 必须是对象', 'PARAM_SCHEMA_INVALID', 'params.pattern');
  check(positive(params.widthMm) && positive(params.depthMm) && params.widthLaw === undefined && params.depthLaw === undefined, '曲面阵列首版需要恒定 widthMm/depthMm，不支持 law 混用', 'PARAM_SCHEMA_INVALID');
  check(positive(p.spacingMm), 'pattern.spacingMm 必须为正', 'PARAM_SCHEMA_INVALID');
  check(Number.isInteger(p.maxCount) && p.maxCount >= 1 && p.maxCount <= 48, 'pattern.maxCount 须为1–48的显式预算', 'PARAM_SCHEMA_INVALID');
  const offsets = p.rowOffsetsMm,
    contour = p.points2dMm,
    phases = p.phaseFractions ?? (Array.isArray(offsets) ? offsets.map((_, i) => i % 2 * .5) : []),
    maxProjection = p.maxProjectionMm ?? 2,
    tolerance = p.layoutToleranceMm ?? .03;
  check(Array.isArray(offsets) && offsets.length >= 1 && offsets.length <= 3 && offsets.every(Number.isFinite) && new Set(offsets).size === offsets.length, 'rowOffsetsMm 须为1–3个不同的有限偏移', 'PARAM_SCHEMA_INVALID');
  check(Array.isArray(phases) && phases.length === offsets.length && phases.every(x => Number.isFinite(x) && x >= 0 && x < 1), 'phaseFractions 必须逐行提供0≤phase<1', 'PARAM_SCHEMA_INVALID');
  check(Array.isArray(contour) && contour.length >= 2 && contour.length <= 16 && contour.every(v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)), 'points2dMm 须为2–16个有限横向/顺流向坐标', 'PARAM_SCHEMA_INVALID');
  check(Math.hypot(contour[0][0] - contour.at(-1)[0], contour[0][1] - contour.at(-1)[1]) > 1e-6, 'points2dMm 必须是开放轮廓', 'PARAM_SCHEMA_INVALID');
  check(contour.slice(1).every((v, i) => Math.hypot(v[0] - contour[i][0], v[1] - contour[i][1]) > 1e-6), '阵列轮廓相邻点不得重合', 'PARAM_SCHEMA_INVALID');
  check(maxProjection >= .01 && maxProjection <= 5 && Number.isFinite(maxProjection) && tolerance >= .005 && tolerance <= .2 && Number.isFinite(tolerance), '投影/弓高容差超出支持范围', 'PARAM_SCHEMA_INVALID');
  check(Array.isArray(params.pointsMm) && params.pointsMm.length >= 2 && params.pointsMm.length <= 64 && params.pointsMm.every(point), 'guide pointsMm 须为2–64个有限世界坐标', 'PARAM_SCHEMA_INVALID');
  check(solids(source) === 1, '曲面阵列需要一个精确封闭实体');
  const faces = source.faces,
    tools = [];
  let selected, edges = [],
    result, queries = 0,
    maxSag = 0,
    maxSeedGap = 0,
    maxFootprintGap = 0,
    instanceCount = 0,
    phase = 'face-selection';
  const allowed = params.faceIds ?? (params.faceId !== undefined ? [params.faceId] : faces.map((_, i) => i));
  try {
    check(Array.isArray(allowed) && allowed.length && allowed.every(id => Number.isInteger(id) && faces[id]), '无效曲面面号', 'PARAM_SCHEMA_INVALID');
    if (params.faceIds !== undefined) check(allowed.length === 1, '阵列首版只支持一张trimmed面，不跨接缝/面边界', 'PARAM_SCHEMA_INVALID');
    const candidates = [];
    for (const id of allowed) {
      const resources = [],
        hold = v => (resources.push(v), v);
      try {
        candidates.push({
          id,
          ...projectPointToFace(faces[id], cad, params.pointsMm[0], hold)
        });
      } finally {
        resources.reverse().forEach(dispose);
      }
    }
    candidates.sort((a, b) => a.residualMm - b.residualMm);
    check(candidates[0].residualMm <= maxProjection, '引导线起点超过真实曲面吸附限');
    check(candidates.length < 2 || candidates[1].residualMm - candidates[0].residualMm > 1e-5, '引导线起点不能唯一确定面，请显式faceId');
    selected = candidates[0].id;
    edges = faces[selected].edges;
    const project = (seed, footprint = false) => {
      check(++queries <= 4096, '曲面投影采样超过4096预算', 'RESOURCE_LIMIT');
      const resources = [],
        hold = v => (resources.push(v), v);
      let stage = 'nearest-point';
      try {
        const q = projectPointToFace(faces[selected], cad, seed, hold);
        maxSeedGap = Math.max(maxSeedGap, q.residualMm);
        check(q.residualMm <= maxProjection, `曲面阵列投影残差 ${q.residualMm} 超过 ${maxProjection}mm`);
        stage = 'boundary-distance';
        const anchor = hold(cad.makeVertex(q.point));
        check(!edges.some(e => cad.measureDistanceBetween(anchor, e) <= params.widthMm * .55), '曲面阵列路径触及trim边界/接缝；缩短或缩小该片区');
        stage = 'normal';
        const normal = normalAtFace(faces[selected], q.point, hold, q.uv, cad);
        if (footprint) {
          stage = 'footprint-UV-evaluation';
          check(q.uv && Number.isFinite(q.parametricResidualMm), '重复轮廓必须投影到真实trimmed面的内部，不是其边或外延面');
          maxFootprintGap = Math.max(maxFootprintGap, q.parametricResidualMm);
          check(q.parametricResidualMm < 1e-5, '投影点与同一真实面UV求值不一致');
        }
        return {
          ...q,
          normal
        };
      } catch (e) {
        throw Object.assign(new Error(`表面查询${stage}：${e.message||e}`, {
          cause: e
        }), {
          code: e.code,
          report: {
            stage,
            seed
          }
        });
      } finally {
        resources.reverse().forEach(dispose);
      }
    };
    const trace = (seeds, footprint = false) => {
      const anchors = seeds.map(v => project(v, footprint)),
        out = [anchors[0]];
      const split = (a, b, depth) => {
        const mid = project(mul(add(a.point, b.point), .5), footprint),
          sag = dist(mid.point, mul(add(a.point, b.point), .5)),
          step = dist(a.point, b.point),
          turn = Math.min(dot(a.normal, mid.normal), dot(mid.normal, b.normal));
        if (sag > tolerance || step > 4 || turn < .978) {
          check(depth < 12 && out.length < 512, '曲面路径无法在弓高/采样预算内解析，请拆分片区', 'RESOURCE_LIMIT');
          split(a, mid, depth + 1);
          split(mid, b, depth + 1);
        } else {
          maxSag = Math.max(maxSag, sag);
          out.push(b);
        }
      };
      for (let i = 1; i < anchors.length; i++) {
        check(dist(anchors[i - 1].point, anchors[i].point) > 1e-6, '投影后的相邻引导/细节点重合');
        split(anchors[i - 1], anchors[i], 0);
      }
      return out;
    };
    phase = 'guide-projection';
    const guide = trace(params.pointsMm),
      margin = Math.max(...contour.map(v => Math.abs(v[1]))) + params.widthMm,
      rows = [];
    for (let row = 0; row < offsets.length; row++) {
      phase = 'row-projection-' + row;
      const offset = offsets[row],
        seeds = guide.map((q, i) => {
          const tangent = unit(add(guide[Math.min(i + 1, guide.length - 1)].point, mul(guide[Math.max(0, i - 1)].point, -1))),
            lateral = unit(cross(tangent, q.normal));
          return add(q.point, mul(lateral, offset));
        });
      const path = trace(seeds),
        lengthMm = lengthOf(path),
        centers = [];
      for (let s = margin + p.spacingMm * phases[row]; s <= lengthMm - margin + 1e-9; s += p.spacingMm) {
        check(++instanceCount <= p.maxCount, `阵列实例超出 maxCount=${p.maxCount} 预算；增加显式预算或缩短片区/增大间距`, 'RESOURCE_LIMIT', 'params.pattern.maxCount');
        const seed = atLength(path, s),
          q = project(seed.point),
          tangent = unit(add(seed.tangent, mul(q.normal, -dot(seed.tangent, q.normal)))),
          lateral = unit(cross(tangent, q.normal));
        centers.push({
          ...q,
          arcLengthMm: s,
          tangent,
          lateral
        });
      }
      rows.push({
        offsetMm: offset,
        phaseFraction: phases[row],
        lengthMm,
        centers
      });
    }
    check(instanceCount > 0, '引导片区过短，容不下一个完整重复细节');
    const details = [];
    for (const [rowIndex, row] of rows.entries())
      for (const center of row.centers) {
        phase = 'contour-cutter-' + details.length;
        const path = trace(contour.map(([x, y]) => add(center.point, mul(center.lateral, x), mul(center.tangent, y))), true),
          tool = makeTool({
            faceId: selected,
            pointsMm: path.map(q => q.point),
            widthMm: params.widthMm,
            depthMm: params.depthMm
          });
        tools.push(tool);
        const samples = tool.projectedGrooveReport.samples;
        details.push({
          rowIndex,
          center: center.point,
          path: path.map(q => q.point),
          cutterPathMm: samples.map(q => q.point),
          normals: path.map(q => q.normal),
          cutSamples: [samples[1], samples[Math.floor(samples.length / 2)], samples.at(-2)]
        });
      }
    phase = 'native-multi-tool-cut';
    const sourceIntegral = measureSignedVolume(source, cad),
      before = sourceIntegral.volumeMm3;
    check(before > 0, '源实体方向/体积不是正值');
    const oc = cad.getOC(),
      builder = new oc.BRepAlgoAPI_Cut(),
      argumentsList = new oc.NCollection_List_TopoDS_Shape(),
      toolsList = new oc.NCollection_List_TopoDS_Shape();
    try {
      // Keep every cutter an explicit native BOP participant, including when
      // caller-authored contours overlap. Do not assume a compound is a union.
      argumentsList.Append(source.wrapped);
      for (const tool of tools) toolsList.Append(tool.wrapped);
      builder.SetArguments(argumentsList);
      builder.SetTools(toolsList);
      builder.SetNonDestructive(true);
      builder.SetRunParallel(false);
      builder.SetFuzzyValue(0);
      builder.Build();
      check(builder.IsDone(), '多刀具刻纹布尔未完成');
      const raw = builder.Shape();
      try {
        result = cad.cast(raw);
      } catch (e) {
        raw.delete();
        throw e;
      }
    } finally {
      try{releaseNativeBoolean(builder);}finally{argumentsList.delete();toolsList.delete();}
    }
    tools.forEach(dispose);
    tools.length = 0;
    const resultSolidCount=solids(result);check(!result.isNull && resultSolidCount === 1, `刻纹阵列产生无效/断开的实体：solidCount=${resultSolidCount},kind=${result.constructor.name}`);
    const resultIntegral = measureSignedVolume(result, cad),
      after = resultIntegral.volumeMm3;
    check(Number.isFinite(after) && after > 0 && before - after > Math.max(1e-8, before * 1e-12, 2 * (before * sourceIntegral.relativeError + after * resultIntegral.relativeError)), `刻纹阵列没有有效移除材料或结果方向错误：source=${before},result=${after}`);
    const analyzer = new oc.BRepCheck_Analyzer(result.wrapped, true, false, false);
    try {
      check(analyzer.IsValid(), '刻纹阵列BRep检查失败');
    } finally {
      analyzer.delete();
    }
    phase = 'material-witnesses';
    let minRemoved = Infinity,
      verified = 0;
    for (const detail of details)
      for (const sample of detail.cutSamples) {
        const half = Math.min(params.widthMm, params.depthMm) * .08,
          point = add(sample.point, mul(sample.normal, -params.depthMm * .5)),
          min = point.map(x => x - half),
          max = point.map(x => x + half),
          box = (2 * half) ** 3,
          a = measureRegionVolume(source, min, max, cad),
          b = measureRegionVolume(result, min, max, cad),
          removed = a.volume - b.volume;
        check(a.volume > box * .8 && removed > box * .5, '刻纹边端/中段未获得真实材料移除见证，保留源件');
        minRemoved = Math.min(minRemoved, removed);
        verified++;
      }
    result.projectedGrooveReport = {
      method: 'surface-projected-staggered-pattern',
      booleanStrategy: 'native-multi-tool-cut',
      fuzzyMm: 0,
      source: 'exact-trimmed-brep-face',
      faceId: selected,
      instanceCount,
      rows: rows.map(r => ({
        ...r,
        centers: r.centers.map(c => ({
          point: c.point,
          normal: c.normal,
          arcLengthMm: c.arcLengthMm
        }))
      })),
      details: details.map(({
        cutSamples,
        ...d
      }) => d),
      spacingMm: p.spacingMm,
      spacingMethod: 'per-row-adaptive-projected-polyline-arclength',
      layoutToleranceMm: tolerance,
      maxAcceptedChordSagMm: maxSag,
      maxSeedProjectionMm: maxSeedGap,
      maxFootprintResidualMm: maxFootprintGap,
      footprintVerification: 'trimmed-face interior support plus independent UV-to-XYZ residual',
      projectionCount: queries,
      verifiedCutSampleCount: verified,
      minRemovedWitnessVolumeMm3: minRemoved,
      volumeIntegration: {
        source: sourceIntegral,
        result: resultIntegral
      },
      sourceVolumeMm3: before,
      volumeMm3: after,
      removedVolumeMm3: before - after,
      limits: 'incised continuous source skin, not raised copies or fusion; one trimmed face only, no seam/geodesic wrapping; numerical projected-polyline arc length, not an exact surface geodesic; three local material-removal witnesses per detail are sampled evidence, not manufacturing tolerance certification'
    };
    const done = result;
    result = null;
    return done;
  } catch (error) {
    throw Object.assign(new Error(`曲面刻纹阶段 ${phase}（${queries}次投影/${instanceCount}个轮廓）：${error.message||error}`, {
      cause: error
    }), {
      code: error.code || 'GEOMETRY_INVALID',
      report: {
        phase,
        projectionCount: queries,
        instanceCount,
        detail: error.report
      }
    });
  } finally {
    dispose(result);
    tools.forEach(dispose);
    edges.forEach(dispose);
    faces.forEach(dispose);
  }
}
