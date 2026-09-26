import {inspectProfileModel} from './profile-inspection.js';
import {expandProfilePrimitives} from './profile-primitives.js';
const fail = (message, path = 'params') => { throw Object.assign(new Error(message), { code: 'PROFILE_INVALID', path }); };
const point = p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const endpoint = (entity, reversed, end) => {
  if (entity.type === 'circle') return null;
  return reversed ? (end ? entity.startMm : entity.endMm) : (end ? entity.endMm : entity.startMm);
};

export function validateProfile(params) {
  try{params=expandProfilePrimitives(params);}catch(error){fail(error.message,'params.entities');}
  if (!params || params.profileVersion !== 1) fail('轮廓格式版本须为 1', 'params.profileVersion');
  if (!['wire', 'face'].includes(params.output)) fail('轮廓输出须为 wire 或 face', 'params.output');
  const entities = params.entities;
  if (!Array.isArray(entities) || entities.length < 1 || entities.length > 500) fail('轮廓须有 1–500 个实体', 'params.entities');
  const byId = new Map();
  entities.forEach((e, i) => {
    const path = `params.entities[${i}]`;
    if (!e || typeof e.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(e.id) || byId.has(e.id)) fail('轮廓实体 ID 缺失、重复或无效', `${path}.id`);
    if (!['line', 'arc3', 'circle'].includes(e.type)) fail('首版只支持直线、三点圆弧和圆', `${path}.type`);
    if (e.type === 'circle') {
      if (!point(e.centerMm) || typeof e.diameterMm !== 'number' || !Number.isFinite(e.diameterMm) || e.diameterMm <= 0 || e.diameterMm > 2e6) fail('圆心或直径无效', path);
    } else {
      if (!point(e.startMm) || !point(e.endMm) || distance(e.startMm, e.endMm) <= 1e-9) fail('线或圆弧端点无效', path);
      if (e.type === 'arc3') {
        if (!point(e.midMm)) fail('圆弧中点无效', `${path}.midMm`);
        const [a, m, b] = [e.startMm, e.midMm, e.endMm];
        if (Math.abs((m[0]-a[0])*(b[1]-a[1])-(m[1]-a[1])*(b[0]-a[0])) <= 1e-9) fail('三点圆弧不能共线', path);
      }
    }
    byId.set(e.id, e);
  });
  const loops = params.loops ?? [];
  if (!Array.isArray(loops) || loops.length > 50) fail('轮廓环最多 50 个', 'params.loops');
  const byLoop = new Map();
  loops.forEach((loop, i) => {
    const path = `params.loops[${i}]`;
    if (!loop || typeof loop.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(loop.id) || byLoop.has(loop.id)) fail('环 ID 缺失、重复或无效', `${path}.id`);
    if (!Array.isArray(loop.edges) || !loop.edges.length || loop.edges.length > 500) fail('环必须包含有序实体引用', `${path}.edges`);
    const members = loop.edges.map((entry, j) => {
      const entity = byId.get(entry?.entityId);
      if (!entity || typeof entry.reversed !== 'boolean') fail('环引用了不存在的实体或方向无效', `${path}.edges[${j}]`);
      return { entity, reversed: entry.reversed };
    });
    if (members.some(({entity}) => entity.type === 'circle') && (members.length !== 1 || members[0].entity.type !== 'circle')) fail('圆只能单独构成闭环', path);
    if (members.length > 1) members.forEach((member, j) => {
      const next = members[(j + 1) % members.length];
      if (distance(endpoint(member.entity, member.reversed, true), endpoint(next.entity, next.reversed, false)) > 1e-6) fail('环的相邻端点未闭合', `${path}.edges[${j}]`);
    });
    byLoop.set(loop.id, loop);
  });
  const chains = params.chains ?? [];
  if (!Array.isArray(chains) || chains.length > 50) fail('开放路径最多 50 条', 'params.chains');
  chains.forEach((chain, i) => {
    const path = `params.chains[${i}]`;
    if (!chain || typeof chain.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(chain.id) || !Array.isArray(chain.edges) || !chain.edges.length || chain.edges.length > 500) fail('开放路径须有 ID 与有序实体', path);
    const members = chain.edges.map((entry, j) => {
      const entity = byId.get(entry?.entityId);
      if (!entity || typeof entry.reversed !== 'boolean') fail('开放路径引用无效', `${path}.edges[${j}]`);
      return {entity,reversed:entry.reversed};
    });
    if (members.length > 1) for (let j = 0; j < members.length - 1; j++) {
      if (members[j].entity.type === 'circle' || members[j+1].entity.type === 'circle' || distance(endpoint(members[j].entity,members[j].reversed,true),endpoint(members[j+1].entity,members[j+1].reversed,false)) > 1e-6) fail('开放路径的相邻端点不连续', `${path}.edges[${j}]`);
    }
  });
  const regions = params.regions ?? [];
  if (!Array.isArray(regions) || regions.length > 16) fail('轮廓最多 16 个输出区域', 'params.regions');
  if (params.output === 'face' && regions.length < 1) fail('生成面须明确至少一个区域', 'params.regions');
  const usedLoops = new Set();
  regions.forEach((region, i) => {
    if (!region || typeof region.id !== 'string' || !byLoop.has(region.outerLoopId) || !Array.isArray(region.holeLoopIds) || region.holeLoopIds.some(id => !byLoop.has(id) || id === region.outerLoopId) || new Set(region.holeLoopIds).size !== region.holeLoopIds.length) fail('区域外环或孔环引用无效', `params.regions[${i}]`);
    for (const loopId of [region.outerLoopId, ...region.holeLoopIds]) {
      if (usedLoops.has(loopId)) fail('同一轮廓环不能重复参与多个区域', `params.regions[${i}]`);
      usedLoops.add(loopId);
    }
  });
  if (params.output === 'face' && chains.length) fail('开放路径不能直接生成面', 'params.chains');
  if (params.output === 'wire' && entities.length > 1 && !loops.length && !chains.length) fail('多段开放轮廓须显式给出有序路径', 'params.chains');
  if(params.output==='face'){
    const issues=inspectProfileModel(params).issues,invalid=issues.find(item=>item.kind==='holeOutside')||issues.find(item=>['selfIntersection','duplicateLine','duplicateCurve','invalidCurve'].includes(item.kind));
    if(invalid)fail(`${invalid.message}：${invalid.entityIds.join(', ')}`,invalid.kind==='holeOutside'?`params.regions[${Number(invalid.issueId.split(':')[1])}].holeLoopIds`:'params.entities');
  }
  return { entities, byId, loops, chains, byLoop, regions, output: params.output };
}

