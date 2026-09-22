import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildCurveSweep } from '../src/curve-sweep.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
cad.setOC(oc);

test('真实 OCCT：90度圆弧扫掠体积与理论值一致', async () => {
  const q = Math.SQRT1_2;
  const shape = buildCurveSweep({ pathType: 'arc', points: [[1, 0, 0], [q, q, 0], [0, 1, 0]], radius: 0.2 }, cad);
  try {
    const volume = cad.measureVolume(shape);
    assert.ok(Math.abs(volume - Math.PI * 0.2 ** 2 * (Math.PI / 2)) < 1e-3, `volume=${volume}`);
    assert.equal(shape.solids.length, 1);
    await cad.exportSTEP([{ shape }]);
  } finally { shape.delete?.(); }
});

test('真实 OCCT：空间圆弧和样条均生成单一实体并可导出', async () => {
  const arc = buildCurveSweep({ pathType: 'arc', points: [[0, 0, 0], [1, 1, 1], [2, 0, 1]], radius: 0.1 }, cad);
  const spline = buildCurveSweep({ pathType: 'spline', points: [[0, 0, 0], [1, 0, 0.5], [2, 1, 1], [3, 1, 0]], radius: 0.1, tolerance: 0.01 }, cad);
  try {
    assert.equal(arc.solids.length, 1); assert.equal(spline.solids.length, 1);
    const step = await cad.exportSTEP([{ shape: spline }]);
    assert.ok(step);
    const roundTrip = await cad.importSTEP(step);
    try { assert.ok(cad.measureVolume(roundTrip) > 0); }
    finally { roundTrip.delete?.(); }
    assert.ok(cad.measureVolume(spline) > 0);
  } finally { arc.delete?.(); spline.delete?.(); }
});

test('真实 OCCT：退化点、过大截面和非法参数明确失败', () => {
  assert.throws(() => buildCurveSweep({ pathType: 'arc', points: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], radius: 0.1 }, cad), /不能共线/);
  assert.throws(() => buildCurveSweep({ pathType: 'arc', points: [[0, 0, 0], [1, 0, 0], [2, 0, 0.01]], radius: 100 }, cad), /扫掠失败|有效实体/);
  assert.throws(() => buildCurveSweep({ pathType: 'spline', points: [[0, 0, 0], [0, 0, 0], [1, 0, 0]], radius: 1 }, cad), /重复点/);
});
