import {buildReferenceExtrude} from './reference-profile-extrude.js';

const dispose = value => { try { value?.delete?.(); } catch {} };
const fail = message => { throw Object.assign(new Error(message), { code: 'PROFILE_EXTRUDE_INVALID' }); };
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

export function buildProfileExtrude(shapes, params, cad, savedPlaneNormal=null) {
  if (!Array.isArray(shapes) || shapes.length !== (params?.operation === 'newBody' ? 1 : 2)) fail('轮廓加工引用须为来源轮廓，及可选的明确目标实体');
  if (!['newBody', 'join', 'cut', 'intersect'].includes(params.operation)) fail('不支持的轮廓加工模式');
  if (!['distance', 'throughSelected', 'toPlane'].includes(params.extent) || params.extent === 'throughSelected' && params.operation === 'newBody') fail('不支持的拉伸终止方式；贯穿只适用于已选目标');
  if (![1, -1].includes(params.direction)) fail('请选择沿轮廓法向正向或反向');
  if (params.extent === 'distance' && (typeof params.distanceMm !== 'number' || !Number.isFinite(params.distanceMm) || params.distanceMm <= 0 || params.distanceMm > 1e6)) fail('拉伸距离须为有效正毫米数');
  const [profile, target] = shapes, faces = profile.faces;
  let normal, center, bounds, tool, result;
  const profileTools = [];
  try {
    if (!faces.length || faces.length > 16 || faces.some(face => face.geomType !== 'PLANE')) fail('请选择 1–16 个共面的闭合轮廓区域');
    if (faces.length > 1 && params.operation === 'newBody') fail('多个分离区域请分别新建实体；可在一次切除中使用多个区域');
    normal = faces[0].normalAt(); center = faces[0].center;
    const nativeNormal=normal.toTuple();
    if(savedPlaneNormal&&Math.abs(dot(nativeNormal,savedPlaneNormal))<1-1e-8)fail('来源面与保存的轮廓任务平面不一致');
    const vector = (savedPlaneNormal||nativeNormal).map(v => v * params.direction), origin = center.toTuple();
    for (let i = 1; i < faces.length; i++) {
      const otherNormal = faces[i].normalAt(), otherCenter = faces[i].center;
      try {
        const alignment = Math.abs(dot(otherNormal.toTuple(), normal.toTuple()));
        const planeOffset = Math.abs(dot(otherCenter.toTuple().map((v,j) => v-origin[j]), normal.toTuple()));
        if (alignment < 1-1e-8 || planeOffset > 1e-6) fail('多个轮廓区域必须处于同一几何平面');
      } finally { dispose(otherNormal); dispose(otherCenter); }
    }
    let distance = params.distanceMm;
    if (params.extent === 'toPlane') {
      const at=params.planePoint, planeNormal=params.planeNormal,allowance=params.allowanceMm??0;
      if(!Array.isArray(at)||at.length!==3||at.some(value=>!Number.isFinite(value))||!Array.isArray(planeNormal)||planeNormal.length!==3||planeNormal.some(value=>!Number.isFinite(value))||!Number.isFinite(allowance)||Math.abs(allowance)>1e4)fail('到平面须提供固定世界坐标的平面点、法向和有限余量');
      const denominator=dot(vector,planeNormal),norm=Math.hypot(...planeNormal);
      if(norm<1e-8||Math.abs(denominator)/norm<1e-6)fail('拉伸方向与目标平面平行或近似平行，无法到达');
      if(Math.abs(denominator)/norm<1-1e-8)fail('首版到平面只支持与来源轮廓平面平行的固定平面；斜切终止面暂不支持');
      distance=dot(at.map((value,i)=>value-origin[i]),planeNormal)/denominator+allowance;
      if(distance<=1e-7||distance>1e6)fail('目标平面与余量使拉伸方向无法到达有效正距离');
    }
    if (params.extent === 'throughSelected') {
      bounds = target.boundingBox;
      const [min, max] = bounds.bounds, projections = [];
      for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) projections.push(dot([x-origin[0],y-origin[1],z-origin[2]],vector));
      const near = Math.min(...projections), far = Math.max(...projections);
      if (near < -1e-5 || far <= 1e-8) fail('轮廓平面须位于目标实体外侧或边界，方向须指向目标；不能从实体内部只切一半却称贯穿');
      distance = far + Math.max(0.05, (far-near) * 0.01);
    }
    for (const face of faces) profileTools.push(buildReferenceExtrude(face,{direction:vector,distance},cad));
    tool = profileTools.length === 1 ? profileTools.pop() : cad.makeCompound(profileTools);
    if (params.operation === 'newBody') { result = tool; tool = null; return result; }
    const targetSolids = target.solids;
    try { if (targetSolids.length !== 1) fail('加工目标必须是单一精确实体'); }
    finally { targetSolids.forEach(dispose); }
    const before = Math.abs(cad.measureVolume(target)), toolVolume = Math.abs(cad.measureVolume(tool));
    result = params.operation === 'join' ? target.fuse(tool) : params.operation === 'cut' ? target.cut(tool) : target.intersect(tool);
    const after = Math.abs(cad.measureVolume(result));
    if (params.operation === 'join' && !(after > before + 1e-7 && after < before + toolVolume - 1e-7)) fail('加料须与目标相交并实际增加材料');
    if (params.operation === 'cut' && !(after > 1e-9 && after < before - 1e-7)) fail('切除须实际移除材料且留下有效目标');
    if (params.operation === 'intersect' && !(after > 1e-9)) fail('轮廓与目标没有有效交集');
    const solids = result.solids;
    try { if (solids.length !== 1) fail('加工结果不是单一实体；请调整位置或分开处理'); }
    finally { solids.forEach(dispose); }
    return result;
  } catch (error) { dispose(result); throw error; }
  finally { faces.forEach(dispose); profileTools.forEach(dispose); [normal, center, bounds, tool].forEach(dispose); }
}
