import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const build=await fs.promises.readFile(new URL('../src/quick-models/keyRing/build.js',import.meta.url),'utf8');
const definition=await fs.promises.readFile(new URL('../src/quick-models/keyRing/definition.js',import.meta.url),'utf8');
assert.match(build,/drawRoundedRectangle\(width,depth,cornerRadius\)/,'strip section is a rounded rectangle, not an ellipse');
assert.match(build,/BRepOffsetAPI_ThruSections/,'the local layer transition uses explicit section lofts');
assert.match(build,/turns>1&&turns<2/,'the general model is restricted to two layers');
assert.equal(QUICK_MODELS.keyRing.defaults.turns,1.9);
assert.equal(QUICK_MODELS.keyRing.defaults.sectionCornerRadiusMm,.5);

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'ring',op:'quickModel',refs:[],params:{kind:'keyRing',...params},name:'ring'}],imports:{},hidden:[]});
const near=(actual,expected,tolerance,label)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, got ${actual}`);
try{
  const defaults=await run(QUICK_MODELS.keyRing.defaults);
  assert.equal(defaults.stats.solids,1);
  assert.ok(defaults.stats.volume>0);
  const bounds=defaults.bodies[0].bounds;
  near(bounds.max[0]-bounds.min[0],33,.03,'outer diameter');
  near(bounds.max[1]-bounds.min[1],33,.03,'outer diameter Y');
  near(bounds.max[2]-bounds.min[2],3,.03,'overall side depth');
  const planar=(await kernel.queryGeometry('ring','face',{surfaceType:'plane'})).items;
  const zLevels=planar.map(face=>face.center[2]).filter(Number.isFinite);
  assert.ok(zLevels.some(z=>Math.abs(z+1.5)<.02),'lower layer reaches the total-depth envelope');
  assert.ok(zLevels.some(z=>Math.abs(z-1.5)<.02),'upper layer reaches the total-depth envelope');
  assert.ok(zLevels.some(z=>Math.abs(z+.005)<.01)&&zLevels.some(z=>Math.abs(z-.005)<.01),'two flat layers meet across the specified 0.01 mm gap');
  assert.ok(planar.some(face=>face.areaMm2>200),'wide flat layer faces are present');
  const innerArc=await kernel.queryGeometry('ring','edge',{curveType:'circle',radiusRangeMm:{min:12.49,max:12.51}});
  assert.ok(innerArc.matchCount>0,'inner diameter is controlled by the 12.5 mm centerline offset');
  const variant=await run({...QUICK_MODELS.keyRing.defaults,innerDiameterMm:30,outerDiameterMm:40,totalDepthMm:4,turns:1.5,layerGapMm:.02});
  assert.equal(variant.stats.solids,1);
  near(variant.bodies[0].bounds.max[0]-variant.bodies[0].bounds.min[0],40,.03,'variant outer diameter');
  near(variant.bodies[0].bounds.max[2]-variant.bodies[0].bounds.min[2],4,.03,'variant overall side depth');
  await assert.rejects(run({...QUICK_MODELS.keyRing.defaults,turns:2.1}),/匙圈/);
  await assert.rejects(run({...QUICK_MODELS.keyRing.defaults,turns:1.99,transitionAngleDeg:36}),/匙圈/);
  await assert.rejects(run({...QUICK_MODELS.keyRing.defaults,layerGapMm:-.1}),/匙圈/);
}finally{kernel.dispose();}
console.log('PASS keyRing: source-sized rounded double layer, local transition, physical envelope, variant and invalid bounds');

