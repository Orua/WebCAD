// Reference geometry helpers. They return a displayable compound and never mutate the source shape.
const dispose = value => { try { value?.delete?.(); } catch {} };
function fail(message) { throw new Error(`参考曲线失败：${message}`); }

export function extractFaceBoundary(shape, faceId, cad) {
  if (!shape || !cad?.makeCompound) fail('缺少源形状或 CAD 适配器');
  if (!Number.isInteger(faceId) || faceId < 0) fail('faceId 必须是非负整数');
  const faces = shape.faces;
  if (faceId >= faces.length) { faces.forEach(dispose); fail('faceId 超出范围'); }
  const face = faces[faceId]; faces.forEach((item, index) => { if (index !== faceId) dispose(item); });
  let edges;
  try { edges = face.edges; if (!edges.length) fail('选定面没有边界'); const result = cad.makeCompound(edges); if (!result) fail('边界提取结果为空'); return result; }
  finally { edges?.forEach(dispose); dispose(face); }
}

export function extractPlaneSection(shape, { plane, offset = 0 } = {}, cad) {
  if (!shape || !cad?.makeCompound) fail('缺少源形状或 CAD 适配器');
  if (!['XY', 'XZ', 'YZ'].includes(plane)) fail('截面平面必须是 XY、XZ 或 YZ');
  if (!Number.isFinite(offset)) fail('截面 offset 必须是有限数值');
  let planeFace, drawing, sketch, builder, box;
  try {
    box = shape.boundingBox; const [[minX,minY,minZ],[maxX,maxY,maxZ]] = box.bounds;
    const span = Math.max(maxX-minX,maxY-minY,maxZ-minZ,1) * 4 + Math.abs(offset) + 10;
    const origin = plane === 'XY' ? [(minX+maxX)/2,(minY+maxY)/2,offset] : plane === 'XZ' ? [(minX+maxX)/2,offset,(minZ+maxZ)/2] : [offset,(minY+maxY)/2,(minZ+maxZ)/2];
    const xDir = plane === 'XY' ? [1,0,0] : plane === 'XZ' ? [1,0,0] : [0,1,0];
    const normal = plane === 'XY' ? [0,0,1] : plane === 'XZ' ? [0,1,0] : [1,0,0];
    drawing = cad.drawRectangle(span, span); sketch = drawing.sketchOnPlane(new cad.Plane(origin,xDir,normal)); planeFace = sketch.face();
    const Section = cad.getOC?.().BRepAlgoAPI_Section; if (!Section) fail('当前 OCCT 不提供精确 Section API');
    builder = new Section(shape.wrapped, planeFace.wrapped); builder.Build();
    if (!builder.IsDone?.() || builder.Shape?.().IsNull?.()) fail('截面未穿过实体');
    const result = cad.cast(builder.Shape()), resultEdges = result?.edges || [];
    if (!resultEdges.length) { resultEdges.forEach(dispose); dispose(result); fail('截面没有交线'); }
    resultEdges.forEach(dispose);
    return result;
  } finally {
    dispose(builder); dispose(planeFace); dispose(sketch); dispose(drawing); dispose(box);
  }
}
