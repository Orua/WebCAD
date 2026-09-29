import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {QUICK_MODELS} from '../src/quick-models.js';
import {quickModelIconKinds} from '../src/quick-model-icons.js';

const kernel=new CadKernel(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))}));
const run=params=>kernel.rebuild({version:1,features:[{id:'rivet',op:'quickModel',refs:[],params:{kind:'mushroomRivet',...params},name:'rivet'}],imports:{},hidden:[]});
const near=(actual,expected,label,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,`${label}: ${actual} vs ${expected}`);
function probeVolume(shape,x,y,z,size=.004){const h=size/2,probe=cad.makeBox([x-h,y-h,z-h],[x+h,y+h,z+h]);try{const overlap=probe.intersect(shape);try{return cad.measureVolume(overlap);}finally{overlap.delete();}}finally{probe.delete();}}
const inspect=async params=>{
  const result=await run(params),shape=kernel.activeShape('rivet'),solids=shape.solids;
  try{
    assert.equal(result.stats.solids,2);
    assert.equal(result.bodies[0].solidCount,2);
    assert.equal(solids.length,2);
    const faces=shape.faces;
    try{return {result,faceTypes:faces.map(face=>face.geomType),volume:result.stats.volume};}
    finally{faces.forEach(face=>face.delete?.());}
  }finally{solids.forEach(solid=>solid.delete?.());}
};

assert.ok(quickModelIconKinds.includes('mushroomRivet'));
const defaults=QUICK_MODELS.mushroomRivet.defaults;
const product={...defaults,capDiameterMm:9.94427191,capRiseMm:5,explodedOffsetMm:12};
const productCheck=await inspect(product);
assert.ok(productCheck.faceTypes.includes('SPHERE'),'cap must contain a true spherical face');
assert.ok(productCheck.faceTypes.filter(type=>type==='TORUS').length>=4,'cap rim, tip, waist blends and shoulder must include true toroidal faces');
assert.ok(productCheck.faceTypes.some(type=>type.includes('CYL')),'socket/post bores and cylindrical sections must be real faces; got '+productCheck.faceTypes.join(','));
near(productCheck.result.bodies[0].bounds.min[2],-9,'tip points toward -Z');
near(productCheck.result.bodies[0].bounds.max[2],5,'cap rise');
near(productCheck.result.bodies[0].bounds.max[0]-productCheck.result.bodies[0].bounds.min[0],20.972135955,'exploded X extent',1e-4);
near(defaults.waistRadiusMm+defaults.postOuterDiameterMm/2-defaults.waistDepthMm-defaults.waistRadiusMm,1.13845735,'waist min radius');
near(defaults.collarInnerDiameterMm-defaults.postOuterDiameterMm,.1,'diametral fit clearance');
const productShape=kernel.activeShape('rivet');
assert.ok(probeVolume(productShape,12,0,-2.03741855)>0,'post axis contains material at waist center');
assert.ok(probeVolume(productShape,13.13,0,-2.03741855)>0,'waist material radius is at least 1.13 mm');
assert.equal(probeVolume(productShape,13.15,0,-2.03741855),0,'waist excludes radius 1.15 mm');
assert.equal(probeVolume(productShape,12,0,-4.01),0,'flange blind bore reaches 4 mm from its head face');
assert.ok(probeVolume(productShape,12,0,-3.99)>0,'material remains beyond the 4 mm bore bottom');

const defaultCheck=await inspect({...defaults,explodedOffsetMm:0});
assert.ok(defaultCheck.faceTypes.includes('SPHERE'));
await assert.rejects(run({...defaults,postBoreDepthMm:9}),/切穿浅腰/);
await assert.rejects(run({...defaults,collarInnerDiameterMm:2.7}),/尺寸须满足/);
await assert.rejects(run({...defaults,explodedOffsetMm:4}),/中心距/);

const varied=await inspect({...defaults,capDiameterMm:8,capRiseMm:3,capEdgeRadiusMm:.4,waistDepthMm:.2,waistRadiusMm:2.8,waistCenterFromTipMm:2.1,shoulderHeightMm:.8,explodedOffsetMm:0,postBoreDepthMm:0});
assert.ok(varied.faceTypes.includes('SPHERE'));
assert.ok(varied.faceTypes.filter(type=>type==='TORUS').length>=4);
assert.ok(varied.volume>0);

kernel.dispose();
console.log('PASS mushroomRivet: source dimensions, two connected solids, exact sphere/torus/cylinder faces, cap envelope, blind bore guard and varied dimensions');

