import { buildGuidedLoft } from './loft-guided.js';

const dispose = value => { try { value?.delete?.(); } catch {} };
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

function rotate(q, v) {
  const [x, y, z, w] = q, u = [x, y, z];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return add(v, add(cross(u, v).map(value => 2 * w * value), cross(u, cross(u, v)).map(value => 2 * value)));
}

function frozenPlacement(feature, label) {
  const placement = feature?.placement, frame = placement?.frameSnapshot, sourcePoint = placement?.sourcePoint;
  if (!frame || !Array.isArray(frame.origin) || frame.origin.length !== 3 || !frame.origin.every(Number.isFinite) || !Array.isArray(frame.quaternion) || frame.quaternion.length !== 4 || !frame.quaternion.every(Number.isFinite)) fail('GUIDED_LOFT_BINDING_FRAME_INVALID', `${label} 缺少有效的冻结创建坐标系。`);
  if (!Array.isArray(sourcePoint) || sourcePoint.length !== 3 || !sourcePoint.every(Number.isFinite)) fail('GUIDED_LOFT_BINDING_ANCHOR_UNFROZEN', `${label} 的 sourcePoint 未冻结；guidedLoft 来源绑定不推测 bounds 锚点。`);
  const length = Math.hypot(...frame.quaternion);
  if (Math.abs(length - 1) > 1e-6) fail('GUIDED_LOFT_BINDING_FRAME_INVALID', `${label} 的冻结四元数未归一化。`);
  return { frame, sourcePoint };
}

function localPointToWorld(point, placement) {
  return add(rotate(placement.frame.quaternion, sub(point, placement.sourcePoint)), placement.frame.origin);
}

function worldPointToLocal(point, placement) {
  const [x, y, z, w] = placement.frame.quaternion;
  return add(rotate([-x, -y, -z, w], sub(point, placement.frame.origin)), placement.sourcePoint);
}

function sourceToTargetPoint(point, sourcePlacement, targetPlacement) {
  return worldPointToLocal(localPointToWorld(point, sourcePlacement), targetPlacement);
}

function sourceToTargetVector(vector, sourcePlacement, targetPlacement) {
  const [x, y, z, w] = targetPlacement.frame.quaternion;
  return rotate([-x, -y, -z, w], rotate(sourcePlacement.frame.quaternion, vector));
}

function transformSourceRecipe(feature, sourcePlacement, targetPlacement) {
  const params = feature.params;
  if (!Array.isArray(params?.sections)) fail('GUIDED_LOFT_BINDING_SOURCE_INVALID', '来源 guidedLoft 缺少 sections 配方。');
  return {
    ...feature,
    params: {
      ...params,
      sections: params.sections.map(section => ({
        ...section,
        frame: {
          ...section.frame,
          centerMm: sourceToTargetPoint(section.frame.centerMm, sourcePlacement, targetPlacement),
          normal: sourceToTargetVector(section.frame.normal, sourcePlacement, targetPlacement),
          widthDirection: sourceToTargetVector(section.frame.widthDirection, sourcePlacement, targetPlacement),
        },
      })),
      ...(Array.isArray(params.guides) ? { guides: params.guides.map(guide => ({ ...guide, pointsMm: guide.pointsMm.map(point => sourceToTargetPoint(point, sourcePlacement, targetPlacement)) })) } : {}),
    },
  };
}

function transformWorldShapeToTarget(shape, targetPlacement) {
  const [x, y, z, w] = targetPlacement.frame.quaternion, vectorLength = Math.hypot(x, y, z);
  let out = shape.clone(), next;
  try {
    next = out.translate(...targetPlacement.frame.origin.map(value => -value)); dispose(out); out = next; next = null;
    if (vectorLength > 1e-12) {
      const degrees = -2 * Math.atan2(vectorLength, w) * 180 / Math.PI;
      next = out.rotate(degrees, [0, 0, 0], [x / vectorLength, y / vectorLength, z / vectorLength]); dispose(out); out = next; next = null;
    }
    next = out.translate(...targetPlacement.sourcePoint); dispose(out); out = next; next = null;
    return out;
  } catch (error) {
    dispose(next); dispose(out);
    throw error;
  }
}

/** Parent dispatch helper. The returned B-rep remains in the feature's local creation frame. */
export function buildBoundGuidedLoft(feature, shapes, historyFeatures, cad) {
  if (!feature || feature.op !== 'guidedLoft' || !feature.params) fail('GUIDED_LOFT_BINDING_FEATURE_INVALID', '当前特征必须是带参数的 guidedLoft。');
  const refs = feature.refs ?? [], matchTo = feature.params.matchTo;
  if (!Array.isArray(refs)) fail('GUIDED_LOFT_BINDING_REFS_INVALID', 'guidedLoft refs 必须是数组。');
  if (matchTo) {
    if (refs.length !== 1 || refs[0] !== matchTo.featureId) fail('GUIDED_LOFT_BINDING_REFS_INVALID', 'matchTo 必须且只能绑定到唯一的 refs 来源。');
  } else if (refs.length !== 0) fail('GUIDED_LOFT_BINDING_REFS_INVALID', 'G0 新建 guidedLoft 的 refs 必须为空。');

  const targetPlacement = frozenPlacement(feature, '当前特征');
  if (!matchTo) return buildGuidedLoft(feature.params, cad);
  const history = Array.isArray(historyFeatures) ? historyFeatures : [];
  const source = history.find(item => item.id === matchTo.featureId);
  if (!source || source.op !== 'guidedLoft') fail('GUIDED_LOFT_BINDING_SOURCE_UNSUPPORTED', 'matchTo 来源必须是 historyFeatures 中的 guidedLoft 特征；不支持猜测其他来源的接缝导数。');
  const sourcePlacement = frozenPlacement(source, '来源特征');
  const sourceShape = shapes instanceof Map ? shapes.get(source.id) : shapes?.[source.id];
  if (!sourceShape) fail('GUIDED_LOFT_BINDING_SHAPE_MISSING', '找不到 matchTo 来源特征的当前 B-rep。');
  const localSource = transformWorldShapeToTarget(sourceShape, targetPlacement);
  try {
    const matchFeature = transformSourceRecipe(source, sourcePlacement, targetPlacement);
    return buildGuidedLoft(feature.params, cad, { matchFeature, matchShape: localSource });
  } finally { dispose(localSource); }
}
