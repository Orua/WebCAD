const EPS = 1e-9;
const dispose = value => { try { value?.delete?.(); } catch {} };

const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
};
const positive = (value, name) => {
  finite(value, name);
  if (value <= 0) throw new Error(`${name} must be positive`);
  return value;
};
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const norm = a => Math.hypot(...a);
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function readRing(input, label) {
  if (!Array.isArray(input)) throw new Error(`${label} must be an array`);
  const points = input.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2) throw new Error(`${label}[${i}] must be [x,y]`);
    return [finite(p[0], `${label}[${i}].x`), finite(p[1], `${label}[${i}].y`)];
  });
  if (points.length > 3 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  if (points.length < 3 || points.length > 2000) throw new Error(`${label} must have 3..2000 vertices`);
  const unique = new Set();
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a[0] === b[0] && a[1] === b[1]) throw new Error(`${label} has duplicate adjacent vertices`);
    const key = `${a[0]},${a[1]}`;
    if (unique.has(key)) throw new Error(`${label} repeats a vertex`);
    unique.add(key);
    const c = points[(i + 2) % points.length];
    if (Math.abs(cross2(a, b, c)) <= EPS && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) throw new Error(`${label} doubles back over an edge`);
  }
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]; area2 += a[0] * b[1] - b[0] * a[1];
  }
  if (!Number.isFinite(area2) || Math.abs(area2) <= EPS) throw new Error(`${label} has zero area`);
  return points;
}

