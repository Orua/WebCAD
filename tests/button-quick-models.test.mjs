import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as cad from 'replicad';
import initOpenCascade from 'replicad-opencascadejs';
import { buildQuickModel } from '../src/quick-models/catalog.js';
import { topologyDetails } from '../src/modeling/rounding/topology.js';

const oc = await initOpenCascade({
  wasmBinary: readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)),
});
cad.setOC(oc);

function verifyModel(params, inspect) {
  const shape = buildQuickModel(params, cad, { oc });
  const check = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
  try {
    assert.ok(check.IsValid(), JSON.stringify(params));
    inspect(shape);
  } finally {
    check.delete();
    shape.delete();
  }
}

for (const [kind, count] of [['snapButton', 4], ['sewButton', 5]]) {
  test(kind + ' preserves its variants, nominal diameter and fixed cut feet', () => {
    for (const variant of ['domed', 'flat', 'cut']) {
      verifyModel({ kind, variant }, shape => {
        const solids = shape.solids;
        try {
          assert.equal(solids.length, count);
        } finally {
          solids.forEach(solid => solid.delete());
        }
      });
    }
    for (const part of ['maleFoot', 'femaleFoot']) {
      for (const [variant, diameter] of [['domed', 9], ['cut', 6]]) {
        verifyModel({ kind, part, variant, size: 'custom', diameter: 9 }, shape => {
          const box = shape.boundingBox;
          try {
            const [lower, upper] = box.bounds;
            assert.ok(Math.abs(upper[0] - lower[0] - diameter) < 0.002);
          } finally {
            box.delete();
          }
        });
      }
    }
  });

  test(kind + ' uses tangent-continuous curved joins on the stud', () => {
    verifyModel({ kind, part: 'stud' }, shape => {
      const faces = shape.faces;
      const edges = shape.edges;
      try {
        const joins = topologyDetails(shape, { strictNativeNormals: true }).filter(row =>
          edges[row.edgeId].geomType === 'CIRCLE' &&
          row.adjacentFaceIds.length === 2 &&
          row.adjacentFaceIds.every(id => ['REVOLUTION_SURFACE', 'CYLINDRE', 'TORUS'].includes(faces[id].geomType)));
        assert.ok(joins.length >= 6, 'Expected rotary curves between consecutive surface spans');
        for (const join of joins) {
          assert.ok(Number.isFinite(join.normalAngleDeg) && join.normalAngleDeg < 0.1,
            'Non-tangent stud join ' + JSON.stringify(join));
        }
      } finally {
        faces.forEach(face => face.delete());
        edges.forEach(edge => edge.delete());
      }
    });
  });
}

test('magnetic button keeps four independently generated default parts', () => {
  verifyModel({ kind: 'magneticButton' }, shape => {
    const solids = shape.solids;
    try {
      assert.equal(solids.length, 4);
    } finally {
      solids.forEach(solid => solid.delete());
    }
  });
});
