// Reference geometry helpers. They return a displayable compound and never mutate the source shape.
import {rotateVector,worldPoint} from './work-frame.js';
const dispose = value => { try { value?.delete?.(); } catch {} };
function fail(message) { throw new Error(`参考曲线失败：${message}`); }

export function extractFaceBoundary(shape, faceId, cad, { boundary = 'all' } = {}) {
  if (!shape || !cad?.makeCompound) fail('缺少源形状或 CAD 适配器');
  if (!Number.isInteger(faceId) || faceId < 0) fail('faceId 必须是非负整数');
  if (!['all', 'outer'].includes(boundary)) fail('boundary 必须为 all 或 outer');
  const faces = shape.faces;
  if (faceId >= faces.length) { faces.forEach(dispose); fail('faceId 超出范围'); }
  const face = faces[faceId]; faces.forEach((item, index) => { if (index !== faceId) dispose(item); });
  let edges, wire;
  try {
    if (boundary === 'outer') wire = face.clone().outerWire();
    edges = wire ? wire.edges : face.edges;
    if (!edges.length) fail('选定面没有边界');
    const result = cad.makeCompound(edges);
    if (!result) fail('边界提取结果为空');
    return result;
  } finally { edges?.forEach(dispose); dispose(wire); dispose(face); }
}

export const PLANE_SECTION_RESULTS = Object.freeze(['edges', 'wire', 'polyline']);
export const PLANE_SECTION_SAMPLES = Object.freeze({ default: 64, min: 4, max: 512 });

const tuple = value => { try { return value.toTuple(); } finally { dispose(value); } };
const close = (a, b, tol) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) <= tol;

// Greedy endpoint chaining of section edges. Each chain is an ordered list of
// {edge, reversed}; closed reports whether the last end meets the first start.
export function chainSectionEdges(items, tolerance) {
  const left = items.map((item, index) => ({ ...item, index }));
  const chains = [];
  while (left.length) {
    const first = left.shift(), chain = [{ ...first, reversed: false }];
    let head = first.start, tail = first.end, grown = true;
    while (grown && left.length) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const item = left[i];
        if (close(item.start, tail, tolerance)) { chain.push({ ...item, reversed: false }); tail = item.end; }
        else if (close(item.end, tail, tolerance)) { chain.push({ ...item, reversed: true }); tail = item.start; }
        else if (close(item.end, head, tolerance)) { chain.unshift({ ...item, reversed: false }); head = item.start; }
        else if (close(item.start, head, tolerance)) { chain.unshift({ ...item, reversed: true }); head = item.end; }
        else continue;
        left.splice(i, 1); grown = true; break;
      }
    }
    chains.push({ items: chain, closed: close(head, tail, tolerance) });
  }
  return chains;
}

// Distribute a per-loop sample budget over chained edges by length.
export function sectionSampleParameters(lengths, samples) {
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  return lengths.map(length => Math.max(1, Math.round(samples * length / total)));
}

