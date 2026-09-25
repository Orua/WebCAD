// Four through holes in one exact plate; this module owns its geometry.
export function build(params, cad, _options, { definitions }) {
  const p = { ...definitions.fourHolePlate.defaults, ...params };
  const number = key => {
    const value = Number(p[key]);
    if (!Number.isFinite(value)) throw new Error(`${key} 必须为有限数值`);
    return value;
  };
  const width = number('width'), depth = number('depth'), thickness = number('thickness');
  const cornerRadius = number('cornerRadius'), holeDiameter = number('holeDiameter');
  const insetX = number('insetX'), insetY = number('insetY');
  if (!(width > 0 && depth > 0 && thickness > 0 && holeDiameter > 0)) throw new Error('板宽、板深、厚度和孔径必须大于 0');
  if (!(cornerRadius >= 0 && cornerRadius <= Math.min(width, depth) / 2)) throw new Error('外角 R 超出板轮廓');
  if (!(insetX > holeDiameter / 2 && insetY > holeDiameter / 2 && insetX < width / 2 && insetY < depth / 2)) throw new Error('孔心边距须大于孔半径、小于对应板宽的一半');
  if (!(width - 2 * insetX > holeDiameter && depth - 2 * insetY > holeDiameter)) throw new Error('相邻孔不能相交或相切');

  const centers = [
    [-width / 2 + insetX, -depth / 2 + insetY],
    [width / 2 - insetX, -depth / 2 + insetY],
    [-width / 2 + insetX, depth / 2 - insetY],
    [width / 2 - insetX, depth / 2 - insetY],
  ];
  const resources = [], hold = shape => { resources.push(shape); return shape; };
  const dispose = shape => { try { shape?.delete(); } catch {} };
  let result;
  try {
    const outline = hold(cad.drawRoundedRectangle(width, depth, cornerRadius));
    const sketch = hold(outline.sketchOnPlane('XY'));
    for (const [x, y] of centers) {
      const center = hold(cad.makeVertex([x, y, 0]));
      if (!(cad.measureDistanceBetween(sketch.wire, center) > holeDiameter / 2 + 1e-6)) throw new Error('孔与板边界相交或相切');
    }
    result = sketch.extrude(thickness);
    for (const [x, y] of centers) {
      const tool = hold(cad.makeCylinder(holeDiameter / 2, thickness + 2, [x, y, -1]));
      const old = result; result = old.cut(tool); dispose(old);
    }
    const complete = result; result = null; return complete;
  } finally { dispose(result); resources.reverse().forEach(dispose); }
}
