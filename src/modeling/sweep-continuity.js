// Shared path-corner check for profileSweep and curveSweep.
// A smooth path (circle, tangent arcs) stays sweepable in transitionMode
// "transformed". A sharp C0 corner in that mode does not produce a solid
// on open or closed paths; use "right" or "round", or a tangent arc.
const EPS = 1e-12;
const sub = (a, b) => a.map((value, index) => value - b[index]);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const mul = (a, k) => a.map(value => value * k);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
export function unit(vector) {
  const length = norm(vector);
  if (!(length > EPS)) return null;
  return mul(vector, 1 / length);
}
export function turnDegrees(a, b) {
  const left = unit(a), right = unit(b);
  if (!left || !right) return 180;
  const cosine = Math.max(-1, Math.min(1, dot(left, right)));
  return Math.acos(cosine) * 180 / Math.PI;
}
function circleCenter(a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), normal = cross(ab, ac), scale = 2 * dot(normal, normal);
  if (!(scale > EPS)) return null;
  return a.map((value, index) => value + (cross(ac, normal)[index] * dot(ab, ab) - cross(ab, normal)[index] * dot(ac, ac)) / scale);
}
function segmentTangent(segment, atEnd) {
  const points = segment.points;
  if (segment.type === 'line') return unit(sub(points[1], points[0]));
  const [start, mid, end] = points;
  const center = circleCenter(start, mid, end);
  if (!center) return null;
  const point = atEnd ? end : start;
  const travel = atEnd ? sub(end, mid) : sub(mid, start);
  const normal = unit(cross(sub(mid, start), sub(end, start)));
  const radial = unit(sub(point, center));
  if (!normal || !radial) return null;
  const tangent = cross(normal, radial);
  return dot(tangent, travel) >= 0 ? unit(tangent) : unit(mul(tangent, -1));
}
export function maxSegmentCornerDegrees(segments, {closed = true} = {}) {
  if (!Array.isArray(segments) || segments.length < 2) return 0;
  const tangents = segments.map(segment => ({ start: segmentTangent(segment, false), end: segmentTangent(segment, true) }));
  let max = 0;
  const last = closed ? tangents.length : tangents.length - 1;
  for (let index = 0; index < last; index++) {
    const next = tangents[(index + 1) % tangents.length];
    if (!tangents[index].end || !next.start) return 180;
    max = Math.max(max, turnDegrees(tangents[index].end, next.start));
  }
  return max;
}
const dispose = value => { try { value?.delete?.(); } catch {} };
function tupleOf(value) {
  try { return typeof value?.toTuple === 'function' ? value.toTuple() : [value?.x, value?.y, value?.z]; }
  finally { dispose(value); }
}
export function maxWireCornerDegrees(wire, {closed = true} = {}) {
  const edges = wire?.edges || [];
  try {
    if (!edges.length) return 0;
    let max = 0;
    const last = closed ? edges.length : Math.max(0, edges.length - 1);
    for (let index = 0; index < last; index++) {
      const next = edges[(index + 1) % edges.length];
      max = Math.max(max, turnDegrees(tupleOf(edges[index].tangentAt(1)), tupleOf(next.tangentAt(0))));
    }
    return max;
  } finally { edges.forEach(dispose); }
}
export const SHARP_CORNER_DEGREES = 15;
export function sharpSweepMessage(maxCornerDeg, transitionMode, {closed = true} = {}) {
  const corner = Number.isFinite(maxCornerDeg) ? `${maxCornerDeg.toFixed(1)}°` : '尖角';
  const kind = closed ? '闭合扫掠路径' : '开放扫掠路径';
  return `${kind}在切向不连续的折角处不能生成实体（最大转角 ${corner}，当前 transitionMode:${transitionMode}）。请改用 transitionMode:"right" 或 "round"，或把尖角改成相切圆弧段。`;
}
export function sharpClosedSweepMessage(maxCornerDeg, transitionMode) {
  return sharpSweepMessage(maxCornerDeg, transitionMode, {closed: true});
}
