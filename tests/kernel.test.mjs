import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import { CadKernel } from '../src/cad-kernel.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
const kernel = new CadKernel(oc);
const feature = (id, op, params = {}, refs = []) => ({ id, op, params, refs, name: id });
const doc = (features, imports = {}) => ({ version: 1, features, imports });
const run = features => kernel.rebuild(doc(features));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(1e-5, Math.abs(expected) * 1e-7), `${actual} ≠ ${expected}`);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const box = feature('box', 'box', { width: 40, depth: 20, height: 3 });
const hole = [box, feature('cyl', 'cylinder', { radius: 2.5, height: 6 }), feature('tool', 'transform', { x: 10, y: 10, z: -1 }, ['cyl']), feature('part', 'cut', {}, ['box', 'tool'])];
await test('analytic primitive volumes and topology', async () => {
  for (const [op, params, volume] of [
    ['box', box.params, 2400], ['cylinder', { radius: 5, height: 20 }, Math.PI * 500],
    ['sphere', { radius: 5 }, Math.PI * 500 / 3], ['cone', { radius1: 10, radius2: 0, height: 15 }, Math.PI * 500],
    ['cone', { radius1: 0, radius2: 10, height: 15 }, Math.PI * 500], ['cone', { radius1: 10, radius2: 5, height: 15 }, Math.PI * 875],
    ['torus', { majorRadius: 10, minorRadius: 2 }, 80 * Math.PI ** 2],
  ]) {
    const { bodies } = await run([feature('p', op, params)]), b = bodies[0]; near(b.volume, volume);
    assert.equal(b.solidCount, 1); assert.ok(b.indices.length > 0);
    assert.ok(b.faceGroups.every(g => Number.isInteger(g.faceId) && g.start + g.count <= b.indices.length));
    assert.ok(b.edges.every(e => Number.isInteger(e.edgeId) && e.positions.length % 6 === 0 && e.positions.length > 0));
    for (const edge of b.edges) for (let i = 0; i < edge.positions.length; i++) assert.ok(edge.positions[i] >= b.bounds.min[i % 3] - 1e-3 && edge.positions[i] <= b.bounds.max[i % 3] + 1e-3);
  }
});
await test('all profile planes, signed extrusion and revolution', async () => {
  for (const plane of ['XY', 'XZ', 'YZ']) for (const height of [3, -3]) {
    for (const [profile, params, area] of [['rectangle', { width: 10, depth: 5 }, 50], ['circle', { radius: 2 }, Math.PI * 4], ['polygon', { points: [[0, 0], [10, 0], [0, 5]] }, 25]]) {
      near((await run([feature('p', 'extrude', { profile, ...params, plane, height })])).stats.volume, area * 3);
    }
    near((await run([feature('r', 'revolve', { profile: 'rectangle', width: 4, depth: 5, offset: 10, plane, angle: 180 })])).stats.volume, Math.PI * 200);
  }
});
await test('through hole has analytic subtraction volume', async () => near((await run(hole)).stats.volume, 2400 - Math.PI * 2.5 ** 2 * 3));
await test('union and intersection', async () => {
  const f = [feature('a', 'box', { width: 10, depth: 10, height: 10 }), feature('b', 'copy', { x: 5 }, ['a'])];
  near((await run([...f, feature('u', 'union', {}, ['a', 'b'])])).stats.volume, 1500);
  near((await run([...f, feature('u', 'intersect', {}, ['a', 'b'])])).stats.volume, 500);
});
await test('copy transform mirror remove and consumed body state', async () => {
  const f = [box, feature('copy', 'copy', { x: 50, scale: 2, rz: 90 }, ['box'])];
  let result = await run(f); assert.equal(result.bodies.length, 2); near(result.bodies[1].volume, 19200);
  result = await run([...f, feature('mirror', 'mirror', { plane: 'YZ', keepOriginal: false }, ['copy'])]);
  assert.deepEqual(result.bodies.map(b => b.id), ['box', 'mirror']);
  result = await run([...f, feature('delete', 'remove', {}, ['copy'])]); assert.deepEqual(result.bodies.map(b => b.id), ['box']);
});
await test('selected edge fillet and chamfer', async () => {
  const fillet = (await run([box, feature('f', 'fillet', { radius: 0.5, edgeIds: [0] }, ['box'])])).bodies[0];
  assert.ok(fillet.volume < 2400 && fillet.volume > 2399); assert.ok(fillet.faceGroups.length > 6);
  near((await run([box, feature('c', 'chamfer', { distance: 0.5, edgeIds: [0] }, ['box'])])).stats.volume, 2399.625);
});
await test('inward shell wall thickness and volume', async () => near((await run([box, feature('s', 'shell', { thickness: 1, faceIds: [5] }, ['box'])])).stats.volume, 2400 - 38 * 18 * 2));
await test('failed transaction retains last valid export', async () => {
  await run([box]); const before = (await kernel.export('brep')).data;
  for (const bad of [feature('bad', 'box', { width: -1, height: 1, depth: 1 }), feature('bad', 'unsupported'), feature('bad', 'fillet', { radius: 1, edgeIds: [999] }, ['box'])]) {
    await assert.rejects(run([box, bad]), e => e.featureId === 'bad'); assert.equal((await kernel.export('brep')).data, before);
  }
  await assert.rejects(run([feature('a', 'box', {width:1,depth:1,height:1}), feature('b', 'copy', {x:10}, ['a']), feature('empty', 'intersect', {}, ['a','b'])]));
  assert.equal((await kernel.export('brep')).data, before);
});
await test('STEP and BREP round trips preserve volume and editable BRep', async () => {
  for (const format of ['step', 'brep']) {
    await run(hole); const exported = await kernel.export(format), expected = 2400 - Math.PI * 2.5 ** 2 * 3;
    const imports = { file: { format, data: Buffer.from(exported.data).toString('base64') } };
    const imported = feature('imported', 'import', { key: 'file' });
    near((await kernel.rebuild(doc([imported], imports))).stats.volume, expected);
    near((await kernel.rebuild(doc([imported, feature('move', 'transform', { x: 3, scale: 2 }, ['imported'])], imports))).stats.volume, expected * 8);
  }
});
await test('STL binary export contains declared triangles', async () => {
  await run(hole); const result = await kernel.export('stl'); const bytes = new DataView(result.data.buffer);
  const triangles = bytes.getUint32(80, true); assert.ok(triangles > 0); assert.equal(result.data.length, 84 + triangles * 50);
});
await test('multi body export and selection', async () => {
  await run([box, feature('copy', 'copy', { x: 50 }, ['box'])]);
  const result = await kernel.export('step', ['copy']);
  const imported = await kernel.rebuild(doc([feature('i', 'import', {key:'file'})], {file:{format:'step',data:Buffer.from(result.data).toString('base64')}}));
  near(imported.stats.volume, 2400); near(imported.bodies[0].bounds.min[0], 50);
});
await test('hole analytic volume, axis/direction, and missed-hole rollback', async () => {
  near((await run([box, feature('h', 'hole', { radius: 2.5, depth: 6, x: 10, y: 10, z: 4, axis: 'Z', direction: -1 }, ['box'])])).stats.volume, 2400 - Math.PI * 2.5 ** 2 * 3);
  const block = feature('b', 'box', {width:20,depth:20,height:20});
  for (const axis of ['X', 'Y', 'Z']) {
    const p = {radius:2,depth:30,x:10,y:10,z:10,axis}; p[axis.toLowerCase()] = -1;
    near((await run([block, feature('h','hole',p,['b'])])).stats.volume, 8000 - Math.PI * 4 * 20);
  }
  const before = (await kernel.export('brep')).data;
  await assert.rejects(run([box, feature('h', 'hole', {radius:1,depth:5,x:100,y:100,z:100}, ['box'])]), /未切入/);
  assert.equal((await kernel.export('brep')).data, before);
});
await test('linear array solid count, analytic volume, bounds and STEP roundtrip', async () => {
  const result = await run([box, feature('array','linearPattern',{count:4,dx:50,dy:0,dz:0},['box'])]);
  assert.equal(result.bodies.length,1); assert.equal(result.stats.solids,4); near(result.stats.volume,9600);
  near(result.bodies[0].bounds.min[0],0); near(result.bodies[0].bounds.max[0],190);
  const exported = await kernel.export('step');
  const imported = await kernel.rebuild(doc([feature('i','import',{key:'f'})], {f:{format:'step',data:Buffer.from(exported.data).toString('base64')}}));
  assert.equal(imported.stats.solids,4); near(imported.stats.volume,9600);
  await assert.rejects(run([box,feature('a','linearPattern',{count:4,dx:0,dy:0,dz:0},['box'])]), /不能全部为 0/);
});
await test('circular array full and partial angles, count and bounds', async () => {
  const f = [feature('b','box',{width:2,depth:2,height:2}),feature('p','transform',{x:10},['b'])];
  let result = await run([...f,feature('array','circularPattern',{count:4,angle:360,axis:'Z'},['p'])]);
  assert.equal(result.stats.solids,4); near(result.stats.volume,32);
  for(const k of [0,1]) {near(result.bodies[0].bounds.min[k],-12);near(result.bodies[0].bounds.max[k],12);}
  result = await run([...f,feature('array','circularPattern',{count:2,angle:180,axis:'Z'},['p'])]);
  assert.equal(result.stats.solids,2); near(result.stats.volume,16); near(result.bodies[0].bounds.min[0],-12); near(result.bodies[0].bounds.max[0],12);
  await assert.rejects(run([...f,feature('array','circularPattern',{count:101,angle:360},['p'])]), /2–100/);
});
kernel.dispose(); console.log(`${passed} kernel checks passed`);
