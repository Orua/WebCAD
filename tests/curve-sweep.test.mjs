import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildCurveSweep } from '../src/curve-sweep.js';
import { getOperation } from '../src/operation-registry.js';
import { readDocs } from '../src/page-api-docs.js';

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

test('真实 OCCT：连续直线与圆弧形成开放圆线实体', async () => {
  const segments=[
    {type:'line',points:[[0,0,0],[1,0,0]]},
    {type:'arc',points:[[1,0,0],[2,1,0],[1,2,0]]},
    {type:'line',points:[[1,2,0],[0,2,0]]},
  ];
  const shape=buildCurveSweep({pathType:'segments',segments,radius:0.2},cad);
  try {
    const solids=shape.solids;
    try { assert.equal(solids.length,1); }
    finally { solids.forEach(s=>s.delete?.()); }
    const checker=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false);
    try { assert.equal(checker.IsValid(),true); }
    finally { checker.delete(); }
    assert.ok(Math.abs(cad.measureVolume(shape)-Math.PI*0.2**2*(2+Math.PI))<1e-3);
    assert.ok(await cad.exportSTEP([{shape}]));
  } finally { shape.delete?.(); }
});

test('连续线弧路径拒绝开链、闭环和退化圆弧', () => {
  const line=(a,b)=>({type:'line',points:[a,b]});
  assert.throws(()=>buildCurveSweep({pathType:'segments',radius:.2,segments:[line([0,0,0],[1,0,0]),line([1.01,0,0],[2,0,0])]},cad),/不连续/);
  assert.throws(()=>buildCurveSweep({pathType:'segments',radius:.2,segments:[line([0,0,0],[1,0,0]),line([1,0,0],[0,0,0])]},cad),/必须开放/);
  assert.throws(()=>buildCurveSweep({pathType:'segments',radius:.2,segments:[line([0,0,0],[1,0,0]),{type:'arc',points:[[1,0,0],[2,0,0],[3,0,0]]}]},cad),/不能共线/);
});

test('分段扫掠公开工具卡和脚本使用方法可发现', () => {
  const tool=getOperation('curveSweep');
  assert.ok(tool.inputSchema.properties.pathType.enum.includes('segments'));
  assert.ok(tool.inputSchema.properties.segments);
  const docs=readDocs({docId:'recipes.segmented-curve-sweep'});
  assert.match(docs.text,/api\.run/);
  assert.match(docs.text,/feature\.edit/);
});

test('真实 OCCT：闭合分段倒角方线生成可测单实体', async () => {
  const p=(x,y)=>[x,y,0];
  const segments=[
    {type:'line',points:[p(10,-8),p(10,8)]},
    {type:'arc',points:[p(10,8),p(7.0710678118654755,15.071067811865476),p(0,18)]},
    {type:'arc',points:[p(0,18),p(-7.0710678118654755,15.071067811865476),p(-10,8)]},
    {type:'line',points:[p(-10,8),p(-10,-8)]},
    {type:'line',points:[p(-10,-8),p(10,-8)]},
  ];
  const shape=buildCurveSweep({pathType:'segments',segments,closed:true,section:'chamferedSquare',sectionSize:2,sectionChamfer:.5},cad);
  try {
    const solids=shape.solids;
    try { assert.equal(solids.length,1); }
    finally { solids.forEach(s=>s.delete?.()); }
    assert.ok(cad.measureVolume(shape)>0);
    assert.ok(await cad.exportSTEP([{shape}]));
  } finally { shape.delete?.(); }
  assert.throws(()=>buildCurveSweep({pathType:'segments',segments,closed:true,section:'chamferedSquare',sectionSize:2,sectionChamfer:1},cad),/倒角方线/);
  const tool=getOperation('curveSweep');
  assert.ok(tool.inputSchema.properties.closed);
  assert.ok(tool.inputSchema.properties.section.enum.includes('chamferedSquare'));
  assert.match(readDocs({docId:'recipes.closed-chamfered-path'}).text,/api\.run/);
});