function onSegment(p, a, b, tol) {
  return Math.abs(cross2(a, b, p)) <= tol * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])) &&
    p[0] >= Math.min(a[0], b[0]) - tol && p[0] <= Math.max(a[0], b[0]) + tol &&
    p[1] >= Math.min(a[1], b[1]) - tol && p[1] <= Math.max(a[1], b[1]) + tol;
}
function segmentsMeet(a, b, c, d, tol) {
  const ab1 = cross2(a, b, c), ab2 = cross2(a, b, d), cd1 = cross2(c, d, a), cd2 = cross2(c, d, b);
  if (((ab1 > tol && ab2 < -tol) || (ab1 < -tol && ab2 > tol)) &&
      ((cd1 > tol && cd2 < -tol) || (cd1 < -tol && cd2 > tol))) return true;
  return onSegment(c, a, b, tol) || onSegment(d, a, b, tol) || onSegment(a, c, d, tol) || onSegment(b, c, d, tol);
}
function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function boundariesMeet(ringA, ringB, budget) {
  const aEdges = ringA.map((a, i) => [a, ringA[(i + 1) % ringA.length]]);
  const bEdges = ringA === ringB ? [] : ringB.map((a, i) => [a, ringB[(i + 1) % ringB.length]]);
  // Sweep by min-x; the explicit candidate ceiling bounds hostile all-overlapping
  // boxes while still allowing the full 12k-point contract for normal contours.
  const entries = [
    ...aEdges.map((edge, i) => ({ edge, ring: 0, i })),
    ...bEdges.map((edge, i) => ({ edge, ring: 1, i })),
  ].map(e => ({ ...e, minX: Math.min(e.edge[0][0], e.edge[1][0]), maxX: Math.max(e.edge[0][0], e.edge[1][0]), minY: Math.min(e.edge[0][1], e.edge[1][1]), maxY: Math.max(e.edge[0][1], e.edge[1][1]) }))
    .sort((a, b) => a.minX - b.minX);
  const active = []; let checked = 0;
  for (const e of entries) {
    let keep = 0;
    for (const other of active) {
      if (other.maxX < e.minX - budget.tol) continue;
      active[keep++] = other;
      if (other.maxY < e.minY - budget.tol || e.maxY < other.minY - budget.tol) continue;
      if (e.ring === other.ring) {
        const n = e.ring === 0 ? ringA.length : ringB.length;
        const distance = Math.abs(e.i - other.i);
        if (distance === 0) continue;
        if (distance === 1 || distance === n - 1) continue;
      }
      if (++checked > budget.maxCandidates) throw new Error('contours exceed safe exact-validation complexity; simplify the outlines');
      if (segmentsMeet(e.edge[0], e.edge[1], other.edge[0], other.edge[1], budget.tol)) return true;
    }
    active.length = keep; active.push(e);
  }
  return false;
}
function ringContainsRing(parent, child) { return pointInRing(child[0], parent); }
export function validateRegions(params) {
  const raw = params.regions;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 150) throw new Error('regions must contain 1..150 regions');
  let declaredPoints = 0;
  for (const [ri, region] of raw.entries()) {
    if (!region || typeof region !== 'object' || !Array.isArray(region.outer)) throw new Error(`region ${ri} is invalid`);
    const holes = region.holes ?? [];
    if (!Array.isArray(holes)) throw new Error(`regions[${ri}].holes must be an array`);
    declaredPoints += region.outer.length;
    for (const hole of holes) {
      if (!Array.isArray(hole)) throw new Error(`region ${ri} has an invalid hole`);
      declaredPoints += hole.length;
    }
    if (declaredPoints > 12000) throw new Error('total contour vertices exceed 12000');
  }
  let total = 0;
  const regions = raw.map((region, ri) => {
    if (!region || typeof region !== 'object') throw new Error(`region ${ri} is invalid`);
    const outer = readRing(region.outer, `regions[${ri}].outer`), holesRaw = region.holes ?? [];
    if (!Array.isArray(holesRaw)) throw new Error(`regions[${ri}].holes must be an array`);
    const holes = holesRaw.map((h, hi) => readRing(h, `regions[${ri}].holes[${hi}]`));
    total += outer.length + holes.reduce((s, h) => s + h.length, 0);
    if (total > 12000) throw new Error('total contour vertices exceed 12000');
    return { outer, holes };
  });
  const budget = { tol: EPS, maxCandidates: 2_000_000 };
  const rings = regions.flatMap((region, ri) => [region.outer, ...region.holes].map((points, hi) => ({ points, ri, hi })));
  for (const { points, ri, hi } of rings) {
    if (boundariesMeet(points, points, budget)) throw new Error(`region ${ri} contour ${hi} self-intersects or touches`);
  }
  for (const region of regions) {
    for (const hole of region.holes) {
      if (!ringContainsRing(region.outer, hole)) throw new Error('hole lies outside its outer contour');
      if (boundariesMeet(region.outer, hole, budget)) throw new Error('hole touches or crosses its outer contour');
    }
    for (let i = 0; i < region.holes.length; i++) for (let j = i + 1; j < region.holes.length; j++) {
      if (boundariesMeet(region.holes[i], region.holes[j], budget) || ringContainsRing(region.holes[i], region.holes[j]) || ringContainsRing(region.holes[j], region.holes[i])) throw new Error('holes overlap, touch, or contain one another');
    }
  }
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i], b = regions[j];
    for (const ra of [a.outer, ...a.holes]) for (const rb of [b.outer, ...b.holes]) if (boundariesMeet(ra, rb, budget)) throw new Error(`regions ${i} and ${j} touch or overlap`);
    const aInB = ringContainsRing(b.outer, a.outer) && !b.holes.some(h => pointInRing(a.outer[0], h));
    const bInA = ringContainsRing(a.outer, b.outer) && !a.holes.some(h => pointInRing(b.outer[0], h));
    if (aInB || bInA) throw new Error(`regions ${i} and ${j} overlap`);
  }
  return regions;
}

