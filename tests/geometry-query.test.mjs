import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import { CadKernel } from '../src/cad-kernel.js';
import { normalizeGeometryFilter } from '../src/geometry-query.js';
import { queryShapeGeometry } from '../src/geometry-query.js';
import * as cad from 'replicad';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
const kernel = new CadKernel(oc);
const feature = (id, op, params, refs = []) => ({ id, op, params, refs });
const doc = features => ({ version: 1, features, imports: {} });
const plate = feature('plate', 'box', { width: 50, depth: 30, height: 3 });
const topFilter = { surfaceType: 'plane', normal: { direction: [0, 0, 1], sameDirection: true }, atExtreme: { axis: 'Z', side: 'max', toleranceMm: 0.01 } };

try {
  await kernel.rebuild(doc([plate]));
  const top = await kernel.queryGeometry('plate', 'face', topFilter);
  assert.equal(top.matchCount, 1);
  assert.deepEqual(top.items[0].normal, [0, 0, 1]);
  assert.equal(top.items[0].center[2], 3);
  assert.equal(top.items[0].normalConvention, 'world_topological_orientation');
  const bottom = await kernel.queryGeometry('plate', 'face', { normal: { direction: [0, 0, -1] }, atExtreme: { axis: 'Z', side: 'min' } });
  assert.equal(bottom.matchCount, 1, 'bottom face respects reversed topology orientation');
  const parallel = await kernel.queryGeometry('plate', 'face', { normal: { direction: [0, 0, 1], sameDirection: false } });
  assert.equal(parallel.matchCount, 2);
  const boundary = await kernel.queryGeometry('plate', 'edge', { onFaceId: top.items[0].faceId, curveType: 'line' });
  assert.equal(boundary.matchCount, 4);
  assert.deepEqual(boundary.items.map(item => item.lengthMm).sort((a, b) => a - b), [30, 30, 50, 50]);
  assert.equal((await kernel.queryGeometry('plate', 'edge', { curveType: 'line', lengthRangeMm: { min: 49, max: 51 } })).matchCount, 4);
  assert.equal((await kernel.queryGeometry('plate', 'edge', { radiusRangeMm: { max: 10 } })).matchCount, 0, 'line radius is absent, never zero');
  assert.equal((await kernel.queryGeometry('plate', 'face', {})).matchCount, 6, 'full candidate count before pagination');
  assert.equal((await kernel.queryGeometry('plate', 'edge', {})).geometryFingerprint, top.geometryFingerprint, 'fingerprint does not depend on query');

  const spline=cad.draw([0,0]).cubicBezierCurveTo([10,0],[1,9],[8,-2]).done().sketchOnPlane('XY');
  try{
    const curve=queryShapeGeometry(spline.wire,oc,'edge',{}).items[0],paramMid=[4.625,2.625,0];
    assert.equal(curve.curveType,'bezier_curve');
    assert.ok(Math.hypot(...curve.midpoint.map((v,i)=>v-paramMid[i]))>.3,'nonuniform curve midpoint must use travelled length');
    const bezier=t=>{const u=1-t;return [3*u*u*t+24*u*t*t+10*t*t*t,27*u*u*t-6*u*t*t];};
    const steps=20000,dist=[],points=[];let total=0,previous=bezier(0);
    for(let i=1;i<=steps;i++){const p=bezier(i/steps);total+=Math.hypot(p[0]-previous[0],p[1]-previous[1]);dist.push(total);points.push(p);previous=p;}
    const index=dist.findIndex(d=>d>=total/2),fraction=((total/2)-(dist[index-1]||0))/(dist[index]-(dist[index-1]||0));
    const expected=points[index].map((v,i)=>(points[index-1]?.[i]??0)*(1-fraction)+v*fraction);
    assert.ok(Math.hypot(curve.midpoint[0]-expected[0],curve.midpoint[1]-expected[1])<1e-4,'half length agrees with independent fine polyline integration');
  }finally{spline.delete();}

  for (const [kind, filter] of [
    ['face', { surfaceType: 'invented' }], ['face', { curveType: 'line' }], ['face', { loopRole: 'outer' }],
    ['face', { normal: { direction: [0, 0, 0] } }], ['face', { normal: { direction: [0, 0, Infinity] } }],
    ['face', { normal: { direction: [0, 0, 1], sameDirection: 'true' } }],
    ['face', { atExtreme: { axis: 'Z', side: 'max', typo: 1 } }],
    ['edge', { lengthRangeMm: { min: 3, max: 2 } }], ['edge', { radiusRangeMm: {} }],
    ['edge', { radiusRangeMm: { min: NaN } }], ['edge', { onFaceToken: 'unresolved' }],
  ]) assert.throws(() => normalizeGeometryFilter(kind, filter), error => error.code === 'PARAM_SCHEMA_INVALID');
  await assert.rejects(kernel.queryGeometry('plate', 'edge', { onFaceId: 999 }), error => error.path === 'filter.onFaceId');

  const positions = [[5, 5, 0], [45, 5, 0], [5, 25, 0], [45, 25, 0]];
  const drilled = feature('holes', 'multiHole', { radius: 2, depth: 3, axis: 'Z', direction: 1, points: positions }, ['plate']);
  const built = await kernel.rebuild(doc([plate, drilled]));
  assert.ok(Math.abs(built.stats.volume - (4500 - 4 * Math.PI * 4 * 3)) < 0.01);
  const circles = await kernel.queryGeometry('holes', 'edge', { curveType: 'circle', radiusRangeMm: { min: 1.999, max: 2.001 } });
  assert.equal(circles.matchCount, 8, 'four circular holes have upper and lower circular boundaries');
  for (const item of circles.items) {
    assert.ok(Math.abs(item.radiusMm - 2) < 1e-9);
    assert.ok(positions.some(([x, y]) => Math.abs(x - item.center[0]) < 1e-9 && Math.abs(y - item.center[1]) < 1e-9));
    assert.ok(Math.abs(item.lengthMm - 4 * Math.PI) < 1e-8);
  }
  const drilledTop = await kernel.queryGeometry('holes', 'face', topFilter);
  const allTopEdges = await kernel.queryGeometry('holes', 'edge', { onFaceId: drilledTop.items[0].faceId });
  assert.equal(allTopEdges.matchCount, 8, 'onFace includes inner hole boundaries; no false outer-loop claim');
  const holeTopEdges = await kernel.queryGeometry('holes', 'edge', { onFaceId: drilledTop.items[0].faceId, curveType: 'circle' });
  assert.equal(holeTopEdges.matchCount, 4);
  assert.ok(holeTopEdges.items.every(item => Math.abs(item.center[2] - 3) < 1e-9));
  assert.notEqual(circles.geometryFingerprint, top.geometryFingerprint);
  const beforeFailure = circles.geometryFingerprint;
  await assert.rejects(kernel.rebuild(doc([plate, drilled, feature('bad', 'unknown', {}, ['holes'])])));
  assert.equal((await kernel.queryGeometry('holes', 'edge', { curveType: 'circle' })).geometryFingerprint, beforeFailure, 'failed rebuild keeps precise committed snapshot');

  await kernel.rebuild(doc([plate, feature('rotated', 'transform', { rx: 30 }, ['plate'])]));
  assert.equal((await kernel.queryGeometry('rotated', 'face', { atExtreme: { axis: 'Z', side: 'max' } })).matchCount, 0, 'rotated plane bounding extremum is not a Z supporting plane');
  console.log('PASS geometry-query: exact planes/oriented normals/extrema, lengths/radii/centers, all face boundaries, strict filters, full counts, snapshot stability');
} finally { kernel.dispose(); }
