import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=async patch=>kernel.rebuild({version:1,features:[{id:'rod',op:'quickModel',refs:[],params:{kind:'hangingRod',...patch},name:'rod'}],imports:{},hidden:[]});
const near=(actual,expected,tolerance,label)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, got ${actual}`);
function probeVolume(shape,x,y,z,size=.08){
  const half=size/2;const probe=cad.makeBox([x-half,y-half,z-half],[x+half,y+half,z+half]);
  try{const overlap=probe.intersect(shape);try{return cad.measureVolume(overlap);}finally{overlap.delete();}}
  finally{probe.delete();}
}
try{
  const defaults=QUICK_MODELS.hangingRod.defaults;
  assert.equal(defaults.barLengthMm,35);assert.equal(defaults.barDiameterMm,5);assert.equal(defaults.endFilletMm,.8);
  assert.equal(defaults.loopInnerWidthMm,7);assert.equal(defaults.loopWireDiameterMm,2);assert.equal(defaults.loopClearHeightMm,6);
  assert.equal(defaults.loopRootDepthMm,2.5);assert.equal(defaults.rootBlendRadiusMm,1);
  const result=await run({});
  assert.equal(result.stats.solids,1);assert.ok(result.stats.volume>0);
  const {min,max}=result.bodies[0].bounds;
  near(max[0]-min[0],35,.01,'overall rod length');near(max[1]-min[1],13,.02,'overall height');near(max[2]-min[2],5,.02,'maximum root depth');
  const endRounds=await kernel.queryGeometry('rod','edge',{curveType:'circle',radiusRangeMm:{min:.799,max:.801}});
  assert.equal(endRounds.matchCount,2,'both rod ends retain R0.8');
  const rootEdges=(await kernel.queryGeometry('rod','edge',{})).items.filter(edge=>edge.bounds&&edge.bounds[0][1]>1.9&&edge.bounds[1][1]<2.6&&Math.abs(edge.bounds[1][0]-edge.bounds[0][0])>3.8);
  assert.equal(rootEdges.length,4,'the four root transitions are spatially local R1 blends');
  assert.ok(rootEdges.every(edge=>edge.bounds[0][2]<-1.5||edge.bounds[1][2]>1.5),'root blend edges follow the thickened Z-depth section');
  const shape=kernel.activeShape('rod');
  assert.ok(probeVolume(shape,4.5,3.6,1.18,.01)>0,'root has material at a point beyond the rod top and outside nominal 2 mm depth');
  assert.ok(probeVolume(shape,5.6,3,0)>0,'outer root fillet contains its source-supported sample point');
  assert.ok(probeVolume(shape,3.4,3,0)>0,'inner root fillet contains its source-supported sample point');
  assert.equal(probeVolume(shape,3.3,3,0,.02),0,'inner root boundary excludes its source-supported outside point');
  assert.ok(probeVolume(shape,0,9.5,.9)>0,'top section has material within its 2 mm depth');
  assert.equal(probeVolume(shape,0,9.5,1.03,.01),0,'top section ends at 2 mm depth');

  const variant=await run({barLengthMm:40,loopClearHeightMm:8,loopWireDiameterMm:2.2,loopRootDepthMm:3,rootBlendRadiusMm:0});
  assert.equal(variant.stats.solids,1);assert.ok(variant.stats.volume>0);
  near(variant.bodies[0].bounds.max[0]-variant.bodies[0].bounds.min[0],40,.02,'variant rod length');
  const variantShape=kernel.activeShape('rod');
  assert.ok(probeVolume(variantShape,5.65,3.6,0,.02)>0,'non-default section width follows 2.2 mm wire diameter');
  assert.ok(probeVolume(variantShape,4.6,3.6,1.4)>0,'non-default 3 mm root depth remains real material');
  assert.ok(await kernel.queryGeometry('rod','edge',{curveType:'circle',radiusRangeMm:{min:.799,max:.801}}).then(value=>value.matchCount===2),'variant retains both end rounds');
  await assert.rejects(run({loopRootDepthMm:1.5}),/根部Z深度/);
}finally{kernel.dispose();}
console.log('PASS hangingRod: exact source envelope, four local root blends, root/top material probes, end R0.8 and non-default instance');