const dispose = value => { try { value?.delete?.(); } catch {} };
function commonArea(left,right,cad){let builder,result;try{builder=new (cad.getOC().BRepAlgoAPI_Common)(left.wrapped,right.wrapped);builder.Build();if(!builder.IsDone())fail('区域包含关系的精确求交失败','params.regions');result=cad.cast(builder.Shape());return result.isNull?0:cad.measureArea(result);}finally{dispose(result);dispose(builder);}}
export function buildSketchProfile(params, cad) {
  const profile = validateProfile(params), owned = [], hold = value => { owned.push(value); return value; };
  const edge = (entity, reversed = false) => {
    if (entity.type === 'circle') {
      const drawing = hold(cad.drawCircle(entity.diameterMm / 2).translate(...entity.centerMm));
      const sketch = hold(drawing.sketchOnPlane('XY'));
      return hold(sketch.wire);
    }
    const start = reversed ? entity.endMm : entity.startMm, end = reversed ? entity.startMm : entity.endMm;
    return hold(entity.type === 'line' ? cad.makeLine([...start, 0], [...end, 0]) : cad.makeThreePointArc([...start, 0], [...entity.midMm, 0], [...end, 0]));
  };
  const wire = path => {
    const edges = path.edges.map(item => edge(profile.byId.get(item.entityId), item.reversed));
    return edges.length === 1 && profile.byId.get(path.edges[0].entityId).type === 'circle' ? edges[0] : hold(cad.assembleWire(edges));
  };
  let result;
  try {
    if (profile.output === 'wire') {
      const paths=[...profile.loops,...profile.chains];
      if (paths.length === 1) result = wire(paths[0]).clone();
      else if (paths.length > 1) result = cad.makeCompound(paths.map(wire));
      else result = edge(profile.entities[0]).clone();
    } else {
      const faces = profile.regions.map((region,regionIndex) => {
        const outer = wire(profile.byLoop.get(region.outerLoopId));
        const holes = region.holeLoopIds.map(id => wire(profile.byLoop.get(id)));
        const base = hold(cad.makeFace(outer));
        const holeFaces=holes.map(hole=>hold(cad.makeFace(hole)));
        for(let i=0;i<holeFaces.length;i++){if(Math.abs(commonArea(base,holeFaces[i],cad)-cad.measureArea(holeFaces[i]))>1e-7)fail(`孔环 ${region.holeLoopIds[i]} 不完全位于外环内部`,`params.regions[${regionIndex}].holeLoopIds`);for(let j=0;j<i;j++)if(commonArea(holeFaces[i],holeFaces[j],cad)>1e-8)fail('孔环相互重叠',`params.regions[${regionIndex}].holeLoopIds`);}
        return hold(holes.length ? cad.addHolesInFace(base, holes) : base.clone());
      });
      for(let i=0;i<faces.length;i++)for(let j=0;j<i;j++)if(commonArea(faces[i],faces[j],cad)>1e-8)fail('输出区域相互重叠，须明确外环与孔环归属','params.regions');
      result = faces.length === 1 ? faces[0].clone() : cad.makeCompound(faces);
      if (!(cad.measureArea(result) > 1e-10)) fail('闭合区域面积须大于零', 'params.regions');
    }
    return result;
  } catch (error) { dispose(result); throw error; }
  finally { owned.reverse().forEach(dispose); }
}
