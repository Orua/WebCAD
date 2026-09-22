// 有界曲线扫掠：路径由三点圆弧或 BSpline 逼近生成，截面为圆形。
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
  const { pathType, points, radius } = params;
  if (pathType !== 'arc' && pathType !== 'spline') fail('路径类型必须是 arc 或 spline');
  const expected = pathType === 'arc' ? 3 : 3;
  if (!Array.isArray(points) || points.length < expected || (pathType === 'arc' && points.length !== 3) || (pathType === 'spline' && points.length > 30)) fail(pathType === 'arc' ? '圆弧路径必须恰好有3个点' : '样条路径需要3至30个点');
  if (!points.every(validPoint)) fail('路径点必须是有限的 XYZ 三维坐标');
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (distance(points[i], points[j]) <= EPS) fail('路径不允许重复点或闭合路径');
  if (!Number.isFinite(radius) || radius <= 0) fail('圆截面半径必须大于0');
  const span = Math.max(...points.map((point, i) => Math.max(...points.slice(i + 1).map(other => distance(point, other)), 0)));
  if (!span || radius > span * 10) fail('圆截面半径相对路径过大，无法生成有效实体');
  const tolerance = params.tolerance ?? 0.01;
  if (!Number.isFinite(tolerance) || tolerance < MIN_TOLERANCE || tolerance > MAX_TOLERANCE) fail('样条公差必须在0.00001至0.5毫米之间');
  let edge, circle, profile, spine, start, tangent;
  try {
    if (pathType === 'arc') {
      const a = [points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]];
      const b = [points[2][0] - points[0][0], points[2][1] - points[0][1], points[2][2] - points[0][2]];
      if (norm(cross(a, b)) <= EPS) fail('圆弧三点不能共线');
      edge = cad.makeThreePointArc(points[0], points[1], points[2]);
    } else {
      edge = cad.makeBSplineApproximation(points, { tolerance });
    }
    if (!edge?.pointAt || !edge?.tangentAt) fail('CAD 路径边缺少 pointAt/tangentAt 接口');
    start = edge.pointAt(0);
    tangent = edge.tangentAt(0);
    const tangentLength = norm(tuple(tangent));
    if (!Number.isFinite(tangentLength) || tangentLength <= EPS) fail('路径起点切线无效');
    const center = tuple(start);
    const normal = tuple(tangent);
    circle = cad.makeCircle(radius, center, normal);
    profile = cad.assembleWire([circle]);
    spine = cad.assembleWire([edge]);
    const solid = cad.genericSweep(profile, spine, { frenet: false, transitionMode: 'right' });
    if (!solid) fail('CAD 内核未生成单一有效实体');
    const solids = solid.solids;
    try { if (Array.isArray(solids) && solids.length !== 1) fail('CAD 内核未生成单一有效实体'); }
    finally { solids?.forEach(dispose); }
    return solid;
  } catch (error) {
    if (error?.message?.startsWith('曲线扫掠失败：')) throw error;
    throw new Error(`曲线扫掠失败：${error?.message || 'CAD 内核拒绝该路径或截面'}`);
  } finally {
    // Sweep 已复制所需 BRep；临时 edge/profile/spine 与 point/vector 句柄必须释放。
    dispose(spine); dispose(profile); dispose(circle); dispose(edge); dispose(start); dispose(tangent);
  }
}