function unitVector(value, name) {
  if (!Array.isArray(value) || value.length !== 3 || value.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`${name} must be a finite 3-vector`);
  const length = norm(value);
  if (Math.abs(length - 1) > 1e-6) throw new Error(`${name} must be normalized`);
  return value.map(v => v / length);
}
function validateFrame(params) {
  const normal = unitVector(params.faceNormal, 'faceNormal'), x = unitVector(params.faceX, 'faceX');
  if (Math.abs(dot(normal, x)) > 1e-6) throw new Error('faceX must be orthogonal to faceNormal');
  for (const k of ['x', 'y', 'z']) finite(params[k], k);
  return { normal, x };
}
function area(shape, cad) { return Math.abs(cad.measureVolume(shape)); }
function countSolids(shape) {
  const solids = shape.solids;
  try { return solids.length; } finally { solids.forEach(dispose); }
}
function independentCopy(shape, cad) {
  // Replicad's Shape.clone() wraps the same underlying TopoDS_TShape. OCC
  // boolean builders can mark that shared topology modified even on failure.
  return cad.deserializeShape(shape.serialize());
}
/** Build exact logo geometry on the selected planar face's local frame. */
export function buildLogoOnPlane(source, params, cad, supportPrism) {
  if (!source || !params || !cad) throw new Error('source, params and cad are required');
  const mode = params.mode;
  if (!['engrave', 'emboss'].includes(mode)) throw new Error("mode must be 'engrave' or 'emboss'");
  const depth = positive(params.depth, 'depth'), scale = positive(params.scale, 'scale');
  const angle = finite(params.angle, 'angle');
  const draftAngle=finite(params.draftAngle??0,'draftAngle');
  if(draftAngle<0||draftAngle>=45)throw new Error('脱模斜度必须为 0 到小于 45 度');
  const mirrorX = params.mirrorX ?? false;
  if (typeof mirrorX !== 'boolean') throw new Error('mirrorX must be boolean');
  const { normal, x } = validateFrame(params), regions = validateRegions(params);
  const y = [normal[1] * x[2] - normal[2] * x[1], normal[2] * x[0] - normal[0] * x[2], normal[0] * x[1] - normal[1] * x[0]];
  const theta = angle * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
  const transformRing = ring => ring.map(([rawX, rawY]) => {
    const mx = mirrorX ? -rawX : rawX, sx = mx * scale, sy = rawY * scale;
    const lx = sx * c - sy * s, ly = sx * s + sy * c;
    return [lx, ly];
  });
  const plane = new cad.Plane([params.x, params.y, params.z], x, normal);
  const direction = mode === 'engrave' ? -1 : 1;
  let current = source, ownsCurrent = false;
  try {
    const sourceVolume = area(source, cad), initialSolids = countSolids(source);
    if (!(sourceVolume > 0) || initialSolids < 1) throw new Error('source must contain at least one solid');
    current = independentCopy(source, cad); ownsCurrent = true;
    for (let ri = 0; ri < regions.length; ri++) {
      let drawing, sketch, tool, next;
      const owned = [];
      const hold = value => { if (value) owned.push(value); return value; };
      try {
        const outerPoints = transformRing(regions[ri].outer);
        drawing = hold(cad.draw(outerPoints[0]));
        for (const point of outerPoints.slice(1)) drawing.lineTo(point);
        drawing = hold(drawing.close());
        sketch = hold(drawing.sketchOnPlane(plane));
        tool = hold(sketch.extrude(direction * depth));
        for (const rawHole of regions[ri].holes) {
          const hp = transformRing(rawHole), hd = hold(cad.draw(hp[0]));
          for (const point of hp.slice(1)) hd.lineTo(point);
          const closed = hold(hd.close()), hs = hold(closed.sketchOnPlane(plane)), holeTool = hold(hs.extrude(direction * depth));
          const cutTool = hold(tool.cut(holeTool));
          if (!cutTool) throw new Error(`region ${ri} hole cut failed`);
          dispose(tool); tool = cutTool;
        }
        if(draftAngle){
          try{
            const drafted=hold(tool.draft(direction*draftAngle,f=>f.not(side=>side.parallelTo(plane)),plane));
            const checker=new (cad.getOC().BRepCheck_Analyzer)(drafted.wrapped,true,false,false);
            try{if(!checker.IsValid())throw new Error('invalid tapered geometry');}finally{dispose(checker);}
            if(!(area(drafted,cad)>0)||area(drafted,cad)>=area(tool,cad))throw new Error('invalid taper direction or collapsed contour');
            dispose(tool);tool=drafted;
          }catch(error){throw new Error('LOGO 脱模斜度生成失败：请减小深度或斜度，检查细窄笔画与内孔。 / Draft failed: reduce depth or angle. '+(error.message||error));}
        }
        const toolVolume = area(tool, cad);
        if (!(toolVolume > 0)) throw new Error(`region ${ri} produced no volume`);
        if (supportPrism) {
          const outside = hold(tool.cut(supportPrism)), outsideVolume = outside ? area(outside, cad) : 0;
          if (outsideVolume > Math.max(1e-7, toolVolume * 1e-9)) throw new Error(`region ${ri} crosses the selected face boundary or a hole`);
        }
        if (mode === 'engrave') next = current.cut(tool);
        else next = current.fuse(tool);
        if (!next) throw new Error(`region ${ri} boolean operation failed`);
        const nextVolume = area(next, cad), delta = mode === 'engrave' ? area(current, cad) - nextVolume : nextVolume - area(current, cad);
        if (!(delta > Math.max(1e-7, sourceVolume * 1e-12))) throw new Error(`region ${ri} does not change the source solid`);
        if (mode === 'emboss') {
          if (countSolids(next) > initialSolids) throw new Error(`emboss region ${ri} increases the solid count`);
          const sourceCopy = independentCopy(source, cad);
          let sourceContact;
          try {
            sourceContact = sourceCopy.fuse(tool);
            if (!sourceContact) throw new Error(`emboss region ${ri} cannot be checked against the source`);
            if (countSolids(sourceContact) > initialSolids) throw new Error(`emboss region ${ri} does not connect to the source`);
          } finally { dispose(sourceContact); dispose(sourceCopy); }
        }
        if (ownsCurrent) dispose(current);
        current = next; next = null; ownsCurrent = true;
      } finally {
        dispose(next);
        // Each hole's construction handles are also in this list.
        owned.reverse().forEach(dispose);
      }
    }
    ownsCurrent = false;
    return current;
  } catch (error) {
    if (ownsCurrent) dispose(current);
    throw error;
  } finally { dispose(plane); }
}

