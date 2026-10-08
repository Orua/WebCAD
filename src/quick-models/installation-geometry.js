// Owned exact geometry helpers for the installation templates.
export const dispose = value => { try { value?.delete?.(); } catch {} };
export function numericParams(params, definition, label) {
  for (const key of Object.keys(params || {}))
    if (key !== 'kind' && !Object.hasOwn(definition.defaults, key)) throw new Error(`${label}：未知参数 ${key}`);
  const p = { ...definition.defaults, ...params };
  for (const field of definition.fields) if (field.type === 'number') {
    if (typeof p[field.key] !== 'number' || !Number.isFinite(p[field.key])) throw new Error(`${label}：${field.key} 必须为有限数值`);
  }
  return p;
}
export function roundedDistance(x, y, w, h, r) {
  const qx = Math.abs(x) - w / 2 + r, qy = Math.abs(y) - h / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
export function outline(cad, w, h, r) {
  return w === h && r === w / 2 ? cad.drawCircle(w / 2) : cad.drawRoundedRectangle(w, h, r);
}
export function prism(cad, wire, vector) {
  let face, direction, maker;
  try {
    face = cad.makeFace(wire); direction = new (cad.getOC().gp_Vec)(...vector);
    maker = new (cad.getOC().BRepPrimAPI_MakePrism)(face.wrapped, direction, false, true);
    return cad.cast(maker.Shape());
  } finally { dispose(maker); dispose(direction); dispose(face); }
}
