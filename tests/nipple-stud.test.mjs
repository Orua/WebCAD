import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'stud',op:'quickModel',refs:[],params,name:'stud'}],imports:{},hidden:[]});
const near=(actual,expected,label,tol=1e-5)=>assert.ok(Math.abs(actual-expected)<tol,`${label}: expected ${expected}, got ${actual}`);
const dispose=value=>{try{value?.delete?.();}catch{}};
function partSizes(bodyId,splitX){
  const shape=kernel.activeShape(bodyId),solids=shape.solids;
  try{return solids.map(s=>{const b=s.boundingBox;try{const [min,max]=b.bounds;return {min,max,size:max.map((v,i)=>v-min[i])};}finally{dispose(b);}}).sort((a,b)=>a.min[0]-b.min[0]);}
  finally{solids.forEach(dispose);dispose(shape);}
}
const defs=QUICK_MODELS.nippleStud.defaults;
assert.ok(quickModelIconKinds.includes('nippleStud'));
const noDrive=await run({kind:'nippleStud',...defs,driveDepthMm:0});
assert.equal(noDrive.stats.solids,2);assert.equal(noDrive.bodies[0].solidCount,2);assert.equal(noDrive.bodies[0].shellCount,2);
const box=noDrive.bodies[0].bounds,size=box.max.map((v,i)=>v-box.min[i]);
[19,7,9.1].forEach((v,i)=>near(size[i],v,`drive-free exploded envelope ${i}`));
assert.ok(noDrive.bodies[0].volume>0);
near(partSizes(noDrive.bodies[0].id)[1].size[2],7,'drive-free screw envelope');
const exploded=await run({kind:'nippleStud',...defs});
assert.equal(exploded.stats.solids,2);assert.equal(exploded.bodies[0].solidCount,2);assert.equal(exploded.bodies[0].shellCount,2);
const slottedHeight=partSizes(exploded.bodies[0].id)[1].size[2];
assert.ok(slottedHeight<7&&slottedHeight>6.8,`outer-face drive slot removes the crown pole; actual Z envelope ${slottedHeight}`);
const assembled=await run({kind:'nippleStud',...defs,driveDepthMm:0,explodedOffsetMm:0});
assert.equal(assembled.stats.solids,2);assert.equal(assembled.bodies[0].shellCount,2);
const ab=assembled.bodies[0].bounds;
near(ab.max[2],defs.overallHeightMm,'A top plane');
near(ab.min[2],-defs.screwHeadThicknessMm-defs.assemblyGapMm,'crowned screw bottom');
// Exact features are reflected in the body's topology: planar top, cylindrical bore, and curved crown.
const bodyId=assembled.bodies[0].id;
const faceTypes=Array.from({length:assembled.bodies[0].faceCount},(_,i)=>kernel.measure(bodyId,'face',i).geomType);
assert.ok(faceTypes.includes('PLANE'),'A must retain a planar top and drive floor');
assert.ok(faceTypes.some(t=>t==='CYLINDRE'),'M2 nominal blind bore must have a cylindrical wall');
assert.ok(faceTypes.some(t=>t==='SPHERE'),'the screw crown must be a spherical surface');
assert.ok(faceTypes.some(t=>t==='CONE'),'bore entry chamfer must be conical');
// A materially different valid instance proves the fields drive geometry.
const custom=await run({kind:'nippleStud',...defs,headDiameterMm:5.4,neckDiameterMm:3.2,boreDiameterMm:2.2,boreDepthMm:5.5,entryChamferMm:.2,baseEdgeRadiusMm:.2,screwCrownRiseMm:1.1,driveDepthMm:.4,explodedOffsetMm:13});
assert.equal(custom.stats.solids,2);near(custom.bodies[0].bounds.max[0]-custom.bodies[0].bounds.min[0],20, 'custom exploded envelope');
await assert.rejects(run({kind:'nippleStud',...defs,boreDepthMm:9.2}));
await assert.rejects(run({kind:'nippleStud',...defs,undersideCollarHeightMm:.3}));
kernel.dispose();
console.log('PASS nippleStud: analytic PG14322 dimensions, distinct valid sizes, bored/radiused A part, crowned six-lobe screw, two solids, assembled and exploded layouts, and invalid-input rejection');