/** Independent planar faces or extruded solids from reviewed closed vector regions. */
export function buildVectorProfile(params, cad) {
  const regions=validateRegions(params),scale=positive(params.scale??1,'scale'),angle=finite(params.angle??0,'angle');
  if(!['face','solid'].includes(params.output))throw new Error('请选择生成面或实体 / Choose face or solid');
  const frames={XY:[[1,0,0],[0,0,1]],XZ:[[1,0,0],[0,-1,0]],YZ:[[0,1,0],[1,0,0]]};
  const frame=frames[params.plane??'XY'];if(!frame)throw new Error('无效工作平面');
  const height=params.output==='solid'?finite(params.height,'height'):0;if(params.output==='solid'&&!height)throw new Error('实体厚度不能为零');
  const origin=['x','y','z'].map(k=>finite(params[k]??0,k)),plane=new cad.Plane(origin,...frame),shapes=[];
  const theta=angle*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
  const ring=points=>{const p=points.map(([x,y])=>[scale*(x*c-y*s),scale*(x*s+y*c)]),pen=cad.draw(p[0]);for(const v of p.slice(1))pen.lineTo(v);return pen.close();};
  try{
    for(const region of regions){let drawing=ring(region.outer),sketch;
      try{for(const hole of region.holes){const h=ring(hole),previous=drawing;try{drawing=previous.cut(h);}finally{dispose(h);dispose(previous);}}
        sketch=drawing.sketchOnPlane(plane);shapes.push(params.output==='solid'?sketch.extrude(height):(typeof sketch.face==='function'?sketch.face():sketch.faces()));
      }finally{dispose(sketch);dispose(drawing);}
    }
    if(shapes.length===1)return shapes.pop();
    return cad.makeCompound(shapes);
  }finally{shapes.forEach(dispose);dispose(plane);}
}
