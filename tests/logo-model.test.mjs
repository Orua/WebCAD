import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildLogoOnPlane } from '../src/logo-model.js';

cad.setOC(await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) }));
const area = shape => Math.abs(cad.measureVolume(shape));
const dispose = value => { try { value?.delete?.(); } catch {} };
const plate = () => cad.makeBox([0, 0, 0], [100, 40, 3]);
const base = overrides => ({
  regions: [{ outer: [[10, 10], [22, 10], [22, 22], [10, 22]], holes: [[[14, 14], [18, 14], [18, 18], [14, 18]]] },
    { outer: [[30, 10], [34, 10], [34, 18], [30, 18]], holes: [] }],
  mode: 'engrave', depth: 1, scale: 1, angle: 0, x: 0, y: 0, z: 3,
  faceX: [1, 0, 0], faceNormal: [0, 0, 1], ...overrides,
});
const sourceBytes = shape => shape.serialize();

test('engraves a holed region and independent island with exact volume; source BREP is unchanged and STEP roundtrips', async () => {
  const source = plate(), before = sourceBytes(source), result = buildLogoOnPlane(source, base(), cad);
  try {
    assert.ok(Math.abs(area(result) - (12000 - 160)) < 1e-5);
    assert.equal(sourceBytes(source), before);
    const step = cad.exportSTEP([{ shape: result, name: 'logo' }]);
    const imported = (await cad.importSTEP(step)).asShape3D();
    try { assert.ok(Math.abs(area(imported) - area(result)) < 1e-5); assert.equal(imported.solids.length, 1); }
    finally { dispose(imported); }
  } finally { dispose(result); dispose(source); }
});

test('emboss connects as one solid; local mirror, scale, angle and arbitrary plane are honored', () => {
  const source = plate(), baseline = plate(), before = sourceBytes(baseline), simple = { regions: [{ outer: [[2, 0], [4, 0], [4, 4], [2, 4]], holes: [] }], mode: 'emboss', depth: 2, scale: 2, angle: 90, mirrorX: true, x: 10, y: 10, z: 3, faceX: [1, 0, 0], faceNormal: [0, 0, 1] };
  dispose(baseline);
  const exactTransformedBounds = cad.makeBox([2, 2, 3], [10, 6, 5]);
  const result = buildLogoOnPlane(source, simple, cad, exactTransformedBounds);
  try {
    assert.ok(Math.abs(area(result) - (12000 + 64)) < 1e-5);
    const solids = result.solids; try { assert.equal(solids.length, 1); } finally { solids.forEach(dispose); }
    assert.equal(sourceBytes(source), before);
  } finally { dispose(result); dispose(exactTransformedBounds); dispose(source); }

  const side = cad.makeBox([0, 0, 0], [3, 100, 40]);
  const sideLogo = buildLogoOnPlane(side, { regions: [{ outer: [[20, 10], [28, 10], [28, 14], [20, 14]], holes: [] }], mode: 'engrave', depth: 1, scale: 1, angle: 0, x: 3, y: 0, z: 0, faceX: [0, 1, 0], faceNormal: [1, 0, 0] }, cad);
  try { assert.ok(Math.abs(area(sideLogo) - (12000 - 32)) < 1e-5); }
  finally { dispose(sideLogo); dispose(side); }
});

test('support prism rejects a logo that crosses the selected face boundary', () => {
  const source = plate(), support = cad.makeBox([0, 0, 3], [100, 40, 4]);
  try {
    assert.throws(() => buildLogoOnPlane(source, { ...base({ mode: 'emboss' }), regions: [{ outer: [[95, 10], [105, 10], [105, 20], [95, 20]], holes: [] }] }, cad, support), /boundary|hole/);
  } finally { dispose(support); dispose(source); }
});

test('rejects self intersections, outside holes, overlapping regions, nonorthogonal frames and detached emboss', () => {
  const source = plate(), before = sourceBytes(source);
  const attempt = params => () => buildLogoOnPlane(source, params, cad);
  try {
    assert.throws(attempt({ ...base(), regions: [{ outer: [[0, 0], [10, 10], [0, 10], [10, 0]], holes: [] }] }), /zero area|intersects|touches/);
    assert.throws(attempt({ ...base(), regions: [{ outer: [[0, 0], [10, 0], [5, 0], [10, 10], [0, 10]], holes: [] }] }), /doubles back/);
    assert.throws(attempt({ ...base(), regions: [{ outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[9, 9], [12, 9], [12, 12], [9, 12]]] }] }), /outside|touches|crosses/);
    assert.throws(attempt({ ...base(), regions: [
      { outer: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [] },
      { outer: [[9, 2], [12, 2], [12, 5], [9, 5]], holes: [] },
    ] }), /touch|overlap|intersects/);
    assert.throws(attempt({ ...base({ faceX: [0, 0, 1] }) }), /orthogonal/);
    assert.throws(attempt({ ...base({ mode: 'emboss', z: 10 }) }), /solid count|connect/);
    assert.throws(attempt({ ...base(), regions: [{ outer: [[0, 0], [1, 0], [1, 1]], holes: Array.from({ length: 4000 }, () => [[0, 0], [1, 0], [1, 1]]) }] }), /12000/);
    assert.equal(sourceBytes(source), before);
  } finally { dispose(source); }
});
