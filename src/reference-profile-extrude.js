import { prepareReferenceProfile, checkShape } from './reference-profile-wires.js';

const dispose = value => { try { value?.delete?.(); } catch {} };
export function buildReferenceExtrude(shape, params, cad) {
  const direction = params?.direction, distance = params?.distance;
  if (!Array.isArray(direction) || direction.length !== 3 || !direction.every(n => typeof n === 'number' && Number.isFinite(n)) || Math.hypot(...direction) <= 1e-12)
    throw new Error('拉伸方向必须是有限非零 XYZ 向量');
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance === 0)
    throw new Error('拉伸距离必须是非零有限数值');
  const profile = prepareReferenceProfile(shape, cad, { allowHoles: true });
  let vector, maker, result, solids, normal;
  try {
    normal = profile.face.normalAt();
    const n = normal.toTuple();
    if (Math.abs(n.reduce((sum, v, i) => sum + v * direction[i], 0)) / Math.hypot(...direction) <= 1e-8)
      throw new Error('拉伸方向不能与截面平面平行');
    const oc = cad.getOC();
    vector = new oc.gp_Vec(...direction.map(v => v * distance / Math.hypot(...direction)));
    maker = new oc.BRepPrimAPI_MakePrism(profile.face.wrapped, vector, false, true);
    result = cad.cast(maker.Shape());
    checkShape(result, cad, '拉伸结果');
    solids = result.solids;
    if (solids.length !== 1 || !(cad.measureVolume(result) > 1e-10)) throw new Error('拉伸必须生成一个有效正体积实体');
    const complete = result; result = null; return complete;
  } finally { solids?.forEach(dispose); [result, maker, vector, normal].forEach(dispose); profile.release(); }
}
