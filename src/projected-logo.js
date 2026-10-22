import { validateRegions } from './logo-model.js';

const dispose = value => { try { value?.delete(); } catch {} };
const check = (ok, message) => { if (!ok) throw new Error(message); };
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const unit = v => { const a = v.toTuple(), n = Math.hypot(...a); check(n > 1e-10, '投影方向退化'); return a.map(x => x / n); };
const count = shape => { const solids = shape.solids; try { return solids.length; } finally { solids.forEach(dispose); } };
const volume = (shape, cad) => Math.abs(cad.measureVolume(shape));
const area2 = ring => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function valid(shape, cad) {
  const analyzer = new (cad.getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  try { check(!shape.isNull && analyzer.IsValid(), '投影凹刻未生成有效精确实体'); } finally { dispose(analyzer); }
}

/** Exact face prisms along ONE projection vector. Shared boundaries therefore
 * meet at the same translated edge, including plane/fillet and periodic seams.
 * Depth is directional, deliberately distinct from curvedLogo normal depth.
 */
export function buildProjectedLogo(source, params, cad) {
  check(params.mode === 'engrave', '跨相连面投影目前仅支持凹刻');
  check((params.draftAngle ?? 0) === 0, '跨相连面投影暂不支持拔模斜度');
  check(params.placementVersion === 2, '跨相连面投影需要 placementVersion:2 和明确放置点');
  check(Number.isFinite(params.depth) && params.depth > 0, '投影深度必须大于 0');
  check(Array.isArray(params.point) && params.point.length === 3 && params.point.every(Number.isFinite), '请选择有效的 LOGO 放置点');
  const regions = validateRegions(params, { maxRegions: 150, maxVertices: 12000, maxRingVertices: 2000 });
  const scale = params.scale ?? 1, angle = params.angle ?? 0, ox = params.offsetX ?? 0, oy = params.offsetY ?? 0;
  check([scale, angle, ox, oy].every(Number.isFinite) && scale > 0, 'LOGO 比例、角度与偏移无效');
  check(params.mirrorX === undefined || typeof params.mirrorX === 'boolean', '镜像必须是布尔值');
  check(count(source) === 1, '跨相连面投影需要一个封闭实体');
  const owned = [], hold = o => { owned.push(o); return o; };
  // Even face Common/intersection can update shared OCCT topology flags. Work
  // exclusively on a serialized copy, including all preflight booleans.
  source = hold(cad.deserializeShape(source.serialize()));
  const faces = source.faces;
  owned.push(...faces);
  let result;
  try {
    check(Number.isInteger(params.faceId) && faces[params.faceId], '目标面已失效，请重新选面');
    const face = faces[params.faceId], vertex = hold(cad.makeVertex(params.point)), query = hold(new cad.DistanceQuery(face));
    check(query.distanceTo(vertex) <= .1, 'LOGO 中心不在所选面内（允许 0.1 mm 显示网格吸附）');
    const snapped = hold(query.wrapped.PointOnShape1(1)), point = [snapped.X(), snapped.Y(), snapped.Z()];
    const normal = unit(hold(face.normalAt(point)));
    check(!params.frameNormal || dot(params.frameNormal, normal) >= 1 - 1e-6, '工作基准法向与目标面法向不一致');
    const seed = params.frameX || (Math.abs(normal[0]) < .9 ? [1, 0, 0] : [0, 1, 0]);
    const tangent = seed.map((v, i) => v - dot(seed, normal) * normal[i]), length = Math.hypot(...tangent);
    check(length > 1e-8, '工作基准 X 方向与投影方向平行');
    const x = tangent.map(v => v / length), y = [normal[1]*x[2]-normal[2]*x[1], normal[2]*x[0]-normal[0]*x[2], normal[0]*x[1]-normal[1]*x[0]];
    const box = hold(source.boundingBox), [min, max] = box.bounds, reach = Math.hypot(...max.map((v, i) => v - min[i])) + params.depth + 1;
    const plane = hold(new cad.Plane(point.map((v, i) => v + reach * normal[i] + ox*x[i] + oy*y[i]), x, normal));
    const vector = hold(new cad.Vector(normal.map(v => -v * params.depth)));
    const theta = angle * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
    const draw = (ring, own) => {
      const pts = ring.map(([u,v]) => { u *= scale * (params.mirrorX ? -1 : 1); v *= scale; return [u*c-v*s,u*s+v*c]; });
      const pen = own(cad.draw(pts[0])); for (const p of pts.slice(1)) pen.lineTo(p); return own(pen.close());
    };
    // Only actual shared topology admits a neighbour; proximity never joins parts.
    const boundaries = faces.map(f => f.edges); boundaries.forEach(edges => owned.push(...edges));
    const neighbours = faces.map(() => new Set()), buckets = new Map();
    boundaries.forEach((edges, i) => edges.forEach(edge => {
      const bucket = buckets.get(edge.hashCode) || [];
      for (const other of bucket) if (other.edge.isSame(edge)) { neighbours[i].add(other.id); neighbours[other.id].add(i); }
      bucket.push({ id: i, edge }); buckets.set(edge.hashCode, bucket);
    }));
    const allCutters = [], touched = new Set();
    let expectedRemoval = 0;
    for (const [ri, region] of regions.entries()) {
      const local = [], own = o => { local.push(o); return o; };
      try {
        let drawing = draw(region.outer, own);
        for (const hole of region.holes) drawing = own(drawing.cut(draw(hole, own)));
        const sketch = own(drawing.sketchOnPlane(plane)), mask = own(sketch.extrude(-2 * reach));
        const candidates = new Map();
        for (const [id, candidate] of faces.entries()) {
          const common = own(new (cad.getOC().BRepAlgoAPI_Common)(candidate.wrapped, mask.wrapped));
          common.Build(); const clipped = own(cad.cast(common.Shape())), patches = clipped.faces; local.push(...patches);
          const front = patches.filter(patch => dot(unit(own(patch.normalAt())), normal) > .15);
          if (front.length) candidates.set(id, front);
        }
        // A disconnected letter may be wholly on a neighbouring face, so use the
        // source topology graph (front-facing faces), not just this glyph's patches.
        const connected = new Set([params.faceId]), pending = [params.faceId];
        while (pending.length) for (const id of neighbours[pending.pop()]) {
          if (connected.has(id)) continue;
          if (!candidates.has(id) && dot(unit(own(faces[id].normalAt())), normal) <= .15) continue;
          connected.add(id); pending.push(id);
        }
        let projectedVolume = 0, joined = null;
        for (const [id, patches] of candidates) if (connected.has(id)) for (const patch of patches) {
          const edges = patch.edges; local.push(...edges);
          for (const edge of edges) for (const t of [.05, .5, .95]) {
            const p = own(edge.pointAt(t)), n = unit(own(patch.normalAt(p)));
            check(dot(n, normal) > .15, 'LOGO 投影接近侧壁或折返，请更换投影方向');
          }
          const tool = own(cad.basicFaceExtrusion(patch, vector));
          if (tool instanceof cad.Solid) check(cad.getOC().BRepLib.OrientClosedSolid(tool.wrapped), '投影刀具方向无效');
          valid(tool, cad); check(count(tool) === 1, '投影面未生成封闭刀具');
          const v = volume(tool, cad), inside = own(tool.intersect(source));
          check(v > 1e-9 && Math.abs(v - volume(inside, cad)) <= Math.max(1e-6, v * 1e-6), '投影深度穿透薄壁或超出实体，请减小深度');
          projectedVolume += v; touched.add(id);
          const independent = own(cad.deserializeShape(tool.serialize()));
          joined = joined ? own(joined.fuse(independent)) : independent;
        }
        const expected = (area2(region.outer) - region.holes.reduce((sum, h) => sum + area2(h), 0)) * scale * scale * params.depth;
        check(Math.abs(projectedVolume - expected) <= Math.max(1e-5, expected * 1e-5), `区域 ${ri} 的投影跨越外边界、孔洞或重叠表面，未完整覆盖字样`);
        valid(joined, cad);
        allCutters.push(hold(cad.deserializeShape(joined.serialize())));
        expectedRemoval += projectedVolume;
      } finally { local.reverse().forEach(dispose); }
    }
    const copy = hold(cad.deserializeShape(source.serialize())), tools = hold(cad.makeCompound(allCutters));
    result = copy.cut(tools); valid(result, cad);
    check(count(result) === 1, '投影凹刻使实体断开，请减小深度');
    const removed = volume(source, cad) - volume(result, cad);
    check(removed > 1e-8 && Math.abs(removed - expectedRemoval) <= Math.max(1e-5, expectedRemoval * 1e-5), '跨面刀具接缝体积校验失败，未提交');
    result.logoProjectionReport = { mode: 'connectedFaces', depthDirection: 'projection', depthMm: params.depth, direction: normal.map(v => -v), sourceFaceIds: [...touched].sort((a,b)=>a-b), removedVolumeMm3: removed };
    const output = result; result = null; return output;
  } finally { dispose(result); owned.reverse().forEach(dispose); }
}
