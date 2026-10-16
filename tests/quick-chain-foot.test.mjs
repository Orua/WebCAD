import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {CadKernel} from '../src/cad-kernel.js';
import {buildQuickModel,QUICK_MODELS} from '../src/quick-models/catalog.js';
import {getOperation} from '../src/operation-registry.js';
const oc=await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url))});cad.setOC(oc);
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const samples=[
 {kind:'oChain',sourceVolume:41.605176261897604,tol:.02},
 {kind:'twistedChain',sourceVolume:238.58993819349476,tol:1e-6},
 {kind:'groundChain',sourceVolume:224.3161799432964,tol:.05},
 {kind:'ironFoot',sourceVolume:118.02002167639675,tol:1e-6},
 {kind:'ironFoot',lengthMm:10.5,widthMm:4.8,heightMm:8.5,topHolePitchMm:5.5,endRadiusMm:1.9,taperAngleDeg:4.2,footHoleDiameterMm:2,footHoleHeightMm:1.9,footHoles:'front',sourceVolume:51.87129106520632,tol:1e-6},
 {kind:'ironFoot',lengthMm:26.4,widthMm:6.1,heightMm:15.3,topHoleDiameterMm:2.6,topHolePitchMm:19,endRadiusMm:3.05,footHoleHeightMm:3.05,footHoles:'both',sourceVolume:156.5893027242085,tol:1e-6},
 {kind:'oChain',outerWidthMm:10,outerLengthMm:14,wireDiameterMm:2,gapMm:0},
 {kind:'twistedChain',outerWidthMm:14,outerLengthMm:20,wireDiameterMm:2.5,gapMm:.2},
 {kind:'groundChain',outerWidthMm:14,outerLengthMm:20,wireDiameterMm:2.5,groundThicknessMm:3.6,gapMm:.15,grindRadiusMm:0},
 {kind:'ironFoot',lengthMm:30,widthMm:8,heightMm:16,thicknessMm:.8,endRadiusMm:4,topHolePitchMm:22,footHoleHeightMm:4,footHoles:'both'},
];
const results=[];
for(const sample of samples){const {sourceVolume,tol,...params}=sample;let shape;const start=performance.now();try{shape=buildQuickModel(params,cad);const volume=cad.measureVolume(shape),solids=shape.solids,bb=shape.boundingBox;assert.equal(solids.length,1);solids.forEach(x=>x.delete());assert.ok(volume>0);if(sourceVolume)near(volume,sourceVolume,tol);if(params.kind==='groundChain'){const mesh=shape.mesh({tolerance:.03,angularTolerance:.15}),zs=mesh.vertices.filter((_,i)=>i%3===2);near(Math.min(...zs),0,1e-5);near(Math.max(...zs),params.groundThicknessMm??4.4,1e-5);}results.push({params,volume,sourceVolume,bounds:bb.bounds,ms:performance.now()-start});bb.delete();}finally{shape?.delete();}}
for(const params of [{kind:'oChain',outerWidthMm:2},{kind:'twistedChain',wireDiameterMm:0},{kind:'groundChain',groundThicknessMm:8},{kind:'groundChain',grindRadiusMm:2},{kind:'ironFoot',topHolePitchMm:1},{kind:'ironFoot',taperAngleDeg:20},{kind:'ironFoot',footHoleDiameterMm:8},{kind:'ironFoot',footHoles:'invalid'}])assert.throws(()=>buildQuickModel(params,cad));
const contract=getOperation('quickModel');for(const kind of Object.keys(QUICK_MODELS)){const schema=contract.inputSchema.oneOf.find(s=>s.properties.kind.const===kind);assert.ok(schema);for(const f of QUICK_MODELS[kind].fields){assert.ok(Object.hasOwn(schema.properties,f.key));if(f.min!==undefined)assert.equal(schema.properties[f.key].minimum,f.min);}assert.equal(schema.properties.modelScript,undefined);}
const kernel=new CadKernel(oc);try{const doc={version:1,features:[{id:'chain',op:'quickModel',params:{kind:'twistedChain'},refs:[]}],imports:{},hidden:[]};const before=await kernel.rebuild(structuredClone(doc));doc.features[0].params.outerLengthMm=19;const changed=await kernel.rebuild(structuredClone(doc));assert.ok(changed.stats.volume>before.stats.volume);const reopened=await kernel.rebuild(JSON.parse(JSON.stringify(doc)));near(reopened.stats.volume,changed.stats.volume);}finally{kernel.dispose();}
console.log('PASS source-derived chains and iron-foot: six source comparisons, parameter variants, invalid cases, 51 API schemas and persisted edit/reopen');console.log(JSON.stringify(results));