function sectionTolerance(result) {
  const box = result.boundingBox;
  let diagonal = 1;
  try { const [[a, b, c], [d, e, f]] = box.bounds; diagonal = Math.max(Math.hypot(d-a, e-b, f-c), 1); } finally { dispose(box); }
  return Math.max(1e-6, diagonal * 1e-6, 1e-4);
}
// Ordered sample points per connected section chain (shared by polyline
// output and the planeSample measurement).
export function sampleSectionChains(result, edges, samples, cad) {
  const tolerance = sectionTolerance(result);
  const items = edges.map(edge => ({ edge, start: tuple(edge.startPoint), end: tuple(edge.endPoint), length: cad.measureLength ? cad.measureLength(edge) : 1 }));
  const chains = chainSectionEdges(items, tolerance), out = [];
  for (const chain of chains) {
    const counts = sectionSampleParameters(chain.items.map(item => item.length), samples), points = [];
    chain.items.forEach((item, index) => {
      const n = counts[index];
      for (let k = 0; k < n; k++) {
        const t = k / n, position = item.reversed ? 1 - t : t;
        points.push(tuple(item.edge.pointAt(position)));
      }
    });
    const last = chain.items.at(-1);
    if (!chain.closed) points.push(last.reversed ? last.start : last.end);
    const distinct = points.filter((point, index) => index === 0 || !close(point, points[index - 1], tolerance));
    if (chain.closed && distinct.length > 2 && close(distinct[0], distinct.at(-1), tolerance)) distinct.pop();
    if (distinct.length < 2) continue;
    out.push({ closed: !!chain.closed && distinct.length > 2, points: distinct, lengthMm: chain.items.reduce((n, item) => n + item.length, 0), chain });
  }
  return { chains: out, tolerance };
}
function sectionResult(result, edges, mode, samples, cad) {
  if (mode === 'edges') return result;
  const built = [];
  try {
    if (mode === 'wire') {
      const tolerance = sectionTolerance(result);
      const items = edges.map(edge => ({ edge, start: tuple(edge.startPoint), end: tuple(edge.endPoint), length: cad.measureLength ? cad.measureLength(edge) : 1 }));
      for (const chain of chainSectionEdges(items, tolerance)) {
        try { built.push(cad.assembleWire(chain.items.map(item => item.edge))); }
        catch { chain.items.forEach(item => built.push(item.edge.clone ? item.edge.clone() : item.edge)); }
      }
    } else {
      for (const { closed, points } of sampleSectionChains(result, edges, samples, cad).chains) {
        const lines = [];
        for (let i = 0; i < points.length - 1; i++) lines.push(cad.makeLine(points[i], points[i + 1]));
        if (closed) lines.push(cad.makeLine(points.at(-1), points[0]));
        try { built.push(cad.assembleWire(lines)); } finally { lines.forEach(dispose); }
      }
    }
    if (!built.length) fail('截面没有可连接的交线');
    return cad.makeCompound(built);
  } finally { built.forEach(dispose); dispose(result); }
}
export function extractPlaneSection(shape, { plane, offset = 0, frame, result: resultMode = 'edges', samples = PLANE_SECTION_SAMPLES.default } = {}, cad) {
  if (!shape || !cad?.makeCompound) fail('缺少源形状或 CAD 适配器');
  if (!['XY', 'XZ', 'YZ'].includes(plane)) fail('截面平面必须是 XY、XZ 或 YZ');
  if (!Number.isFinite(offset)) fail('截面 offset 必须是有限数值');
  if (!PLANE_SECTION_RESULTS.includes(resultMode)) fail('result 必须是 edges、wire 或 polyline');
  if (!Number.isInteger(samples) || samples < PLANE_SECTION_SAMPLES.min || samples > PLANE_SECTION_SAMPLES.max) fail(`samples 必须是 ${PLANE_SECTION_SAMPLES.min}–${PLANE_SECTION_SAMPLES.max} 的整数`);
  let planeFace, drawing, sketch, builder, box;
  try {
    box = shape.boundingBox; const [[minX,minY,minZ],[maxX,maxY,maxZ]] = box.bounds;
    const span = Math.max(maxX-minX,maxY-minY,maxZ-minZ,1) * 4 + Math.abs(offset) + 10;
    let origin = plane === 'XY' ? [(minX+maxX)/2,(minY+maxY)/2,offset] : plane === 'XZ' ? [(minX+maxX)/2,offset,(minZ+maxZ)/2] : [offset,(minY+maxY)/2,(minZ+maxZ)/2];
    let xDir = plane === 'XY' ? [1,0,0] : plane === 'XZ' ? [1,0,0] : [0,1,0];
    let normal = plane === 'XY' ? [0,0,1] : plane === 'XZ' ? [0,-1,0] : [1,0,0];
    if(frame){
      const local=plane==='XY'?[0,0,offset]:plane==='XZ'?[0,offset,0]:[offset,0,0],onPlane=worldPoint(frame,local);
      xDir=rotateVector(frame.quaternion,xDir);normal=rotateVector(frame.quaternion,normal);
      const center=[(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2],delta=center.map((v,i)=>v-onPlane[i]),projection=delta.reduce((s,v,i)=>s+v*normal[i],0);
      origin=center.map((v,i)=>v-projection*normal[i]);
    }
    drawing = cad.drawRectangle(span, span); sketch = drawing.sketchOnPlane(new cad.Plane(origin,xDir,normal)); planeFace = sketch.face();
    const Section = cad.getOC?.().BRepAlgoAPI_Section; if (!Section) fail('当前 OCCT 不提供精确 Section API');
    builder = new Section(shape.wrapped, planeFace.wrapped); builder.Build();
    if (!builder.IsDone?.() || builder.Shape?.().IsNull?.()) fail('截面未穿过实体');
    const result = cad.cast(builder.Shape()), resultEdges = result?.edges || [];
    if (!resultEdges.length) { resultEdges.forEach(dispose); dispose(result); fail('截面没有交线'); }
    if (resultMode === 'edges') { resultEdges.forEach(dispose); return result; }
    try { return sectionResult(result, resultEdges, resultMode, samples, cad); }
    finally { resultEdges.forEach(dispose); }
  } finally {
    dispose(builder); dispose(planeFace); dispose(sketch); dispose(drawing); dispose(box);
  }
}
