import { prepareReferenceProfile, checkShape } from './reference-profile-wires.js';

const dispose = value => { try { value?.delete?.(); } catch {} };
export function buildReferenceLoft(shapes, params = {}, cad) {
  if (!Array.isArray(shapes) || shapes.length < 2 || shapes.length > 12)
    throw new Error('参考放样需要 2–12 个有序截面');
  if (params?.ruled !== undefined && typeof params.ruled !== 'boolean') throw new Error('ruled 必须为布尔值');
  const profiles = []; let result, solids;
  try {
    for (const shape of shapes) profiles.push(prepareReferenceProfile(shape, cad));
    result = cad.loft(profiles.map(p => p.wire), { ruled: params?.ruled ?? false });
    checkShape(result, cad, '放样结果');
    solids = result.solids;
    if (solids.length !== 1 || !(cad.measureVolume(result) > 1e-10)) throw new Error('放样必须生成一个有效正体积实体');
    const complete = result; result = null; return complete;
  } finally { solids?.forEach(dispose); dispose(result); profiles.reverse().forEach(p => p.release()); }
}
