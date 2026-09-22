import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import init from 'replicad-opencascadejs';
import { CadKernel } from '../src/cad-kernel.js';

const kernel = new CadKernel(await init({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) }));
const feature = (id, op, params = {}, refs = []) => ({ id, op, params, refs, name: id });
const run = features => kernel.rebuild({ version: 1, features, imports: {}, hidden: [] });
const logo = (id, body, faceId, mode = 'engrave', regions) => feature(id, 'logo', {
  faceId, mode, depth: 1, scale: 1, angle: 0, offsetX: 0, offsetY: 0,
  regions: regions || [{ outer: [[-5, -5], [5, -5], [5, 5], [-5, 5]], holes: [] }],
}, [body]);
const findPlane = (bodyId, predicate) => {
  const shape = kernel.shapes.get(bodyId), faces = shape.faces;
  try {
    for (let faceId = 0; faceId < faces.length; faceId++) {
      if (faces[faceId].geomType !== 'PLANE') continue;
      const info = kernel.faceInfo(bodyId, faceId);
      if (predicate(info)) return faceId;
    }
  } finally { faces.forEach(face => { try { face.delete(); } catch {} }); }
  throw new Error(`no matching plane on ${bodyId}`);
};
const findCurvedFace = bodyId => {
  const faces = kernel.shapes.get(bodyId).faces;
  try { const id = faces.findIndex(face => face.geomType !== 'PLANE'); assert.ok(id >= 0); return id; }
  finally { faces.forEach(face => { try { face.delete(); } catch {} }); }
};
const volume = (result, id) => result.bodies.find(body => body.id === id)?.volume;

test('CadKernel logo engraves selected top and side faces using their real local frames', async () => {
  const box = feature('box', 'box', { width: 100, depth: 40, height: 3 });
  const initial = await run([box]);
  const topId = findPlane('box', info => info.normal[2] > .999 && Math.abs(info.origin[2] - 3) < 1e-7);
  const sideId = findPlane('box', info => info.normal[0] > .999 && Math.abs(info.origin[0] - 100) < 1e-7);
  const top = await run([box, logo('topLogo', 'box', topId)]);
  assert.ok(Math.abs(volume(top, 'topLogo') - (12000 - 100)) < 1e-5);

  const side = await run([box, logo('sideLogo', 'box', sideId, 'engrave', [{ outer: [[-5, -1], [5, -1], [5, 1], [-5, 1]], holes: [] }])]);
  assert.ok(Math.abs(volume(side, 'sideLogo') - (12000 - 20)) < 1e-5);
  assert.equal(initial.stats.volume, 12000);
});

test('CadKernel rejects curved faces and logos that cross a planar face hole; failed rebuild preserves committed source BREP', async () => {
  const cylinder = feature('cylinder', 'cylinder', { radius: 10, height: 10 });
  await run([cylinder]);
  const curvedId = findCurvedFace('cylinder');
  const beforeCurvedFailure = (await kernel.export('brep')).data;
  await assert.rejects(run([cylinder, logo('badCurved', 'cylinder', curvedId)]), /平面/);
  assert.equal((await kernel.export('brep')).data, beforeCurvedFailure);

  const box = feature('box', 'box', { width: 100, depth: 40, height: 3 });
  await run([box]);
  const topId = findPlane('box', info => info.normal[2] > .999 && Math.abs(info.origin[2] - 3) < 1e-7);
  const drilled = feature('drilled', 'faceHole', { faceId: topId, point: [50, 20, 3], radius: 3, through: true }, ['box']);
  await run([box, drilled]);
  const perforatedTopId = findPlane('drilled', info => info.normal[2] > .999 && Math.abs(info.origin[2] - 3) < 1e-7);
  const beforeHoleFailure = (await kernel.export('brep')).data;
  const crossesHole = logo('badHoleLogo', 'drilled', perforatedTopId, 'engrave', [{ outer: [[-4, -2], [4, -2], [4, 2], [-4, 2]], holes: [] }]);
  await assert.rejects(run([box, drilled, crossesHole]), /boundary|hole/);
  assert.equal((await kernel.export('brep')).data, beforeHoleFailure);
});

test('CadKernel rejects a neighboring collinear reversal instead of treating it as a valid outline', async () => {
  const box = feature('box', 'box', { width: 100, depth: 40, height: 3 });
  await run([box]);
  const topId = findPlane('box', info => info.normal[2] > .999 && Math.abs(info.origin[2] - 3) < 1e-7);
  const folded = logo('folded', 'box', topId, 'engrave', [{ outer: [[-5, -5], [5, -5], [0, -5], [5, 5], [-5, 5]], holes: [] }]);
  await assert.rejects(run([box, folded]), /折返|doubles back/);
});

test.after(() => kernel.dispose());
