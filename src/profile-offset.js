const dispose = value => { try { value?.delete?.(); } catch {} };
const fail = message => { throw Object.assign(new Error(message), { code: 'PROFILE_OFFSET_INVALID' }); };

export function buildProfileOffset(source, params, cad) {
  const distance = params?.distanceMm;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0 || distance > 1e5) fail('等距偏移量必须是有效的正毫米数');
  if (!['inside', 'outside'].includes(params.side)) fail('请选择向内或向外偏移');
  if (!['intersection', 'round'].includes(params.join)) fail('请选择交线或圆角连接');
  if (!['wire', 'face', 'band'].includes(params.output)) fail('请选择线框、面或等宽边框输出');
  const faces = source.faces, owned = [], hold = value => { owned.push(value); return value; };
  let result;
  try {
    if (faces.length !== 1) fail('首版只支持一个无孔平面区域');
    const face = faces[0], faceWires = face.wires;
    try {
      if (face.geomType !== 'PLANE' || faceWires.length !== 1) fail('首版只支持无孔闭合平面轮廓');
    } finally { faceWires.forEach(dispose); }
    const originalArea = cad.measureArea(face);
    if (!(originalArea > 1e-10)) fail('来源区域面积无效');
    const oc = cad.getOC(), join = params.join === 'intersection' ? oc.GeomAbs_JoinType.GeomAbs_Intersection : oc.GeomAbs_JoinType.GeomAbs_Arc;
    const candidates = [];
    for (const sign of [1, -1]) {
      let maker, raw, wires, offsetFace;
      try {
        maker = hold(new oc.BRepOffsetAPI_MakeOffset(face.wrapped, join, false));
        maker.Perform(sign * distance);
        if (!maker.IsDone()) continue;
        raw = hold(cad.cast(maker.Shape()));
        wires = raw.wires;
        if (wires.length !== 1) continue;
        offsetFace = hold(cad.makeFace(wires[0]));
        const area = cad.measureArea(offsetFace);
        if (area > 1e-10 && Number.isFinite(area)) candidates.push({ wire: wires[0].clone(), face: offsetFace.clone(), area });
      } catch { /* A candidate can collapse; the other sign may be valid. */ }
      finally { wires?.forEach(dispose); }
    }
    const valid = candidates.filter(item => params.side === 'inside' ? item.area < originalArea - 1e-7 : item.area > originalArea + 1e-7);
    if (valid.length !== 1) fail('轮廓偏移崩塌或结果有歧义；原轮廓保持不变');
    const chosen = valid[0];
    try {
      if (params.output === 'wire') result = chosen.wire.clone();
      else if (params.output === 'face') result = chosen.face.clone();
      else {
        if (params.side === 'inside') result = cad.addHolesInFace(face, [chosen.wire]);
        else {
          const originalWire = face.wires;
          try { result = cad.addHolesInFace(chosen.face, [originalWire[0]]); }
          finally { originalWire.forEach(dispose); }
        }
        const area = cad.measureArea(result), expected = Math.abs(originalArea - chosen.area);
        if (!(area > 1e-10) || Math.abs(area - expected) > Math.max(1e-5, expected * 1e-6)) fail('无法生成完整等宽边框，请检查偏移后是否自交');
      }
      return result;
    } finally { candidates.forEach(item => { dispose(item.wire); dispose(item.face); }); }
  } catch (error) { dispose(result); throw error; }
  finally { faces.forEach(dispose); owned.reverse().forEach(dispose); }
}
