import * as cad from 'replicad';
import { topologyDetails } from './smooth-transition.js';
import { planarFace } from './reference-profile-wires.js';

const dispose = value => { try { value?.delete(); } catch {} };
function invalid(path, message) {
  throw Object.assign(new Error(message), { code: 'PARAM_SCHEMA_INVALID', path, recoveryAction: 'READ_TOOL_AND_CORRECT_PARAMS' });
}
function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, '筛选必须为对象');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${path}.${key}`, `不支持的筛选字段 ${key}`);
}
function number(value, path, min = 0, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(path, '需要范围内的有限数值');
  return value;
}
function range(value, path) {
  object(value, ['min', 'max'], path);
  if (value.min === undefined && value.max === undefined) invalid(path, '范围至少需要 min 或 max');
  if (value.min !== undefined) number(value.min, `${path}.min`);
  if (value.max !== undefined) number(value.max, `${path}.max`);
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) invalid(path, 'min 不能大于 max');
  return { ...value };
}

// onFaceId is internal only: the command boundary resolves a current face token.
export function normalizeGeometryFilter(kind, filter = {}) {
  if (!['face', 'edge'].includes(kind)) invalid('kind', 'kind 必须为 face 或 edge');
  object(filter, kind === 'face' ? ['surfaceType', 'normal', 'atExtreme'] : ['curveType', 'lengthRangeMm', 'radiusRangeMm', 'onFaceId'], 'filter');
  const result = { ...filter };
  if (kind === 'face') {
    if (filter.surfaceType !== undefined && filter.surfaceType !== 'plane') invalid('filter.surfaceType', '首批仅支持 plane 面类型筛选');
    if (filter.normal !== undefined) {
      object(filter.normal, ['direction', 'sameDirection', 'angleToleranceDeg'], 'filter.normal');
      const direction = filter.normal.direction;
      if (!Array.isArray(direction) || direction.length !== 3 || direction.some(v => typeof v !== 'number' || !Number.isFinite(v))) invalid('filter.normal.direction', '法向需要三个有限数值');
      const magnitude = Math.hypot(...direction);
      if (!Number.isFinite(magnitude) || magnitude < 1e-12) invalid('filter.normal.direction', '法向不可为零向量');
      const sameDirection = filter.normal.sameDirection ?? true;
      if (typeof sameDirection !== 'boolean') invalid('filter.normal.sameDirection', 'sameDirection 必须为布尔值');
      result.normal = { direction: direction.map(v => v / magnitude), sameDirection, angleToleranceDeg: number(filter.normal.angleToleranceDeg ?? 0.1, 'filter.normal.angleToleranceDeg', 0, 180) };
    }
    if (filter.atExtreme !== undefined) {
      object(filter.atExtreme, ['axis', 'side', 'toleranceMm'], 'filter.atExtreme');
      if (!['X', 'Y', 'Z'].includes(filter.atExtreme.axis)) invalid('filter.atExtreme.axis', 'axis 必须为 X/Y/Z');
      if (!['min', 'max'].includes(filter.atExtreme.side)) invalid('filter.atExtreme.side', 'side 必须为 min/max');
      result.atExtreme = { ...filter.atExtreme, toleranceMm: number(filter.atExtreme.toleranceMm ?? 0.01, 'filter.atExtreme.toleranceMm') };
    }
  } else {
    if (filter.curveType !== undefined && !['line', 'circle'].includes(filter.curveType)) invalid('filter.curveType', '首批仅支持 line/circle 边类型筛选');
    for (const key of ['lengthRangeMm', 'radiusRangeMm']) if (filter[key] !== undefined) result[key] = range(filter[key], `filter.${key}`);
    if (filter.onFaceId !== undefined && (!Number.isInteger(filter.onFaceId) || filter.onFaceId < 0)) invalid('filter.onFaceId', '需要已解析的有效面索引');
  }
  return result;
}

function vectorTuple(value) {
  try { return value.toTuple(); } finally { dispose(value); }
}
function faceSummary(face, id) {
  const item = { kind: 'face', topologyId: id, faceId: id, geomType: face.geomType, surfaceType: face.geomType.toLowerCase(), areaMm2: cad.measureArea(face), center: vectorTuple(face.center) };
  const wires=face.wires;
  try { item.wireCount=wires.length; } finally { wires.forEach(dispose); }
  // IGES commonly stores exact planes as BSpline patches. Keep the encoding
  // visible while making geometric plane filters useful for those references.
  item.planar = planarFace(face, cad);
  if (item.planar) {
    const normal = vectorTuple(face.normalAt());
    const magnitude = Math.hypot(...normal);
    item.normal = normal.map(v => v / magnitude);
    item.normalConvention = 'world_topological_orientation';
    // A shell's topology direction is defined, but not necessarily an outward side.
    item.outwardGuaranteed = false;
  }
  return item;
}
function edgeSummary(edge, id, oc) {
  const item = { kind: 'edge', topologyId: id, edgeId: id, geomType: edge.geomType, curveType: edge.geomType.toLowerCase(), lengthMm: cad.measureLength(edge) };
  if (item.geomType === 'CIRCLE') {
    const adaptor = new oc.BRepAdaptor_Curve(edge.wrapped);
    let circle, center, axis, direction;
    try {
      circle = adaptor.Circle(); center = circle.Location(); axis = circle.Axis(); direction = axis.Direction();
      item.radiusMm = circle.Radius();
      item.center = [center.X(), center.Y(), center.Z()];
      item.axis = [direction.X(), direction.Y(), direction.Z()];
    } finally { [direction, axis, center, circle, adaptor].forEach(dispose); }
  }
  return item;
}
function inRange(value, constraint) {
  return !constraint || (value !== undefined && (constraint.min === undefined || value >= constraint.min) && (constraint.max === undefined || value <= constraint.max));
}
function matchesFace(item, filter, bounds) {
  if (filter.surfaceType === 'plane' && !item.planar) return false;
  if (filter.normal) {
    if (!item.normal) return false;
    let dot = item.normal.reduce((sum, v, i) => sum + v * filter.normal.direction[i], 0);
    if (!filter.normal.sameDirection) dot = Math.abs(dot);
    if (dot < Math.cos(filter.normal.angleToleranceDeg * Math.PI / 180) - 1e-12) return false;
  }
  if (filter.atExtreme) {
    if (!item.normal) return false;
    const index = ['X', 'Y', 'Z'].indexOf(filter.atExtreme.axis);
    // atExtreme means a supporting principal-axis plane, not a face whose
    // mesh or bounding rectangle happens to touch the body extremum.
    if (Math.abs(Math.abs(item.normal[index]) - 1) > 1e-12) return false;
    const extreme = bounds[filter.atExtreme.side === 'min' ? 0 : 1][index];
    if (Math.abs(item.center[index] - extreme) > filter.atExtreme.toleranceMm + 1e-9) return false;
  }
  return true;
}

/** Query B-Rep topology once; pagination and snapshot identity belong to main. */
export function queryShapeGeometry(shape, oc, kind, filter = {}) {
  const normalized = normalizeGeometryFilter(kind, filter);
  const topology=topologyDetails(shape,{connectivityOnly:kind==='face'});
  const parts = shape[kind === 'face' ? 'faces' : 'edges'];
  let box, faces, boundary;
  try {
    let bounds;
    if (normalized.atExtreme) { box = shape.boundingBox; bounds = box.bounds; }
    if (normalized.onFaceId !== undefined) {
      faces = shape.faces;
      if (normalized.onFaceId >= faces.length) invalid('filter.onFaceId', '面索引不属于当前实体');
      boundary = faces[normalized.onFaceId].edges;
    }
    const items = [];
    parts.forEach((part, id) => {
      if (boundary && !boundary.some(edge => edge.isSame(part))) return;
      const item = kind === 'face' ? faceSummary(part, id) : edgeSummary(part, id, oc);
      if(kind==='edge')Object.assign(item,topology[id]);
      else item.edgeIds=topology.filter(edge=>edge.adjacentFaceIds.includes(id)).map(edge=>edge.edgeId);
      if (kind === 'face') {
        if (!matchesFace(item, normalized, bounds)) return;
      } else {
        if (normalized.curveType && item.curveType !== normalized.curveType) return;
        if (!inRange(item.lengthMm, normalized.lengthRangeMm) || !inRange(item.radiusMm, normalized.radiusRangeMm)) return;
      }
      items.push(item);
    });
    return { kind, matchCount: items.length, items };
  } finally { [...parts, ...(faces || []), ...(boundary || []), box].forEach(dispose); }
}
