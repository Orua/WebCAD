import { prepareReferenceProfile, checkShape } from '../../reference-profile-wires.js';
import { buildReferenceLoft } from '../../reference-profile-loft.js';

// Inputs are borrowed history shapes. These builders never relocate or delete them.
const dispose = value => { try { value?.delete?.(); } catch {} };
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const minus = (a, b) => a.map((value, i) => value - b[i]);
const tuple = value => { try { return value.toTuple(); } finally { dispose(value); } };
const point3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const modes = ['newBody', 'join', 'cut', 'intersect'];
const fail = message => { throw new Error(message); };

function sourcesFor(sources, params, min, max = min) {
  const operation = params?.operation ?? 'newBody';
  if (!modes.includes(operation)) fail('加工模式须为 newBody、join、cut 或 intersect');
  const targetCount = operation === 'newBody' ? 0 : 1;
  if (!Array.isArray(sources) || sources.length < min + targetCount || sources.length > max + targetCount || sources.some(shape => !shape))
    fail(`需要 ${min === max ? min : `${min}–${max}`} 个有序来源引用${targetCount ? '，最后另附一个明确目标实体' : '；新建实体不能附加目标'}`);
  return { operation, profiles: targetCount ? sources.slice(0, -1) : sources.slice(), target: targetCount ? sources.at(-1) : null };
}

function validSolid(shape, cad, description) {
  checkShape(shape, cad, description);
  const solids = shape.solids;
  try {
    const volume = cad.measureVolume(shape);
    if (solids.length !== 1 || !Number.isFinite(volume) || volume <= 1e-9) fail(`${description}须为一个有效正体积实体`);
    return volume;
  } finally { solids.forEach(dispose); }
}

function applyMaterial(tool, target, operation, cad) {
  let result, targetCopy;
  try {
    const toolVolume = validSolid(tool, cad, '成型结果');
    if (operation === 'newBody') { const complete = tool; tool = null; return complete; }
    const before = validSolid(target, cad, '加工目标');
    // Work on an owned clone, including failure paths. Borrowed history shapes stay intact.
    targetCopy = target.clone();
    result = operation === 'join' ? targetCopy.fuse(tool) : operation === 'cut' ? targetCopy.cut(tool) : targetCopy.intersect(tool);
    const after = validSolid(result, cad, '加工结果');
    const epsilon = Math.max(1e-9, Math.max(before, toolVolume) * 1e-10);
    if (operation === 'join' && !(after > before + epsilon && after < before + toolVolume - epsilon))
      fail('加料必须与目标相交并实际增加材料');
    if (operation === 'cut' && !(after < before - epsilon)) fail('切除必须实际移除材料并保留一个有效实体');
    const complete = result; result = null; return complete;
  } finally { [result, targetCopy, tool].forEach(dispose); }
}

function run(code, title, sources, cad, builder) {
  const copies = [];
  try {
    if (!Array.isArray(sources) || sources.some(shape => typeof shape?.serialize !== 'function')) fail('来源必须是当前历史中的明确精确几何引用');
    // OCCT revolve/loft and even validation can alter shared p-curves or checked flags.
    // Shape.clone() shares TShapes; BRep serialization is the required deep isolation.
    for (const shape of sources) copies.push(cad.deserializeShape(shape.serialize()));
    return builder(copies);
  }
  catch (error) { throw Object.assign(new Error(`${title}：${error?.message || '内核拒绝该几何'}`), { code }); }
  finally { copies.forEach(dispose); }
}

export function buildProfileRevolve(sources, params = {}, cad) {
  return run('PROFILE_REVOLVE_INVALID', '轮廓旋转', sources, cad, isolated => {
    const { operation, profiles, target } = sourcesFor(isolated, params, 1);
    const { axisPoint, axisDirection, angleDeg } = params;
    if (!point3(axisPoint) || !point3(axisDirection) || Math.hypot(...axisDirection) <= 1e-12) fail('旋转轴须提供有限世界坐标 axisPoint 和非零 axisDirection');
    if (!Number.isFinite(angleDeg) || angleDeg <= 0 || angleDeg > 360) fail('angleDeg 须大于 0 且不超过 360°');
    const profile = prepareReferenceProfile(profiles[0], cad, { allowHoles: true });
    let tool;
    try {
      const normal = tuple(profile.face.normalAt()), center = tuple(profile.face.center);
      const direction = axisDirection.map(value => value / Math.hypot(...axisDirection));
      if (Math.abs(dot(direction, normal)) > 1e-8 || Math.abs(dot(minus(axisPoint, center), normal)) > 1e-6)
        fail('旋转轴必须位于来源轮廓的几何平面内');
      tool = cad.revolution(profile.face, axisPoint, direction, angleDeg);
      const ownedTool = tool; tool = null;
      return applyMaterial(ownedTool, target, operation, cad);
    } finally { dispose(tool); profile.release(); }
  });
}

