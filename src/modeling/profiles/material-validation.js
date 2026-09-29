import { checkShape } from '../../reference-profile-wires.js';

const dispose = value => { try { value?.delete?.(); } catch {} };

export function validMaterialSolid(shape, cad, description) {
  checkShape(shape, cad, description);
  const solids = shape.solids;
  try {
    const volume = cad.measureVolume(shape);
    if (solids.length !== 1 || !Number.isFinite(volume) || volume <= 1e-9)
      throw new Error(`${description}须为一个有效正体积封闭实体`);
    return volume;
  } finally { solids.forEach(dispose); }
}

// All volumes and this absolute tolerance are in mm³. Shared-face fusion has
// zero overlap volume; validity and the single-solid check distinguish it from
// disconnected, edge-only or point-only contact.
export function validateMaterialChange(operation, before, toolVolume, after) {
  const epsilon = Math.max(1e-9, Math.max(before, toolVolume, after) * 1e-10);
  if (operation === 'join' && !(after > before + epsilon && after <= before + toolVolume + epsilon))
    throw new Error('加料须共享面或体积交叠，融合为一个有效实体并实际增加材料');
  if (operation === 'cut' && !(after < before - epsilon))
    throw new Error('切除须实际移除材料且留下有效目标');
  if (operation === 'intersect' && !(after > epsilon && after <= Math.min(before, toolVolume) + epsilon))
    throw new Error('轮廓与目标没有有效交集');
}
