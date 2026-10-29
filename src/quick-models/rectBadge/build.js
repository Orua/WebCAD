import definition from './definition.js';

const dispose = value => { try { value?.delete?.(); } catch {} };
const fail = message => { throw new Error(`牌仔：${message}`); };

export function build(params, cad) {
  if (Object.keys(params || {}).some(key => key !== 'kind' && !Object.hasOwn(definition.defaults, key))) fail('存在未知参数');
  const p = {...definition.defaults, ...params};
  for (const field of definition.fields) {
    const value = p[field.key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) fail(`${field.label} 须在 ${field.min}–${field.max} mm 范围内`);
  }
  const {length, width, cornerRadius, thickness, frontChamfer, backChamfer} = p;
  if (cornerRadius > Math.min(length, width) / 2) fail('轮廓圆角 R 不能大于长、宽中较小值的一半');
  if (frontChamfer + backChamfer >= thickness) fail('正反面倒角之和须小于厚度，请减小倒角或增加厚度');
  if (Math.max(frontChamfer, backChamfer) >= Math.min(length, width) / 2) fail('每面倒角须小于短边的一半');
  const held = [], hold = value => (held.push(value), value);
  try {
    const outline = hold(cad.drawRoundedRectangle(length, width, cornerRadius));
    const sketch = hold(outline.sketchOnPlane('XY'));
    let result = hold(sketch.extrude(thickness));
    // Select by geometric plane on the current solid, never by a topology index.
    if (frontChamfer > 0) result = hold(result.chamfer(frontChamfer, edges => edges.inPlane('XY', thickness)));
    if (backChamfer > 0) result = hold(result.chamfer(backChamfer, edges => edges.inPlane('XY', 0)));
    const solids = result.solids;
    try { if (solids.length !== 1) fail('结果不是单一实体'); } finally { solids.forEach(dispose); }
    const check = hold(new (cad.getOC().BRepCheck_Analyzer)(result.wrapped, true, false, false));
    if (!check.IsValid() || cad.measureVolume(result) <= 0) fail('实体校验失败');
    held.splice(held.indexOf(result), 1);
    return result;
  } catch (error) {
    if (String(error?.message).startsWith('牌仔：')) throw error;
    fail(`建模失败，请检查圆角及倒角尺寸。${error?.message || error}`);
  } finally { held.reverse().forEach(dispose); }
}