function prepareOpenPath(shape, cad) {
  const resources = [], hold = item => { resources.push(item); return item; };
  try {
    if (!(shape instanceof cad.Wire || shape instanceof cad.Edge || shape instanceof cad.Compound)) fail('扫掠路径须为单一开放 Wire、Edge 或纯边 Compound');
    if (shape instanceof cad.Compound) {
      const faces = shape.faces, solids = shape.solids, wires = shape.wires;
      try { if (faces.length || solids.length || wires.length) fail('路径 Compound 只能含连续原始边，不能含面、实体或多个 Wire'); }
      finally { [...faces, ...solids, ...wires].forEach(dispose); }
    }
    const edges = shape instanceof cad.Edge ? [hold(shape.clone())] : shape.edges;
    if (!(shape instanceof cad.Edge)) resources.push(...edges);
    if (!edges.length || edges.length > 500) fail('扫掠路径须有 1–500 条精确边');
    const nodes = [], nodeAt = point => {
      let index = nodes.findIndex(node => Math.hypot(...minus(point, node.point)) <= 1e-7);
      if (index < 0) { index = nodes.length; nodes.push({ point, edges: [] }); }
      return index;
    };
    const links = edges.map((edge, index) => {
      const curve = edge.curve;
      try {
        const a = nodeAt(tuple(curve.startPoint)), b = nodeAt(tuple(curve.endPoint));
        if (a === b || curve.isClosed || edge.length <= 1e-8) fail('路径必须开放且不含闭合或退化边');
        nodes[a].edges.push(index); nodes[b].edges.push(index); return [a, b];
      } finally { dispose(curve); }
    });
    if (nodes.filter(node => node.edges.length === 1).length !== 2 || nodes.some(node => node.edges.length > 2)) fail('路径必须是一条连续开放链，不能有分叉、闭环或多个路径');
    const seen = new Set(), stack = [0];
    while (stack.length) {
      const index = stack.pop(); if (seen.has(index)) continue; seen.add(index);
      for (const node of links[index]) stack.push(...nodes[node].edges.filter(edge => !seen.has(edge)));
    }
    if (seen.size !== edges.length) fail('路径包含不连续的边或独立闭环');
    const wire = hold(shape instanceof cad.Wire ? shape.clone() : cad.assembleWire(edges));
    checkShape(wire, cad, '扫掠路径');
    const curve = wire.curve; let start, tangent;
    try { start = tuple(curve.startPoint); tangent = tuple(curve.tangentAt(0)); }
    finally { dispose(curve); }
    const length = Math.hypot(...tangent); if (!Number.isFinite(length) || length <= 1e-12) fail('路径起点切线无效');
    return { wire, start, tangent: tangent.map(value => value / length), release: () => resources.reverse().forEach(dispose) };
  } catch (error) { resources.reverse().forEach(dispose); throw error; }
}

export function buildProfileSweep(sources, params = {}, cad) {
  return run('PROFILE_SWEEP_INVALID', '轮廓扫掠', sources, cad, isolated => {
    const { operation, profiles, target } = sourcesFor(isolated, params, 2);
    const transitionMode = params.transitionMode ?? 'transformed';
    if (!['right', 'transformed', 'round'].includes(transitionMode)) fail('transitionMode 须为 right、transformed 或 round');
    if (params.frenet !== undefined && typeof params.frenet !== 'boolean') fail('frenet 须为布尔值');
    const profile = prepareReferenceProfile(profiles[0], cad);
    let path, tool;
    try {
      path = prepareOpenPath(profiles[1], cad);
      const normal = tuple(profile.face.normalAt()), center = tuple(profile.face.center);
      if (Math.abs(dot(normal, path.tangent)) < 1 - 1e-8 || Math.abs(dot(minus(path.start, center), normal)) > 1e-6)
        fail('保存截面必须位于路径起点平面，且截面法向须与路径起点切线平行；不会自动移动或旋转来源');
      tool = cad.genericSweep(profile.wire, path.wire, { frenet: params.frenet ?? false, transitionMode });
      const ownedTool = tool; tool = null;
      return applyMaterial(ownedTool, target, operation, cad);
    } finally { dispose(tool); path?.release(); profile.release(); }
  });
}

export function buildProfileLoft(sources, params = {}, cad) {
  return run('PROFILE_LOFT_INVALID', '轮廓放样', sources, cad, isolated => {
    const { operation, profiles, target } = sourcesFor(isolated, params, 2, 12);
    // referenceLoft already owns exact multi-section construction; extend its material semantics.
    const tool = buildReferenceLoft(profiles, { ruled: params.ruled ?? false }, cad);
    return applyMaterial(tool, target, operation, cad);
  });
}
