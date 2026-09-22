import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import { CadKernel } from '../src/cad-kernel.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
const kernel = new CadKernel(oc);
const f = (id, op, params = {}, refs = [], name = id) => ({ id, op, params, refs, name });
const doc = features => ({ version: 1, features, imports: {} });
const base = [f('a', 'box', { width: 10, depth: 10, height: 2 }), f('b', 'cylinder', { radius: 2, height: 4 })];

const first = await kernel.rebuild(doc(base));
const stable = first.bodies.find(b => b.id === 'a');
const appended = await kernel.rebuild(doc([...base, f('c', 'copy', { x: 2 }, ['a'])]));
assert.equal(appended.bodies.find(b => b.id === 'a'), stable, 'unchanged prefix mesh is reused');
assert.equal(appended.bodies.find(b => b.id === 'a').renderVersion, stable.renderVersion);
assert.equal(typeof appended.renderVersion, 'string');

const changed = await kernel.rebuild(doc([f('a', 'box', { width: 20, depth: 10, height: 2 }), base[1], f('c', 'copy', { x: 2 }, ['a'])]));
assert.equal(changed.bodies.find(b => b.id === 'a').bounds.max[0], 20, 'changed prefix recomputes dependent geometry');
assert.ok(Math.abs(changed.bodies.find(b => b.id === 'a').volume - 400) < 1e-6);
assert.equal(changed.bodies.find(b => b.id === 'c').bounds.max[0],22,'same-ID dependent copy must not use stale mesh');
assert.ok(Math.abs(changed.bodies.find(b => b.id === 'c').volume-400)<1e-6);
const beforeImportVersion = changed.bodies.find(b => b.id === 'b').renderVersion;
const importChanged = await kernel.rebuild({ ...doc([f('a', 'box', { width: 20, depth: 10, height: 2 }), base[1], f('c', 'copy', { x: 2 }, ['a'])]), imports: { changed: { format: 'step', data: 'AA==' } } });
assert.notEqual(importChanged.bodies.find(b => b.id === 'b').renderVersion, beforeImportVersion, 'imports invalidate prefix cache');

let calls = 0;
const operation = kernel.operation.bind(kernel);
kernel.operation = async (...args) => { calls++; return operation(...args); };
await kernel.rebuild({ version: 1, imports: { changed: { format: 'step', data: 'AA==' } }, features: [f('a', 'box', { width: 20, depth: 10, height: 2 }), base[1], f('c', 'copy', { x: 2 }, ['a']), f('d', 'copy', { x: 3 }, ['a'])] });
assert.equal(calls, 1, 'append-only rebuild runs only the new operation');
kernel.operation = operation;

const describe = kernel.describe.bind(kernel);
let failDescribe = true;
kernel.describe = (...args) => { if (failDescribe) { failDescribe = false; throw new Error('test describe failure'); } return describe(...args); };
await assert.rejects(() => kernel.rebuild(doc([f('a', 'box', { width: 99, depth: 10, height: 2 })])), /test describe failure/);
const recovered = await kernel.rebuild(doc([f('a', 'box', { width: 20, depth: 10, height: 2 }), base[1], f('c', 'copy', { x: 2 }, ['a'])]));
assert.equal(recovered.bodies.find(b => b.id === 'a').bounds.max[0], 20, 'describe failure preserves recoverable state');
kernel.describe = describe;

const renamed = await kernel.rebuild(doc([f('a', 'box', { width: 10, depth: 10, height: 2 }, [], 'renamed'), base[1]]));
assert.equal(renamed.bodies.find(b => b.id === 'a').name, 'renamed');
const rollback = await kernel.rebuild(doc(base));
assert.equal(rollback.bodies.find(b => b.id === 'a').volume, stable.volume);
await assert.rejects(() => kernel.rebuild(doc([f('a', 'box', { width: 10, depth: 10, height: 2 }), f('bad', 'unknown')])), /不支持的操作/);
assert.equal(kernel.activeShape('a'), kernel.shapes.get('a'));
const moved=await kernel.rebuild(doc([...base,f('move','transform',{x:7},['a'])]));
assert.equal(moved.bodies.find(b=>b.id==='move').bounds.min[0],7);
assert.equal(moved.bodies.find(b=>b.id==='b').renderVersion,rollback.bodies.find(b=>b.id==='b').renderVersion);
const exported=await kernel.export('step');assert.ok(exported.data.length>1000);
await kernel.rebuild(doc([...base,f('gone','remove',{},['a'])]));
calls=0;kernel.operation=async(...args)=>{calls++;return operation(...args);};
await kernel.rebuild(doc([...base,f('gone','remove',{},['a']),f('new','sphere',{radius:1})]));
assert.equal(calls,1,'cached remove steps must not replay');
kernel.dispose();
assert.equal(kernel.shapes.size, 0);
console.log('PASS incremental rebuild cache');
