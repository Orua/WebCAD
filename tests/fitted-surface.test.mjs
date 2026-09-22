import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import { buildFittedSurface } from '../src/fitted-surface.js';

const oc = await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
cad.setOC(oc);
const points = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => [i * 10, j * 10, Math.sin(i / 2) * Math.cos(j / 2)]));
const face = buildFittedSurface({ points, tolerance: 0.01 }, cad);
try {
  assert.equal(face.faces.length, 1);
  assert.equal(face.solids.length, 0);
  assert.ok(face.mesh({ tolerance: 0.05 }).vertices.length > 0);
  for (const row of points) for (const point of row) {
    const vertex = cad.makeVertex(point);
    try { assert.ok(cad.measureDistanceBetween(face, vertex) <= 0.010001); } finally { vertex.delete(); }
  }
  const step = await cad.exportSTEP([{ shape: face, name: 'fitted-surface' }]);
  const roundTrip = (await cad.importSTEP(step)).asShape3D();
  try { assert.equal(roundTrip.faces.length, 1); assert.equal(roundTrip.solids.length, 0); } finally { roundTrip.delete(); }
} finally { face.delete(); }
for (const bad of [[], [[ [0, 0, 0], [1, 0, 0], [2, 0, 0] ], [[0, 1, 0], [1, 1, 0]]], [[ [0, 0, 0], [1, 0, 0], [2, 0, 0] ], [[0, 1, 0], [1, 1, 0], [0, 0, 0] ]]]) {
  assert.throws(() => buildFittedSurface({ points: bad }, cad));
}
console.log('PASS fitted surface');
