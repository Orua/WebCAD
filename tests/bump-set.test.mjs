import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {CadKernel} from '../src/cad-kernel.js';
import {normalizeOperationParams} from '../src/operation-registry.js';
import {topologyDetails} from '../src/smooth-transition.js';
test('batch spherical bumps fuse and blend only their actual source seams',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),params={bumps:[{centerMm:[4.9,0,0],radiusMm:1},{centerMm:[0,4.9,0],radiusMm:1}],blendRadiusMm:.1};
  try{
    normalizeOperationParams('bumpSet',params);
    const result=await kernel.rebuild({version:2,imports:{},features:[{id:'body',op:'sphere',params:{radius:5},refs:[]},{id:'bumps',op:'bumpSet',params,refs:['body']}]});
    console.log(JSON.stringify({volumeMm3:result.bodies[0].volume,sharpEdges:topologyDetails(kernel.shapes.get('bumps')).filter(row=>row.sharp).length,blend:result.bodies[0].blendRadiusReport}));
    assert.equal(result.bodies[0].solidCount,1);assert(result.bodies[0].volume>4/3*Math.PI*125);assert.equal(result.bodies[0].blendRadiusReport.status,'applied');assert.equal(result.bodies[0].blendRadiusReport.radiusUsedMm,.1);assert.equal(result.bodies[0].booleanReport.strategy,'multi-fuse');
  }finally{kernel.dispose();}
});

test('ellipsoid bumps use exact three-axis geometry in the same one-pass pipeline',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),params={bumps:[{centerMm:[4.9,0,0],radiiMm:[1,.8,.6]}],blendRadiusMm:.05};
  try{
    normalizeOperationParams('bumpSet',params);const result=await kernel.rebuild({version:2,imports:{},features:[{id:'body',op:'sphere',params:{radius:5},refs:[]},{id:'ellipsoid-bump',op:'bumpSet',params,refs:['body']}]});
    assert.equal(result.bodies[0].solidCount,1);assert(result.bodies[0].volume>4/3*Math.PI*125);assert.equal(result.bodies[0].blendRadiusReport.status,'applied');console.log(JSON.stringify({case:'ellipsoid-bump',volumeMm3:result.bodies[0].volume,blend:result.bodies[0].blendRadiusReport}));
  }finally{kernel.dispose();}
});

test('twenty-four spherical bumps share one fuse and one seam blend',async()=>{
  const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}),kernel=new CadKernel(oc),bumps=Array.from({length:24},(_,i)=>{const z=1-2*(i+.5)/24,r=Math.sqrt(1-z*z),angle=i*Math.PI*(3-Math.sqrt(5));return {centerMm:[r*Math.cos(angle)*4.8,r*Math.sin(angle)*4.8,z*4.8],radiusMm:.7};});
  try{
    const start=performance.now(),result=await kernel.rebuild({version:2,imports:{},features:[{id:'body',op:'sphere',params:{radius:5},refs:[]},{id:'bumps',op:'bumpSet',params:{bumps,blendRadiusMm:.06},refs:['body']}]});
    const sharp=topologyDetails(kernel.shapes.get('bumps')).filter(row=>row.sharp).length;assert.equal(sharp,0);assert.equal(result.bodies[0].blendRadiusReport.status,'applied');assert.equal(result.bodies[0].solidCount,1);console.log(JSON.stringify({case:'24-bumps',ms:performance.now()-start,volumeMm3:result.bodies[0].volume,faces:result.bodies[0].faceCount,sharpEdges:sharp,blend:result.bodies[0].blendRadiusReport}));
  }finally{kernel.dispose();}
});
