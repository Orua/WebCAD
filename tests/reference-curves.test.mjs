import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { extractFaceBoundary, extractPlaneSection } from '../src/reference-curves.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
cad.setOC(oc);
test('真实 OCCT 提取平面截面与面边界，源形状保留', () => {
  const source = cad.makeBox([0, 0, 0], [10, 10, 10]);
  try {
    const section = extractPlaneSection(source, { plane: 'XY', offset: 5 }, cad);
    const boundary = extractFaceBoundary(source, 0, cad);
    try { assert.ok(section.edges.length > 0); assert.ok(boundary.edges.length > 0); assert.equal(source.solids.length, 1); }
    finally { section.delete?.(); boundary.delete?.(); }
  } finally { source.delete?.(); }
});

test('精确 Section 对曲面交线只返回唯一圆边并保留长度', () => {
  const source = cad.makeSphere(5);
  try {
    const section = extractPlaneSection(source, { plane: 'XY', offset: 0 }, cad);
    try { assert.equal(section.edges.length, 1); assert.ok(Math.abs(section.edges[0].length - 2 * Math.PI * 5) < 1e-3); }
    finally { section.delete?.(); }
  } finally { source.delete?.(); }
});

test('平移到远离原点的实体仍能提取截面', () => {
  const source = cad.makeBox([0, 0, 0], [10, 10, 10]).translate(1000, 2000, 3000);
  try { const section = extractPlaneSection(source, { plane: 'XY', offset: 3005 }, cad); try { assert.equal(section.edges.length, 4); } finally { section.delete?.(); } }
  finally { source.delete?.(); }
});

test('严格校验无效平面、面索引与空截面', () => {
  const source = cad.makeBox([0, 0, 0], [10, 10, 10]);
  try {
    assert.throws(() => extractPlaneSection(source, { plane: 'BAD', offset: 0 }, cad), /平面/);
    assert.throws(() => extractFaceBoundary(source, 99, cad), /范围/);
    assert.throws(() => extractPlaneSection(source, { plane: 'XY', offset: 20 }, cad), /截面/);
  } finally { source.delete?.(); }
});
